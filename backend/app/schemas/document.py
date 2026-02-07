from pydantic import BaseModel, field_serializer
from datetime import datetime
from typing import Optional

from app.schemas.source_tag import SourceTagInfo


class DocumentUploadResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    uploaded_at: datetime
    extracted_text: Optional[str] = None
    category: Optional[str] = None
    ai_description: Optional[str] = None
    media_url: Optional[str] = None  # For images
    thumbnail_url: Optional[str] = None  # For PDFs
    processing_warning: Optional[str] = None  # Warning about extraction issues
    extraction_method: Optional[str] = None  # 'native', 'ocr', 'partial_ocr', 'failed'

    @field_serializer('category')
    def serialize_category(self, category, _info):
        """Convert enum to string value for backward compatibility"""
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: int
    session_id: str
    filename: str
    content_type: str
    extracted_text: Optional[str] = None
    uploaded_at: datetime
    category: Optional[str] = None
    ai_description: Optional[str] = None
    # Source tracking for collaborative sessions
    uploaded_by: Optional[SourceTagInfo] = None
    last_edited_by: Optional[SourceTagInfo] = None

    @field_serializer('category')
    def serialize_category(self, category, _info):
        """Convert enum to string value for backward compatibility"""
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True


class DocumentUpdate(BaseModel):
    ai_description: Optional[str] = None
    category: Optional[str] = None


class DocumentListResponse(BaseModel):
    """Paginated response for document list"""
    documents: list[DocumentResponse]
    has_more: bool
    total: int


class DuplicateCheckRequest(BaseModel):
    session_id: str
    filenames: list[str]


class DuplicateMatch(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    category: Optional[str] = None

    @field_serializer('category')
    def serialize_category(self, category, _info):
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True


class DuplicateCheckResponse(BaseModel):
    duplicates: list[DuplicateMatch]
