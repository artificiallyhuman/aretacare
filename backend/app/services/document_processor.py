from pypdf import PdfReader
from io import BytesIO
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
from typing import Optional, Tuple
import logging
import asyncio

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Process various document types and extract text"""

    # OCR configuration
    MAX_OCR_PAGES = 100  # Limit OCR to first 100 pages for memory/time constraints
    OCR_DPI = 200  # Balance between quality and memory usage

    @staticmethod
    def _extract_text_from_pdf_with_ocr_sync(file_content: bytes) -> Tuple[Optional[str], str]:
        """
        Extract text from PDF with OCR fallback for scanned documents.

        Returns:
            tuple: (extracted_text, extraction_method)
            extraction_method is one of: 'native', 'ocr', 'partial_ocr', 'failed'
        """
        try:
            pdf_file = BytesIO(file_content)
            pdf_reader = PdfReader(pdf_file)

            text_content = []
            pages_with_text = 0
            total_pages = len(pdf_reader.pages)

            if total_pages == 0:
                return None, "failed"

            # First pass: try native text extraction
            for page in pdf_reader.pages:
                try:
                    text = page.extract_text()
                    if text and text.strip():
                        text_content.append(text)
                        pages_with_text += 1
                except Exception as page_error:
                    logger.warning(f"Failed to extract text from page: {page_error}")

            # If we got text from most pages (>=50%), return native extraction
            if pages_with_text > 0 and pages_with_text >= total_pages * 0.5:
                return "\n\n".join(text_content), "native"

            # Otherwise, try OCR fallback
            logger.info(f"PDF native extraction yielded {pages_with_text}/{total_pages} pages with text. Attempting OCR...")

            try:
                # Limit pages for OCR to prevent memory issues
                pages_to_ocr = min(total_pages, DocumentProcessor.MAX_OCR_PAGES)

                images = convert_from_bytes(
                    file_content,
                    first_page=1,
                    last_page=pages_to_ocr,
                    dpi=DocumentProcessor.OCR_DPI
                )

                ocr_text_content = []
                for i, image in enumerate(images):
                    try:
                        text = pytesseract.image_to_string(image)
                        if text and text.strip():
                            ocr_text_content.append(f"--- Page {i + 1} ---\n{text.strip()}")
                    except Exception as ocr_page_error:
                        logger.warning(f"OCR failed for page {i + 1}: {ocr_page_error}")
                    finally:
                        # Free memory immediately
                        image.close()

                if ocr_text_content:
                    extraction_method = "ocr" if pages_to_ocr >= total_pages else "partial_ocr"
                    if pages_to_ocr < total_pages:
                        ocr_text_content.append(f"\n\n[OCR limited to first {pages_to_ocr} of {total_pages} pages]")
                    return "\n\n".join(ocr_text_content), extraction_method

                # If OCR also failed but we had some native text, return that
                if text_content:
                    return "\n\n".join(text_content), "native"

                return None, "failed"

            except Exception as ocr_error:
                logger.error(f"OCR fallback failed: {ocr_error}")
                # Return any native text we got, even if partial
                if text_content:
                    return "\n\n".join(text_content), "native"
                return None, "failed"

        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            return None, "failed"

    @staticmethod
    def _extract_text_from_pdf_sync(file_content: bytes) -> Optional[str]:
        """Synchronous PDF text extraction (CPU-intensive) - backward compatible"""
        text, _ = DocumentProcessor._extract_text_from_pdf_with_ocr_sync(file_content)
        return text

    @staticmethod
    async def extract_text_from_pdf(file_content: bytes) -> Optional[str]:
        """Extract text from PDF file (runs in thread pool) - backward compatible"""
        return await asyncio.to_thread(
            DocumentProcessor._extract_text_from_pdf_sync, file_content
        )

    @staticmethod
    async def extract_text_from_pdf_with_method(file_content: bytes) -> Tuple[Optional[str], str]:
        """Extract text from PDF with extraction method indicator (runs in thread pool)"""
        return await asyncio.to_thread(
            DocumentProcessor._extract_text_from_pdf_with_ocr_sync, file_content
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
