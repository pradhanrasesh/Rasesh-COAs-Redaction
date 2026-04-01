# ------------------------------------------------------------
# text_finder.py — OCR-aware text extraction + spans
# ------------------------------------------------------------

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import re
import fitz  # PyMuPDF

# Optional OCR import
try:
    from backend.ocr_engine import OCREngine, OCRWord
    HAS_OCR = True
except ImportError:
    HAS_OCR = False
    OCREngine = None
    OCRWord = None


@dataclass
class TextSpan:
    page: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


class TextFinder:
    def __init__(self, ocr_engine: Optional[OCREngine] = None):
        # If OCR is available, default to using it when the caller doesn't
        # provide an OCR engine. This enables auto_ocr fallback.
        if HAS_OCR:
            self.ocr_engine = ocr_engine if ocr_engine is not None else OCREngine()
        else:
            self.ocr_engine = None

    # ------------------------------------------------------------
    # PDF-native text extraction
    # ------------------------------------------------------------
    def _extract_pdf_words(self, doc: fitz.Document, page_index: int) -> List[TextSpan]:
        page = doc[page_index]
        words = page.get_text("words")
        if not words:
            return []

        width = page.rect.width
        height = page.rect.height

        spans: List[TextSpan] = []
        for w in words:
            x0, y0, x1, y1, text, *_ = w
            if not text.strip():
                continue

            spans.append(
                TextSpan(
                    page=page_index + 1,
                    text=text,
                    x0=x0 / width,
                    y0=1 - (y1 / height),
                    x1=x1 / width,
                    y1=1 - (y0 / height),
                )
            )
        return spans

    # ------------------------------------------------------------
    # OCR fallback
    # ------------------------------------------------------------
    def _extract_ocr_words(self, pdf_bytes: bytes, page_index: int) -> List[TextSpan]:
        if not self.ocr_engine or not HAS_OCR:
            return []

        ocr_words: List[OCRWord] = self.ocr_engine.ocr_pdf_bytes_per_page(
            pdf_bytes, page_index
        )
        spans: List[TextSpan] = []
        for w in ocr_words:
            spans.append(
                TextSpan(
                    page=w.page,
                    text=w.text,
                    x0=w.x0,
                    y0=w.y0,
                    x1=w.x1,
                    y1=w.y1,
                )
            )
        return spans

    # ------------------------------------------------------------
    # Extract all spans
    # ------------------------------------------------------------
    def find_text_spans(
        self,
        pdf_bytes: bytes,
        use_ocr: bool = False,
        auto_ocr: bool = True,
    ) -> List[TextSpan]:

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_spans: List[TextSpan] = []

        for page_index in range(len(doc)):
            if use_ocr:
                spans = self._extract_ocr_words(pdf_bytes, page_index)
            else:
                spans = self._extract_pdf_words(doc, page_index)
                if auto_ocr and not spans and self.ocr_engine:
                    spans = self._extract_ocr_words(pdf_bytes, page_index)

            all_spans.extend(spans)

        doc.close()
        return all_spans

    # ------------------------------------------------------------
    # SAFE barcode detection via PyMuPDF (image blocks)
    # ------------------------------------------------------------
    def find_barcodes(self, pdf_bytes: bytes) -> List[Dict[str, Any]]:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        results = []

        for page_index in range(len(doc)):
            page = doc[page_index]
            raw = page.get_text("rawdict")

            width = page.rect.width
            height = page.rect.height

            for block in raw.get("blocks", []):
                if block.get("type") != 1:
                    continue

                try:
                    x0, y0, x1, y1 = block["bbox"]
                except Exception:
                    continue

                results.append({
                    "page": page_index + 1,
                    "text": "",
                    "rects": [{
                        "x0": x0 / width,
                        "y0": 1 - (y1 / height),
                        "x1": x1 / width,
                        "y1": 1 - (y0 / height)
                    }]
                })

        doc.close()
        return results
