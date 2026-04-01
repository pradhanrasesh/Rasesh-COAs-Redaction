# ------------------------------------------------------------
# redaction_engine.py — Template/Text-based redaction engine
# FIXED: Y-flip, color support, rect validation, metadata scrubbing
# ------------------------------------------------------------

import os
import uuid
import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional


class RedactionEngine:
    """
    Redaction engine for template-based or text-based redaction.
    Supports:
    - Text-based redaction (search results, template rules)
    - Box-based redaction (rectangles)
    - Multi-rect redactions
    - Image-based black box redaction
    - Metadata scrubbing
    """

    def __init__(self, output_dir: str = "temp_redacted"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    # ------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------
    @staticmethod
    def _validate_rect(rect: Dict[str, float]) -> Dict[str, float]:
        """Ensure rect values are valid floats between 0–1."""
        def clamp(v):
            try:
                v = float(v)
            except Exception:
                return 0.0
            return max(0.0, min(1.0, v))

        return {
            "x0": clamp(rect.get("x0", 0)),
            "y0": clamp(rect.get("y0", 0)),
            "x1": clamp(rect.get("x1", 1)),
            "y1": clamp(rect.get("y1", 1)),
        }

    @staticmethod
    def _normalize_rect(rect: Dict[str, float], page_width: float, page_height: float):
        """
        Convert normalized rect (0–1) to absolute PDF coordinates.
        FIXED: Apply Y-axis inversion (PDF y=0 is bottom).
        """
        rect = RedactionEngine._validate_rect(rect)

        # Normalized coordinates
        x0n = min(rect["x0"], rect["x1"])
        x1n = max(rect["x0"], rect["x1"])

        # FIXED: Y inversion
        y0n = 1 - max(rect["y0"], rect["y1"])
        y1n = 1 - min(rect["y0"], rect["y1"])

        x0 = x0n * page_width
        x1 = x1n * page_width
        y0 = y0n * page_height
        y1 = y1n * page_height

        return fitz.Rect(x0, y0, x1, y1)

    # ------------------------------------------------------------
    # Apply redactions to a document
    # ------------------------------------------------------------
    def _apply_redactions_to_doc(
        self,
        doc: fitz.Document,
        redactions: List[Dict[str, Any]],
        scrub_metadata: bool = True,
    ):
        """
        Apply redactions to an open PyMuPDF document.
        Expected redaction format:
        {
            "page": 1,
            "type": "text" | "box" | "auto",
            "rects": [...],
            "color": "#RRGGBB"
        }
        """

        # Group by page
        by_page: Dict[int, List[Dict[str, Any]]] = {}
        for r in redactions:
            p = int(r.get("page", 1))
            by_page.setdefault(p, []).append(r)

        # Process each page
        for page_index in range(len(doc)):
            page_num = page_index + 1
            page = doc[page_index]
            pw, ph = page.rect.width, page.rect.height

            items = by_page.get(page_num, [])
            if not items:
                continue

            for r in items:
                rtype = r.get("type", "box")
                rects = r.get("rects", [])
                color_hex = r.get("color", "#000000")

                # FIXED: Convert hex → RGB tuple
                try:
                    rgb = tuple(int(color_hex[i:i+2], 16) for i in (1, 3, 5))
                except Exception:
                    rgb = (0, 0, 0)

                for rect in rects:
                    abs_rect = self._normalize_rect(rect, pw, ph)

                    # FIXED: Respect color
                    page.add_redact_annot(abs_rect, fill=rgb)

            # Apply all redactions for this page
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_IF_COVERED,
            )

        # FIXED: Metadata scrubbing
        if scrub_metadata:
            meta = doc.metadata or {}
            for k in list(meta.keys()):
                meta[k] = None
            doc.set_metadata(meta)

    # ------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------
    def redact_pdf(
        self,
        pdf_path: str,
        template: Dict[str, Any],
        scrub_metadata: bool = True,
    ) -> str:
        """
        Redact a PDF using a template (file path input).
        Template must contain a list of redaction objects.
        """
        if not os.path.isfile(pdf_path):
            raise FileNotFoundError(pdf_path)

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        redactions = template.get("redactions", [])
        return self.apply_redactions(pdf_bytes, redactions, scrub_metadata, pdf_path)

    def apply_redactions(
        self,
        pdf_bytes: bytes,
        redactions: List[Dict[str, Any]],
        scrub_metadata: bool = True,
        base_filename: Optional[str] = None,
    ) -> str:
        """
        Apply redactions to a PDF (bytes) and return output path.
        """
        if not redactions:
            raise ValueError("No redactions provided")

        safe_name = os.path.splitext(os.path.basename(base_filename or "document"))[0]
        out_name = f"{safe_name}_redacted_{uuid.uuid4().hex[:8]}.pdf"
        out_path = os.path.join(self.output_dir, out_name)

        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            self._apply_redactions_to_doc(doc, redactions, scrub_metadata)
            doc.save(
                out_path,
                garbage=4,
                deflate=True,
                clean=True,
                linear=True,
            )

        return out_path
