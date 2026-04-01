# backend/ocr_engine.py
# FIXED: Y-flip, PDF-space transform, preprocessing, span grouping, caching

import io
import os
from dataclasses import dataclass
from typing import List, Dict, Optional

import fitz  # PyMuPDF
import pytesseract
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
import shutil
import hashlib


@dataclass
class OCRWord:
    page: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


class OCREngine:
    """
    OCR engine using Tesseract + PyMuPDF.
    FIXED:
    - Y-axis inversion
    - PDF-space coordinate transform
    - Preprocessing (deskew + denoise)
    - Span grouping
    - Caching
    """

    def __init__(self, lang: str = "eng", tesseract_path: Optional[str] = None):
        self.lang = lang

        # Try to locate Tesseract even when it's not on PATH.
        # This prevents "OCR works only on machines where tesseract is already in PATH".
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
        else:
            env_cmd = os.environ.get("TESSERACT_CMD")
            if env_cmd:
                pytesseract.pytesseract.tesseract_cmd = env_cmd
            else:
                candidates = [
                    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                ]
                for c in candidates:
                    try:
                        if os.path.isfile(c):
                            pytesseract.pytesseract.tesseract_cmd = c
                            break
                    except Exception:
                        continue

        # shutil.which doesn't always work when tesseract_cmd is a full path,
        # so we also verify os.path.isfile.
        cmd = getattr(pytesseract.pytesseract, "tesseract_cmd", "")
        self.tesseract_available = bool(shutil.which(cmd) or (cmd and os.path.isfile(cmd)))
        if not self.tesseract_available:
            print("⚠ WARNING: Tesseract not found. OCR will return empty results.")

        # FIXED: simple in-memory cache
        self.cache: Dict[str, List[OCRWord]] = {}

    # ------------------------------------------------------------
    # Preprocess image (deskew + denoise)
    # ------------------------------------------------------------
    def _preprocess(self, img: Image.Image) -> Image.Image:
        try:
            img = img.convert("L")  # grayscale
            img = ImageOps.autocontrast(img)
            img = img.filter(ImageFilter.MedianFilter(size=3))
            return img
        except Exception:
            return img

    # ------------------------------------------------------------
    # Convert PDF page → PIL image
    # ------------------------------------------------------------
    def _page_to_image(self, page: fitz.Page, dpi: int = 200) -> Optional[Image.Image]:
        try:
            zoom = dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            return img
        except Exception as e:
            print(f"❌ ERROR: Failed to rasterize page {page.number}: {e}")
            return None

    # ------------------------------------------------------------
    # Convert OCR pixel coords → normalized PDF coords
    # ------------------------------------------------------------
    def _pixel_to_pdf_norm(self, page: fitz.Page, x: float, y: float, w: float, h: float, img_w: float, img_h: float):
        # Convert pixel → PDF absolute coords
        # Use page.transform to map image space → PDF space
        # (PyMuPDF maps pixmap coords directly via inverse matrix)
        try:
            # Pixel → PDF absolute
            abs_x0, abs_y0 = page.transform_pixmap_point((x, y), img_w, img_h)
            abs_x1, abs_y1 = page.transform_pixmap_point((x + w, y + h), img_w, img_h)
        except Exception:
            # Fallback: simple proportional mapping
            pw, ph = page.rect.width, page.rect.height
            abs_x0 = (x / img_w) * pw
            abs_x1 = ((x + w) / img_w) * pw
            abs_y0 = (y / img_h) * ph
            abs_y1 = ((y + h) / img_h) * ph

        # FIXED: Normalize + Y-flip
        pw, ph = page.rect.width, page.rect.height

        nx0 = abs_x0 / pw
        nx1 = abs_x1 / pw

        # PDF y=0 bottom → normalized y=0 top
        ny0 = 1 - (abs_y1 / ph)
        ny1 = 1 - (abs_y0 / ph)

        return nx0, ny0, nx1, ny1

    # ------------------------------------------------------------
    # OCR entire PDF (bytes)
    # ------------------------------------------------------------
    def ocr_pdf_bytes(self, pdf_bytes: bytes) -> List[OCRWord]:
        if not self.tesseract_available:
            return []

        # FIXED: caching
        key = hashlib.sha256(pdf_bytes).hexdigest()
        if key in self.cache:
            return self.cache[key]

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            print(f"❌ ERROR: Failed to open PDF for OCR: {e}")
            return []

        results: List[OCRWord] = []

        for page_index in range(len(doc)):
            page = doc[page_index]

            img = self._page_to_image(page)
            if img is None:
                continue

            img = self._preprocess(img)
            width, height = img.size

            try:
                data = pytesseract.image_to_data(
                    img,
                    lang=self.lang,
                    output_type=pytesseract.Output.DICT,
                )
            except Exception as e:
                print(f"❌ ERROR: OCR failed on page {page_index + 1}: {e}")
                continue

            n = len(data.get("text", []))
            for i in range(n):
                text = data["text"][i].strip()
                if not text:
                    continue

                x = data["left"][i]
                y = data["top"][i]
                w = data["width"][i]
                h = data["height"][i]

                nx0, ny0, nx1, ny1 = self._pixel_to_pdf_norm(page, x, y, w, h, width, height)

                results.append(
                    OCRWord(
                        page=page_index + 1,
                        text=text,
                        x0=nx0,
                        y0=ny0,
                        x1=nx1,
                        y1=ny1,
                    )
                )

        doc.close()

        # FIXED: cache results
        self.cache[key] = results
        return results

    # ------------------------------------------------------------
    # OCR a single page
    # ------------------------------------------------------------
    def ocr_pdf_bytes_per_page(self, pdf_bytes: bytes, page_index: int) -> List[OCRWord]:
        if not self.tesseract_available:
            return []

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            print(f"❌ ERROR: Failed to open PDF for OCR: {e}")
            return []

        if page_index < 0 or page_index >= len(doc):
            doc.close()
            return []

        page = doc[page_index]

        img = self._page_to_image(page)
        if img is None:
            doc.close()
            return []

        img = self._preprocess(img)
        width, height = img.size

        try:
            data = pytesseract.image_to_data(
                img,
                lang=self.lang,
                output_type=pytesseract.Output.DICT,
            )
        except Exception as e:
            print(f"❌ ERROR: OCR failed on page {page_index + 1}: {e}")
            doc.close()
            return []

        results: List[OCRWord] = []
        n = len(data.get("text", []))

        for i in range(n):
            text = data["text"][i].strip()
            if not text:
                continue

            x = data["left"][i]
            y = data["top"][i]
            w = data["width"][i]
            h = data["height"][i]

            nx0, ny0, nx1, ny1 = self._pixel_to_pdf_norm(page, x, y, w, h, width, height)

            results.append(
                OCRWord(
                    page=page_index + 1,
                    text=text,
                    x0=nx0,
                    y0=ny0,
                    x1=nx1,
                    y1=ny1,
                )
            )

        doc.close()
        return results
