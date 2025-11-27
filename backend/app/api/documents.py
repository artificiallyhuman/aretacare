from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import Document as DocumentModel, Session as SessionModel, User
from app.schemas import DocumentUploadResponse, DocumentResponse
from app.services import s3_service, document_processor
from app.api.auth import get_current_user
from typing import List
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

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a medical document"""

    # Validate session
    if session_id:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        # Verify session belongs to current user
        if session.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Create new session if none provided
        session = SessionModel(user_id=current_user.id)
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    # Validate file type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed. Allowed types: {', '.join(ALLOWED_CONTENT_TYPES)}"
        )

    # Read file content
    file_content = await file.read()

    # Validate file size
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / 1024 / 1024}MB"
        )

    # Generate unique S3 key
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
    s3_key = f"documents/{session_id}/{uuid.uuid4()}.{file_extension}"

    # Upload to S3
    upload_success = await s3_service.upload_file(file_content, s3_key, file.content_type)

    if not upload_success:
        raise HTTPException(status_code=500, detail="Failed to upload file to storage")

    # Extract text from document
    extracted_text = document_processor.extract_text(file_content, file.content_type)

    # Generate and upload thumbnail for PDFs
    thumbnail_s3_key = None
    if file.content_type == "application/pdf":
        thumbnail_bytes = document_processor.generate_pdf_thumbnail(file_content)
        if thumbnail_bytes:
            thumbnail_s3_key = f"thumbnails/{session_id}/{uuid.uuid4()}.png"
            thumbnail_upload_success = await s3_service.upload_file(
                thumbnail_bytes,
                thumbnail_s3_key,
                "image/png"
            )
            if not thumbnail_upload_success:
                logger.warning(f"Failed to upload thumbnail for {file.filename}")
                thumbnail_s3_key = None

    # Create document record
    document = DocumentModel(
        session_id=session_id,
        filename=file.filename,
        s3_key=s3_key,
        thumbnail_s3_key=thumbnail_s3_key,
        content_type=file.content_type,
        extracted_text=extracted_text
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@router.get("/session/{session_id}", response_model=List[DocumentResponse])
async def get_session_documents(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all documents for a session"""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session belongs to current user
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    documents = db.query(DocumentModel).filter(
        DocumentModel.session_id == session_id
    ).order_by(DocumentModel.uploaded_at.desc()).all()

    return documents


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
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return document


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a document"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify document belongs to current user
    session = db.query(SessionModel).filter(SessionModel.id == document.session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete from S3
    await s3_service.delete_file(document.s3_key)

    # Delete thumbnail if exists
    if document.thumbnail_s3_key:
        await s3_service.delete_file(document.thumbnail_s3_key)

    # Delete from database
    db.delete(document)
    db.commit()

    return {"message": "Document deleted successfully"}


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
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

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
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not document.thumbnail_s3_key:
        raise HTTPException(status_code=404, detail="No thumbnail available for this document")

    url = s3_service.generate_presigned_url(document.thumbnail_s3_key)

    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail URL")

    return {"thumbnail_url": url}
