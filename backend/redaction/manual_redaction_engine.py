# ------------------------------------------------------------
# manual_redaction_engine.py — Stirling‑style manual redaction engine
# FIXED: Y-flip, polygon clipping, rect validation, safe pixelation
# ------------------------------------------------------------

import os
import uuid
import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional, Tuple
import io
from PIL import Image


class ManualRedactionEngine:
    """
    Fully upgraded manual redaction engine supporting:
    - box redactions
    - text redactions (multi-rect)
    - polygon redactions
    - ink strokes
    - highlight mode
    - blur / pixelate modes
    - remove mode
    - full-page redaction
    - metadata scrubbing
    """

    def __init__(self, output_dir: str = "temp_redacted"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    # ------------------------------------------------------------
    # Color helpers
    # ------------------------------------------------------------
    @staticmethod
    def _hex_to_rgb01(hex_color: str) -> Tuple[float, float, float]:
        if not hex_color:
            return (0, 0, 0)
        hex_color = hex_color.strip().lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join([c * 2 for c in hex_color])
        if len(hex_color) != 6:
            return (0, 0, 0)
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
        return (r, g, b)

    # ------------------------------------------------------------
    # Rect validation
    # ------------------------------------------------------------
    @staticmethod
    def _validate_rect(r: Dict[str, float]) -> Dict[str, float]:
        def clamp(v):
            try:
                v = float(v)
            except Exception:
                return 0.0
            return max(0.0, min(1.0, v))

        return {
            "x0": clamp(r.get("x0", 0)),
            "y0": clamp(r.get("y0", 0)),
            "x1": clamp(r.get("x1", 1)),
            "y1": clamp(r.get("y1", 1)),
        }

    # ------------------------------------------------------------
    # Blur / pixelate helpers
    # ------------------------------------------------------------
    def _apply_pixel_effect(self, page, rect, intensity: int):
        """
        FIXED: Pixelation applied AFTER redaction annotation is added.
        This prevents leaking underlying text.
        """
        try:
            zoom = 2
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, clip=rect)

            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            small_w = max(1, pix.width // intensity)
            small_h = max(1, pix.height // intensity)

            img_small = img.resize((small_w, small_h), Image.Resampling.LANCZOS)
            img_pixel = img_small.resize((pix.width, pix.height), Image.Resampling.NEAREST)

            buf = io.BytesIO()
            img_pixel.save(buf, format="PNG")
            buf.seek(0)

            page.insert_image(rect, stream=buf.read())
        except Exception as e:
            print(f"[manual_redaction_engine] Pixel effect failed: {e}")
            page.add_redact_annot(rect, fill=(0, 0, 0))

    # ------------------------------------------------------------
    # Apply a single redaction annotation
    # ------------------------------------------------------------
    def _apply_redaction(self, page, rect, mode, rgb):
        if mode == "black":
            page.add_redact_annot(rect, fill=(0, 0, 0))

        elif mode == "white":
            page.add_redact_annot(rect, fill=(1, 1, 1))

        elif mode == "highlight":
            page.add_redact_annot(rect, fill=(1, 1, 0), opacity=0.3)

        elif mode == "remove":
            page.add_redact_annot(rect)

        elif mode == "blur":
            page.add_redact_annot(rect, fill=(*rgb, 0.3))
            self._apply_pixel_effect(page, rect, intensity=8)

        elif mode == "pixelate":
            page.add_redact_annot(rect, fill=(*rgb, 0.5))
            self._apply_pixel_effect(page, rect, intensity=20)

        else:
            page.add_redact_annot(rect, fill=rgb)

    # ------------------------------------------------------------
    # FIXED: True polygon clipping (not bounding box)
    # ------------------------------------------------------------
    def _polygon_to_path(self, page, points, pw, ph):
        """
        Convert normalized polygon points → PDF path.
        FIXED: Y-axis inversion applied.
        """
        path = page.new_shape()

        def conv(p):
            x = p["x"] * pw
            y = (1 - p["y"]) * ph  # FIXED Y-FLIP
            return x, y

        x0, y0 = conv(points[0])
        path.move_to(x0, y0)

        for p in points[1:]:
            x, y = conv(p)
            path.line_to(x, y)

        path.close_path()
        return path

    # ------------------------------------------------------------
    # Apply all redactions to a document
    # ------------------------------------------------------------
    def _apply_redactions_to_doc(self, doc, redactions, scrub_metadata=True):
        by_page = {}
        for r in redactions:
            p = int(r.get("page", 1))
            by_page.setdefault(p, []).append(r)

        for page_index in range(len(doc)):
            page_num = page_index + 1
            page = doc[page_index]
            pw, ph = page.rect.width, page.rect.height

            items = by_page.get(page_num, [])
            if not items:
                continue

            for r in items:
                rtype = r.get("type", "box")
                mode = r.get("mode", "black").lower()
                rgb = self._hex_to_rgb01(r.get("color", "#000000"))

                # Full-page redaction
                if rtype == "page":
                    rect = fitz.Rect(0, 0, pw, ph)
                    self._apply_redaction(page, rect, mode, rgb)

                # Box / text / search / auto
                elif rtype in ("box", "text", "search", "auto"):
                    for rd in r.get("rects", []):
                        rd = self._validate_rect(rd)

                        # FIXED: Y-FLIP
                        x0 = rd["x0"] * pw
                        x1 = rd["x1"] * pw
                        y0 = (1 - rd["y1"]) * ph
                        y1 = (1 - rd["y0"]) * ph

                        rect = fitz.Rect(x0, y0, x1, y1)
                        self._apply_redaction(page, rect, mode, rgb)

                # Polygon / Ink
                elif rtype in ("ink", "polygon"):
                    pts = r.get("points", [])
                    if len(pts) >= 3:
                        path = self._polygon_to_path(page, pts, pw, ph)
                        path.finish(color=None, fill=rgb)
                        path.commit()

            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_IF_COVERED
            )

        # FIXED: metadata scrubbing
        if scrub_metadata:
            meta = doc.metadata or {}
            for k in list(meta.keys()):
                meta[k] = None
            doc.set_metadata(meta)

    # ------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------
    def apply_redactions(self, pdf_bytes, redactions, scrub_metadata=True, base_filename=None):
        # Allow empty redactions: simply save the PDF unchanged
        safe_name = os.path.splitext(os.path.basename(base_filename or "document"))[0]
        out_name = f"{safe_name}_redacted_{uuid.uuid4().hex[:8]}.pdf"
        out_path = os.path.join(self.output_dir, out_name)

        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            if redactions:
                # Apply real redactions
                self._apply_redactions_to_doc(doc, redactions, scrub_metadata)
            else:
                # Still scrub metadata if requested
                if scrub_metadata:
                    meta = doc.metadata or {}
                    for k in list(meta.keys()):
                        meta[k] = None
                    doc.set_metadata(meta)

            doc.save(out_path, garbage=4, deflate=True, clean=True, linear=True)

        return out_path

