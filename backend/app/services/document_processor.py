from pypdf import PdfReader
from io import BytesIO
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes, convert_from_path
from typing import Optional, Tuple
import logging
import asyncio
import os
import tempfile
import time

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Process various document types and extract text"""

    # OCR configuration
    MAX_OCR_PAGES = 100  # Limit OCR to first 100 pages for memory/time constraints
    OCR_DPI = 200  # Balance between quality and memory usage

    # Pages are rendered one at a time and capped on their longest side, so peak memory
    # is one grayscale page (a few MB) whatever the page count or the page's declared
    # size. 2400px is ~218 DPI for a letter page; a page that declares itself several
    # metres wide is scaled down to the same bitmap instead of allocating gigabytes.
    OCR_MAX_PAGE_PIXELS = 2400

    # OCR runs inside the upload request, which has to answer before the edge proxy
    # gives up (~100s). Past this budget the pages done so far are returned as
    # 'partial_ocr' rather than letting the request run on with no one listening.
    OCR_TIME_BUDGET_SECONDS = 75

    # Per-subprocess limits: one hostile or corrupt page must not hold a worker
    # thread (and the budget) on its own.
    PDF_RENDER_TIMEOUT_SECONDS = 30
    OCR_PAGE_TIMEOUT_SECONDS = 30
    IMAGE_OCR_TIMEOUT_SECONDS = 60

    # Longest side of the bitmap rendered for a PDF thumbnail, before the final resize.
    THUMBNAIL_RENDER_PIXELS = 600

    @staticmethod
    def _ocr_pdf_pages(file_content: bytes, pages_to_ocr: int) -> Tuple[list, int]:
        """OCR pages 1..pages_to_ocr one at a time.

        Returns (page_texts, pages_attempted). pages_attempted is lower than
        pages_to_ocr when the time budget ran out first.
        """
        started = time.monotonic()
        ocr_text_content = []
        pages_attempted = 0

        # One copy on disk for the renderer to reopen per page, instead of piping the
        # whole document to a new subprocess for every page.
        fd, pdf_path = tempfile.mkstemp(suffix=".pdf")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(file_content)

            for page_number in range(1, pages_to_ocr + 1):
                if time.monotonic() - started > DocumentProcessor.OCR_TIME_BUDGET_SECONDS:
                    logger.warning(
                        f"OCR time budget reached after {pages_attempted} of {pages_to_ocr} pages"
                    )
                    break
                pages_attempted += 1

                image = None
                try:
                    images = convert_from_path(
                        pdf_path,
                        first_page=page_number,
                        last_page=page_number,
                        dpi=DocumentProcessor.OCR_DPI,
                        size=DocumentProcessor.OCR_MAX_PAGE_PIXELS,
                        grayscale=True,
                        timeout=DocumentProcessor.PDF_RENDER_TIMEOUT_SECONDS,
                    )
                    if not images:
                        continue
                    image = images[0]
                    text = pytesseract.image_to_string(
                        image, timeout=DocumentProcessor.OCR_PAGE_TIMEOUT_SECONDS
                    )
                    if text and text.strip():
                        ocr_text_content.append(f"--- Page {page_number} ---\n{text.strip()}")
                except Exception as ocr_page_error:
                    logger.warning(f"OCR failed for page {page_number}: {ocr_page_error}")
                finally:
                    # Free the page before rendering the next one
                    if image is not None:
                        image.close()
        finally:
            try:
                os.unlink(pdf_path)
            except OSError:
                pass

        return ocr_text_content, pages_attempted

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

                ocr_text_content, pages_done = DocumentProcessor._ocr_pdf_pages(
                    file_content, pages_to_ocr
                )

                if ocr_text_content:
                    # pages_done falls short of total_pages when the page limit or the
                    # time budget stopped the pass early.
                    extraction_method = "ocr" if pages_done >= total_pages else "partial_ocr"
                    if pages_done < total_pages:
                        ocr_text_content.append(f"\n\n[OCR limited to first {pages_done} of {total_pages} pages]")
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
            text = pytesseract.image_to_string(
                image, timeout=DocumentProcessor.IMAGE_OCR_TIMEOUT_SECONDS
            )
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
            # Convert first page to image. `size` caps the rendered bitmap's longest
            # side, so the page's declared dimensions cannot drive the allocation.
            images = convert_from_bytes(
                file_content,
                first_page=1,
                last_page=1,
                dpi=150,
                size=DocumentProcessor.THUMBNAIL_RENDER_PIXELS,
                timeout=DocumentProcessor.PDF_RENDER_TIMEOUT_SECONDS,
            )
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
