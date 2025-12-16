from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import limiter, RateLimits
from app.models import Document as DocumentModel, DocumentCategory, Session as SessionModel, User
from app.schemas import DocumentUploadResponse, DocumentResponse, DocumentUpdate, DocumentListResponse
from app.services import s3_service, document_processor
from app.services.openai_service import openai_service
from app.services.journal_service import JournalService
from app.services.security_service import SecurityService
from app.api.auth import get_current_user
from app.api.permissions import check_session_access
from typing import List, Optional
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


ALLOWED_CONTENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
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

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB for document manager
MAX_CONVERSATION_FILE_SIZE = 20 * 1024 * 1024  # 20MB for conversation uploads


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
            if is_conversation_upload:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds {int(MAX_CONVERSATION_FILE_SIZE / 1024 / 1024)}MB limit for conversation. For larger files (up to 50MB), use the Documents page."
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum allowed size of {int(MAX_FILE_SIZE / 1024 / 1024)}MB"
                )

        # Generate unique S3 key (with optional environment prefix for shared buckets)
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
        s3_key = s3_service.get_prefixed_key(f"documents/{session_id}/{uuid.uuid4()}.{file_extension}")

        # Upload to S3
        upload_success = await s3_service.upload_file(file_content, s3_key, file.content_type)

        if not upload_success:
            raise HTTPException(status_code=500, detail="Failed to upload file to storage")

        # Extract text from document (runs in thread pool)
        extracted_text = await document_processor.extract_text(file_content, file.content_type)

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
                content_type=file.content_type,
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
            content_type=file.content_type,
            extracted_text=extracted_text,
            category=doc_category,
            ai_description=ai_description
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        # Create journal entry from document content (only for management page uploads)
        # Conversation uploads skip this and synthesize when the document is used in conversation
        skip_synthesis = skip_journal_synthesis.lower() == "true"

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
                    content_type=file.content_type,
                    extracted_text=extracted_text or "",  # Fallback only if URL unavailable
                    entry_date=entry_date,
                    document_id=document.id,
                    user_id=current_user.id
                )

                if synthesis_result.should_create and len(synthesis_result.suggested_entries) > 0:
                    logger.info(f"Created {len(synthesis_result.suggested_entries)} comprehensive journal entries from document upload")
                else:
                    logger.info("No journal entries created from document upload (not journal-worthy)")

            except Exception as e:
                # Log but don't fail the upload if journal synthesis fails
                logger.warning(f"Failed to create journal entry from document upload: {e}")
        else:
            logger.info("Skipping journal synthesis for conversation document upload (will synthesize in conversation)")

        # Generate presigned URLs for immediate display in conversation
        # For images, use media_url; for PDFs, use thumbnail_url
        media_url = None
        thumbnail_url = None

        if file.content_type.startswith('image/'):
            # For images, generate media_url from the document's s3_key
            media_url = s3_service.generate_presigned_url(s3_key)
        elif file.content_type == 'application/pdf' and thumbnail_s3_key:
            # For PDFs, generate thumbnail_url
            thumbnail_url = s3_service.generate_presigned_url(thumbnail_s3_key)

        # Add URLs to document for response
        document.media_url = media_url
        document.thumbnail_url = thumbnail_url

        return document

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

        raise HTTPException(status_code=500, detail=f"Error uploading document: {str(e)}")


@router.get("/session/{session_id}", response_model=DocumentListResponse)
async def get_session_documents(
    session_id: str,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
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

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    documents = query.order_by(DocumentModel.uploaded_at.desc()).offset(offset).limit(limit).all()

    return DocumentListResponse(
        documents=documents,
        has_more=(offset + len(documents)) < total,
        total=total
    )


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
    """Update a document's AI description"""
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

    db.commit()
    db.refresh(document)

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

    url = s3_service.generate_presigned_url(document.thumbnail_s3_key)

    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail URL")

    return {"thumbnail_url": url}
