from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.models import Document as DocumentModel, DocumentCategory, Session as SessionModel, User
from app.schemas import DocumentUploadResponse, DocumentResponse, DocumentUpdate, DocumentListResponse, DuplicateCheckRequest, DuplicateCheckResponse
from app.services import s3_service, document_processor
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.services.security_service import SecurityService
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from app.api.source_tags import session_has_collaborators, build_source_tag_info, get_user_map
from typing import List, Optional
from PIL import Image
from io import BytesIO
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


ALLOWED_CONTENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/mpo",  # Multi-Picture Object (stereoscopic images from iPhone, etc.) - converted to JPEG
    "text/plain",
]

# Explicitly blocked file types for security
BLOCKED_FILE_EXTENSIONS = [
    # Medical imaging files (DICOM and other formats)
    '.dcm', '.dicom', '.nii', '.nrrd', '.mha', '.mhd',
    # Executable files
    '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.msi', '.app', '.dmg', '.deb', '.rpm',
    # Script files
    '.js', '.py', '.php', '.pl', '.rb', '.lua', '.vbs',
    # Archive files (could contain anything)
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.tgz', '.xz',
    # Office files with macros
    '.xlsm', '.docm', '.pptm',
    # Database files
    '.db', '.sqlite', '.mdb',
    # Other binary/data files
    '.bin', '.dat', '.dll', '.so', '.dylib',
]

BLOCKED_MIME_TYPES = [
    # Medical imaging
    'application/dicom',
    # Executables
    'application/x-executable', 'application/x-msdos-program', 'application/x-msdownload',
    # Archives
    'application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed',
    'application/x-rar-compressed', 'application/x-bzip2',
    # Scripts
    'application/javascript', 'application/x-python-code', 'application/x-php',
    'text/javascript', 'application/x-sh',
]

MAX_FILE_SIZE = 30 * 1024 * 1024  # 30MB (OpenAI file URL limit is 32MB)
MAX_CONVERSATION_FILE_SIZE = 30 * 1024 * 1024  # 30MB for conversation uploads

# Image formats supported by OpenAI GPT-5.2
OPENAI_SUPPORTED_IMAGE_FORMATS = ['JPEG', 'PNG', 'GIF', 'WEBP']


def process_and_validate_image(file_content: bytes, content_type: str) -> tuple[bytes, str, bool, str]:
    """
    Validate and process image content, converting MPO to JPEG if needed.

    MPO (Multi-Picture Object) files contain multiple JPEG images (typically for
    stereoscopic/3D photos). These are common from iPhones and appear as .jpeg to
    users but get rejected due to the MPO container format. We extract the primary
    image and convert to standard JPEG.

    Returns:
        tuple: (processed_content, processed_content_type, is_valid, error_message)
    """
    if not content_type.startswith('image/'):
        return file_content, content_type, True, ""  # Not an image, skip processing

    try:
        # Try to open the image with PIL
        img = Image.open(BytesIO(file_content))

        # Verify the image can be fully loaded (catches truncated/corrupted images)
        img.verify()

        # Re-open after verify (verify() can only be called once)
        img = Image.open(BytesIO(file_content))

        # Handle MPO format - convert to JPEG by extracting the primary image
        if img.format == 'MPO':
            logger.info(f"Converting MPO image to JPEG (original frames: {getattr(img, 'n_frames', 1)})")
            # MPO opens to the primary image by default, just save as JPEG
            output = BytesIO()
            # Convert to RGB if necessary (handles RGBA, P mode, etc.)
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
            img.save(output, format='JPEG', quality=95)
            file_content = output.getvalue()
            content_type = 'image/jpeg'
            # Re-open the converted image for further validation
            img = Image.open(BytesIO(file_content))

        # Check if format is supported by OpenAI
        if img.format not in OPENAI_SUPPORTED_IMAGE_FORMATS:
            return file_content, content_type, False, f"Image format '{img.format}' is not supported by the AI. Supported formats: JPEG, PNG, GIF, WEBP."

        # Check image dimensions (OpenAI has limits, but they're generous)
        width, height = img.size
        if width < 10 or height < 10:
            return file_content, content_type, False, "Image is too small. Minimum dimensions are 10x10 pixels."

        # Very large images may cause issues - warn but don't block
        if width > 8192 or height > 8192:
            logger.warning(f"Large image uploaded: {width}x{height} pixels")

        return file_content, content_type, True, ""

    except Exception as e:
        error_msg = str(e)
        logger.warning(f"Image validation failed: {error_msg}")

        # Provide user-friendly error messages
        if "cannot identify image file" in error_msg.lower():
            return file_content, content_type, False, "The file appears to be corrupted or is not a valid image. Please try uploading a different file."
        elif "truncated" in error_msg.lower():
            return file_content, content_type, False, "The image file appears to be incomplete or corrupted. Please try uploading again."
        else:
            return file_content, content_type, False, "Unable to process this image. Please ensure it's a valid JPEG, PNG, GIF, or WEBP file."


def validate_pdf_content(file_content: bytes) -> tuple[bool, str, str]:
    """
    Validate that file content is a valid, readable PDF.

    Returns:
        tuple: (is_valid, error_message, warning_message)
        - is_valid: True if PDF can be processed
        - error_message: Non-empty if PDF should be rejected
        - warning_message: Non-empty if PDF will work but may have issues
    """
    # Basic header check
    if len(file_content) < 5:
        return False, "File too small to be a valid PDF", ""

    if not file_content[:5] == b'%PDF-':
        return False, "File does not appear to be a valid PDF (invalid header)", ""

    # Try to actually parse the PDF
    try:
        from pypdf import PdfReader
        from io import BytesIO

        pdf_file = BytesIO(file_content)
        pdf_reader = PdfReader(pdf_file)

        page_count = len(pdf_reader.pages)
        if page_count == 0:
            return False, "PDF has no pages", ""

        # Check if we can extract text from at least one page
        has_extractable_text = False
        pages_checked = min(page_count, 3)  # Check first 3 pages

        for i in range(pages_checked):
            try:
                text = pdf_reader.pages[i].extract_text()
                if text and text.strip():
                    has_extractable_text = True
                    break
            except Exception:
                pass  # Page extraction failed, try next

        # If no extractable text, it may be a scanned PDF
        # This is OK - OCR will handle it - but warn the user
        if not has_extractable_text:
            return True, "", "This PDF appears to be scanned/image-based. Text extraction will use OCR, which may take longer."

        return True, "", ""

    except Exception as e:
        error_msg = str(e).lower()

        if "password" in error_msg or "encrypted" in error_msg:
            return False, "This PDF is password-protected. Please provide an unencrypted version.", ""
        elif "corrupted" in error_msg or "invalid" in error_msg:
            return False, "This PDF appears to be corrupted and cannot be read.", ""
        else:
            # Log the error for debugging
            logger.warning(f"PDF validation failed: {e}")
            return False, "Unable to process this PDF. Please ensure it is not corrupted.", ""


@router.post("/upload", response_model=DocumentUploadResponse)
@limiter.limit(RateLimits.FILE_UPLOAD)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = None,
    skip_journal_synthesis: str = "false",  # "true" for conversation uploads, "false" for management uploads
    user_date: str = None,  # User's local date in YYYY-MM-DD format
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a medical document"""
    security_service = SecurityService()

    # Check for abuse patterns (repeated upload failures)
    ip_address = security_service.get_client_ip(request)
    abuse_check = security_service.check_repeated_upload_failures(
        db=db,
        user_id=current_user.id,
        ip_address=ip_address,
        time_window_minutes=15,
        threshold=10
    )

    if abuse_check["abuse_detected"]:
        # Log the abuse detection
        logger.warning(
            f"Potential upload abuse detected: User {current_user.email} / IP {ip_address} "
            f"has {abuse_check['failure_count']} upload failures in {abuse_check['time_window']} minutes"
        )
        # Note: We log but don't block - admin can review security logs
        # If needed, admin can manually disable account

    # Validate session
    if session_id:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        # Verify session belongs to current user
        check_session_access(session, current_user.id, db)
    else:
        # Create new session if none provided
        session = SessionModel(
            user_id=current_user.id,
            owner_id=current_user.id
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    # Check for blocked file extensions
    file_extension = ('.' + file.filename.split('.')[-1].lower()) if '.' in file.filename else ''
    if file_extension in BLOCKED_FILE_EXTENSIONS:
        # Log security event for blocked file type attempt
        security_service.log_event(
            db=db,
            event_type="blocked_file_upload",
            email=current_user.email,
            user_id=current_user.id,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint="/api/documents/upload",
            details=f"Blocked file extension: {file_extension}, filename: {file.filename}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_extension}' is not allowed for security reasons. Allowed types: PDF, PNG, JPG, TXT"
        )

    # Check for blocked MIME types
    if file.content_type in BLOCKED_MIME_TYPES:
        # Log security event for blocked MIME type attempt
        security_service.log_event(
            db=db,
            event_type="blocked_file_upload",
            email=current_user.email,
            user_id=current_user.id,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint="/api/documents/upload",
            details=f"Blocked MIME type: {file.content_type}, filename: {file.filename}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' is not allowed for security reasons. Allowed types: PDF, PNG, JPG, TXT"
        )

    # Validate file type against allowed types
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        # Log upload failure for monitoring
        security_service.log_event(
            db=db,
            event_type="upload_failure",
            email=current_user.email,
            user_id=current_user.id,
            ip_address=security_service.get_client_ip(request),
            user_agent=security_service.get_user_agent(request),
            endpoint="/api/documents/upload",
            details=f"Invalid file type: {file.content_type}, filename: {file.filename}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed. Allowed types: PDF, PNG, JPG, TXT"
        )

    # Read file content
    file_content = await file.read()

    try:
        # Validate file size (different limits for conversation vs document manager)
        is_conversation_upload = skip_journal_synthesis.lower() == "true"
        max_size = MAX_CONVERSATION_FILE_SIZE if is_conversation_upload else MAX_FILE_SIZE

        if len(file_content) > max_size:
            # Log upload failure for monitoring
            security_service.log_event(
                db=db,
                event_type="upload_failure",
                email=current_user.email,
                user_id=current_user.id,
                ip_address=security_service.get_client_ip(request),
                user_agent=security_service.get_user_agent(request),
                endpoint="/api/documents/upload",
                details=f"File size exceeds limit: {len(file_content)} bytes, filename: {file.filename}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {int(MAX_FILE_SIZE / 1024 / 1024)}MB"
            )

        # Validate and process image content if this is an image file
        # This also handles MPO to JPEG conversion for stereoscopic images
        actual_content_type = file.content_type
        if file.content_type.startswith('image/'):
            file_content, actual_content_type, is_valid, error_message = process_and_validate_image(file_content, file.content_type)
            if not is_valid:
                # Log upload failure for monitoring
                security_service.log_event(
                    db=db,
                    event_type="upload_failure",
                    email=current_user.email,
                    user_id=current_user.id,
                    ip_address=security_service.get_client_ip(request),
                    user_agent=security_service.get_user_agent(request),
                    endpoint="/api/documents/upload",
                    details=f"Invalid image content: {error_message}, filename: {file.filename}"
                )
                raise HTTPException(
                    status_code=400,
                    detail=error_message
                )

        # Validate PDF content if this is a PDF file
        pdf_warning = None
        if file.content_type == "application/pdf":
            is_valid, error_message, pdf_warning = validate_pdf_content(file_content)
            if not is_valid:
                security_service.log_event(
                    db=db,
                    event_type="upload_failure",
                    email=current_user.email,
                    user_id=current_user.id,
                    ip_address=security_service.get_client_ip(request),
                    user_agent=security_service.get_user_agent(request),
                    endpoint="/api/documents/upload",
                    details=f"Invalid PDF content: {error_message}, filename: {file.filename}"
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid PDF file: {error_message}"
                )

        # Generate unique S3 key (with optional environment prefix for shared buckets)
        # Use correct extension based on actual content type (e.g., .jpg for converted MPO files)
        if actual_content_type == 'image/jpeg':
            file_extension = 'jpg'
        elif actual_content_type == 'image/png':
            file_extension = 'png'
        else:
            file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
        s3_key = s3_service.get_prefixed_key(f"documents/{session_id}/{uuid.uuid4()}.{file_extension}")

        # Upload to S3 (with Content-Disposition header for security)
        upload_success = await s3_service.upload_file(file_content, s3_key, actual_content_type, file.filename)

        if not upload_success:
            raise HTTPException(status_code=500, detail="Failed to upload file to storage")

        # Extract text from document (runs in thread pool)
        # For PDFs, use the method that returns extraction method info
        extraction_method = None
        if actual_content_type == "application/pdf":
            extracted_text, extraction_method = await document_processor.extract_text_from_pdf_with_method(file_content)
        else:
            extracted_text = await document_processor.extract_text(file_content, actual_content_type)

        # Generate and upload thumbnail for PDFs (runs in thread pool)
        thumbnail_s3_key = None
        if file.content_type == "application/pdf":
            thumbnail_bytes = await document_processor.generate_pdf_thumbnail(file_content)
            if thumbnail_bytes:
                thumbnail_s3_key = s3_service.get_prefixed_key(f"thumbnails/{session_id}/{uuid.uuid4()}.png")
                thumbnail_upload_success = await s3_service.upload_file(
                    thumbnail_bytes,
                    thumbnail_s3_key,
                    "image/png"
                )
                if not thumbnail_upload_success:
                    logger.warning(f"Failed to upload thumbnail for {file.filename}")
                    thumbnail_s3_key = None

        # Use AI to categorize document and generate description
        # Wrapped in try/except for backward compatibility - if AI fails, document still uploads
        doc_category = None
        ai_description = None
        try:
            # Generate presigned URL for native GPT file processing
            document_url = s3_service.generate_presigned_url(s3_key)

            categorization = await openai_service.categorize_document(
                filename=file.filename,
                content_type=actual_content_type,
                document_url=document_url,
                extracted_text=extracted_text or "",
                user_id=current_user.id
            )
            # Convert category string to enum (with fallback to OTHER)
            try:
                doc_category = DocumentCategory(categorization["category"])
            except (ValueError, KeyError):
                doc_category = DocumentCategory.OTHER
            ai_description = categorization.get("description", "")
        except Exception as e:
            logger.warning(f"AI categorization failed for {file.filename}: {e}. Document will upload without category.")
            # Leave doc_category and ai_description as None for backward compatibility

        # Create document record with AI metadata (or None if AI failed)
        document = DocumentModel(
            session_id=session_id,
            filename=file.filename,
            s3_key=s3_key,
            thumbnail_s3_key=thumbnail_s3_key,
            content_type=actual_content_type,  # Store the actual content type (e.g., image/jpeg for converted MPO)
            extracted_text=extracted_text,
            category=doc_category,
            ai_description=ai_description,
            uploaded_by_user_id=current_user.id  # Track uploader for collaborative sessions
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        # Create journal entry from document content (only for management page uploads)
        # Conversation uploads skip this and synthesize when the document is used in conversation
        skip_synthesis = skip_journal_synthesis.lower() == "true"
        synthesis_warning = None  # Will be set if synthesis has warnings

        if not skip_synthesis:
            try:
                journal_service = JournalService(db)

                # Use user's local date if provided, otherwise server date
                from datetime import date as date_type
                if user_date:
                    try:
                        entry_date = date_type.fromisoformat(user_date)
                    except ValueError:
                        entry_date = date_type.today()
                else:
                    entry_date = date_type.today()

                # Use specialized document synthesis method with native file support
                synthesis_result = await journal_service.synthesize_from_document(
                    filename=file.filename,
                    ai_description=ai_description or "",
                    session_id=session_id,
                    document_url=document_url,  # Use presigned URL for native file support
                    content_type=actual_content_type,
                    extracted_text=extracted_text or "",  # Fallback only if URL unavailable
                    entry_date=entry_date,
                    document_id=document.id,
                    user_id=current_user.id
                )

                if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
                    logger.info(f"Created {len(synthesis_result.suggested_entries)} comprehensive journal entries from document upload")
                else:
                    logger.info("No journal entries created from document upload (not journal-worthy)")

                # Capture synthesis warning for user
                synthesis_warning = synthesis_result.warning if synthesis_result else None

            except Exception as e:
                # Log but don't fail the upload if journal synthesis fails
                logger.warning(f"Failed to create journal entry from document upload: {e}")
                synthesis_warning = None
        else:
            logger.info("Skipping journal synthesis for conversation document upload (will synthesize in conversation)")

        # Generate presigned URLs for immediate display in conversation
        # For images, use media_url; for PDFs, use thumbnail_url
        media_url = None
        thumbnail_url = None

        if actual_content_type.startswith('image/'):
            # For images, generate media_url from the document's s3_key
            media_url = s3_service.generate_presigned_url(s3_key)
        elif actual_content_type == 'application/pdf' and thumbnail_s3_key:
            # For PDFs, generate thumbnail_url (6 hours for thumbnails)
            thumbnail_url = s3_service.generate_presigned_url(thumbnail_s3_key, expiration=21600)

        # Build processing warning from various sources
        warnings = []
        if pdf_warning:
            warnings.append(pdf_warning)
        if actual_content_type == "application/pdf":
            if extraction_method == "ocr":
                warnings.append("Text was extracted using OCR. Please verify accuracy.")
            elif extraction_method == "partial_ocr":
                warnings.append("Only the first 100 pages were processed due to document length.")
            elif extraction_method == "failed" and not extracted_text:
                warnings.append("Text extraction failed. The AI will analyze the document visually.")
        if synthesis_warning:
            warnings.append(synthesis_warning)

        processing_warning = " ".join(warnings) if warnings else None

        # Build response with all fields
        return DocumentUploadResponse(
            id=document.id,
            filename=document.filename,
            content_type=document.content_type,
            uploaded_at=document.uploaded_at,
            extracted_text=document.extracted_text,
            category=document.category.value if document.category else None,
            ai_description=document.ai_description,
            media_url=media_url,
            thumbnail_url=thumbnail_url,
            processing_warning=processing_warning,
            extraction_method=extraction_method
        )

    except HTTPException:
        # Re-raise HTTP exceptions (validation errors, etc.)
        raise
    except Exception as e:
        # Log unexpected errors to database
        try:
            from app.services.error_logger import log_database_error
            log_database_error(
                db=db,
                source="api.documents.upload_document",
                error=e,
                user_id=current_user.id,
                session_id=session_id,
                details={
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "file_size": len(file_content)
                }
            )
        except Exception:
            pass  # Don't let error logging crash the app

        raise HTTPException(status_code=500, detail="Error uploading document. Please try again.")


@router.post("/check-duplicate", response_model=DuplicateCheckResponse)
async def check_duplicate(
    body: DuplicateCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if documents with the same filenames already exist in a session."""
    session = db.query(SessionModel).filter(SessionModel.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    matches = db.query(DocumentModel).filter(
        DocumentModel.session_id == body.session_id,
        DocumentModel.filename.in_(body.filenames)
    ).order_by(DocumentModel.uploaded_at.desc()).all()

    return DuplicateCheckResponse(
        duplicates=[
            {
                "id": doc.id,
                "filename": doc.filename,
                "uploaded_at": doc.uploaded_at,
                "category": doc.category
            }
            for doc in matches
        ]
    )


@router.get("/session/{session_id}", response_model=DocumentListResponse)
async def get_session_documents(
    session_id: str,
    category: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=100),
    date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get documents for a session with optional filtering, search, and pagination"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify user has access to session (owner or collaborator)
    check_session_access(session, current_user.id, db)

    query = db.query(DocumentModel).filter(DocumentModel.session_id == session_id)

    # Filter by category if provided
    if category and category != "all":
        try:
            cat_enum = DocumentCategory(category)
            query = query.filter(DocumentModel.category == cat_enum)
        except ValueError:
            # Invalid category, ignore filter
            pass

    # Search by filename or AI description if provided
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (DocumentModel.filename.ilike(search_term)) |
            (DocumentModel.ai_description.ilike(search_term))
        )

    # Filter by date if provided
    if date:
        from datetime import date as date_type
        from sqlalchemy import cast
        from sqlalchemy import Date as SQLDate
        try:
            parsed_date = date_type.fromisoformat(date)
            query = query.filter(cast(DocumentModel.uploaded_at, SQLDate) == parsed_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    documents = query.order_by(DocumentModel.uploaded_at.desc()).offset(offset).limit(limit).all()

    # Check if session has collaborators (for source tag attribution)
    has_collaborators = session_has_collaborators(session_id, db)

    # Build response with source tags if session has collaborators
    doc_responses = []
    if has_collaborators:
        # Batch load user info for source tags
        user_ids = []
        for doc in documents:
            if doc.uploaded_by_user_id:
                user_ids.append(doc.uploaded_by_user_id)
            if doc.last_edited_by_user_id:
                user_ids.append(doc.last_edited_by_user_id)
        user_map = get_user_map(user_ids, db)

        for doc in documents:
            doc_dict = {
                "id": doc.id,
                "session_id": doc.session_id,
                "filename": doc.filename,
                "content_type": doc.content_type,
                "extracted_text": doc.extracted_text,
                "uploaded_at": doc.uploaded_at,
                "category": doc.category.value if doc.category else None,
                "ai_description": doc.ai_description,
                "uploaded_by": build_source_tag_info(user_map.get(doc.uploaded_by_user_id)) if doc.uploaded_by_user_id else None,
                "last_edited_by": build_source_tag_info(user_map.get(doc.last_edited_by_user_id)) if doc.last_edited_by_user_id else None
            }
            doc_responses.append(doc_dict)
    else:
        # No collaborators, just convert documents to response format
        for doc in documents:
            doc_dict = {
                "id": doc.id,
                "session_id": doc.session_id,
                "filename": doc.filename,
                "content_type": doc.content_type,
                "extracted_text": doc.extracted_text,
                "uploaded_at": doc.uploaded_at,
                "category": doc.category.value if doc.category else None,
                "ai_description": doc.ai_description,
                "uploaded_by": None,
                "last_edited_by": None
            }
            doc_responses.append(doc_dict)

    return DocumentListResponse(
        documents=doc_responses,
        has_more=(offset + len(documents)) < total,
        total=total
    )


@router.get("/session/{session_id}/dates")
async def get_document_dates(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all distinct dates that have documents, with counts."""
    from sqlalchemy import func, desc, cast
    from sqlalchemy import Date as SQLDate

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    date_col = cast(DocumentModel.uploaded_at, SQLDate)
    rows = (
        db.query(
            date_col.label("upload_date"),
            func.count(DocumentModel.id).label("entry_count")
        )
        .filter(DocumentModel.session_id == session_id)
        .group_by(date_col)
        .order_by(desc(date_col))
        .all()
    )

    return {
        "dates": [
            {"date": row.upload_date.isoformat(), "entry_count": row.entry_count}
            for row in rows
        ]
    }


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document details"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    return document


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    update_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a document's AI description and/or category"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    # Update AI description
    if update_data.ai_description is not None:
        document.ai_description = update_data.ai_description

    # Update category
    if update_data.category is not None:
        try:
            document.category = DocumentCategory(update_data.category)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {update_data.category}")

    # Track editor for collaborative sessions
    document.last_edited_by_user_id = current_user.id

    db.commit()
    db.refresh(document)

    # Build source tags for response if session has collaborators
    has_collaborators = session_has_collaborators(document.session_id, db)
    if has_collaborators:
        user_ids = [uid for uid in [document.uploaded_by_user_id, document.last_edited_by_user_id] if uid]
        user_map = get_user_map(user_ids, db)

        return {
            "id": document.id,
            "session_id": document.session_id,
            "filename": document.filename,
            "content_type": document.content_type,
            "extracted_text": document.extracted_text,
            "uploaded_at": document.uploaded_at,
            "category": document.category.value if document.category else None,
            "ai_description": document.ai_description,
            "uploaded_by": build_source_tag_info(user_map.get(document.uploaded_by_user_id)) if document.uploaded_by_user_id else None,
            "last_edited_by": build_source_tag_info(user_map.get(document.last_edited_by_user_id)) if document.last_edited_by_user_id else None
        }

    return document


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a document and its associated journal entries"""
    from app.models.journal import JournalEntry

    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    # Delete from S3
    await s3_service.delete_file(document.s3_key)

    # Delete thumbnail if exists
    if document.thumbnail_s3_key:
        await s3_service.delete_file(document.thumbnail_s3_key)

    # Delete associated journal entries (cascade should handle this, but explicit for clarity)
    db.query(JournalEntry).filter(JournalEntry.source_document_id == document_id).delete()

    # Delete from database
    db.delete(document)
    db.commit()

    return {"message": "Document and associated journal entries deleted successfully"}


@router.get("/{document_id}/download-url")
async def get_document_download_url(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get presigned URL for document download"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    url = s3_service.generate_presigned_url(document.s3_key)

    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL")

    return {"download_url": url}


@router.get("/{document_id}/thumbnail-url")
async def get_document_thumbnail_url(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get presigned URL for document thumbnail"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    check_session_access(session, current_user.id, db)

    if not document.thumbnail_s3_key:
        raise HTTPException(status_code=404, detail="No thumbnail available for this document")

    # 6 hours for thumbnails
    url = s3_service.generate_presigned_url(document.thumbnail_s3_key, expiration=21600)

    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail URL")

    return {"thumbnail_url": url}
