from pydantic import BaseModel, field_serializer
from datetime import datetime
from typing import Optional


class DocumentUploadResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    uploaded_at: datetime
    extracted_text: Optional[str] = None
    category: Optional[str] = None
    ai_description: Optional[str] = None

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

    @field_serializer('category')
    def serialize_category(self, category, _info):
        """Convert enum to string value for backward compatibility"""
        if category is None:
            return None
        return category.value if hasattr(category, 'value') else str(category)

    class Config:
        from_attributes = True
