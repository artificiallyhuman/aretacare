"""Uploads answer inside the edge proxy's timeout: OCR steps are capped by its budget."""
import importlib
import time

from app.services.document_processor import DocumentProcessor

processor_module = importlib.import_module("app.services.document_processor")


class _Page:
    def close(self):
        pass


def test_ocr_steps_never_outlast_the_budget(monkeypatch):
    """A page started just before the budget ran out could add a full render and OCR
    timeout (60 s) on top of it; each step now gets only what is left."""
    timeouts = []

    def fake_render(_path, **kwargs):
        timeouts.append(("render", kwargs["timeout"]))
        return [_Page()]

    def fake_ocr(_image, timeout):
        timeouts.append(("ocr", timeout))
        time.sleep(0.4)
        return "text"

    monkeypatch.setattr(DocumentProcessor, "OCR_TIME_BUDGET_SECONDS", 1.0)
    monkeypatch.setattr(processor_module, "convert_from_path", fake_render)
    monkeypatch.setattr(processor_module.pytesseract, "image_to_string", fake_ocr)

    began = time.monotonic()
    texts, pages = DocumentProcessor._ocr_pdf_pages(b"%PDF-1.4", pages_to_ocr=20)
    assert time.monotonic() - began < 2.5
    assert 1 <= pages < 20 and len(texts) == pages
    assert all(timeout <= 1.0 for _step, timeout in timeouts)


def test_time_left_is_capped_and_never_below_a_second():
    now = time.monotonic()
    assert DocumentProcessor._time_left(now + 100, 30) == 30
    assert 9 < DocumentProcessor._time_left(now + 10, 30) <= 10
    assert DocumentProcessor._time_left(now - 5, 30) == 1.0
