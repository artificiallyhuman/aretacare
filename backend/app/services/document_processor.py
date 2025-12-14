from pypdf import PdfReader
from io import BytesIO
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
from typing import Optional
import logging
import asyncio

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Process various document types and extract text"""

    @staticmethod
    def _extract_text_from_pdf_sync(file_content: bytes) -> Optional[str]:
        """Synchronous PDF text extraction (CPU-intensive)"""
        try:
            pdf_file = BytesIO(file_content)
            pdf_reader = PdfReader(pdf_file)

            text_content = []
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    text_content.append(text)

            return "\n\n".join(text_content) if text_content else None
        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            return None

    @staticmethod
    async def extract_text_from_pdf(file_content: bytes) -> Optional[str]:
        """Extract text from PDF file (runs in thread pool)"""
        return await asyncio.to_thread(
            DocumentProcessor._extract_text_from_pdf_sync, file_content
        )

    @staticmethod
    def _extract_text_from_image_sync(file_content: bytes) -> Optional[str]:
        """Synchronous OCR text extraction (CPU-intensive)"""
        try:
            image = Image.open(BytesIO(file_content))
            text = pytesseract.image_to_string(image)
            return text.strip() if text else None
        except Exception as e:
            logger.error(f"Failed to extract text from image: {e}")
            return None

    @staticmethod
    async def extract_text_from_image(file_content: bytes) -> Optional[str]:
        """Extract text from image using OCR (runs in thread pool)"""
        return await asyncio.to_thread(
            DocumentProcessor._extract_text_from_image_sync, file_content
        )

    @staticmethod
    def _generate_pdf_thumbnail_sync(file_content: bytes, max_width: int = 300) -> Optional[bytes]:
        """Synchronous PDF thumbnail generation (CPU-intensive)"""
        try:
            # Convert first page to image
            images = convert_from_bytes(file_content, first_page=1, last_page=1, dpi=150)
            if not images:
                return None

            # Get first page
            first_page = images[0]

            # Resize to thumbnail size while maintaining aspect ratio
            aspect_ratio = first_page.height / first_page.width
            new_width = max_width
            new_height = int(max_width * aspect_ratio)
            thumbnail = first_page.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Convert to bytes
            thumbnail_bytes = BytesIO()
            thumbnail.save(thumbnail_bytes, format='PNG', optimize=True)
            thumbnail_bytes.seek(0)

            return thumbnail_bytes.getvalue()
        except Exception as e:
            logger.error(f"Failed to generate PDF thumbnail: {e}")
            return None

    @staticmethod
    async def generate_pdf_thumbnail(file_content: bytes, max_width: int = 300) -> Optional[bytes]:
        """Generate thumbnail image from first page of PDF (runs in thread pool)"""
        return await asyncio.to_thread(
            DocumentProcessor._generate_pdf_thumbnail_sync, file_content, max_width
        )

    @staticmethod
    async def extract_text(file_content: bytes, content_type: str) -> Optional[str]:
        """Extract text based on content type (async)"""
        if content_type == "application/pdf":
            return await DocumentProcessor.extract_text_from_pdf(file_content)
        elif content_type.startswith("image/"):
            return await DocumentProcessor.extract_text_from_image(file_content)
        elif content_type.startswith("text/"):
            return file_content.decode('utf-8', errors='ignore')
        else:
            logger.warning(f"Unsupported content type: {content_type}")
            return None


document_processor = DocumentProcessor()
