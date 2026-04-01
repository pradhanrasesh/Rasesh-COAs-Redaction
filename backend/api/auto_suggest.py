from fastapi import APIRouter, UploadFile, File, Query
from fastapi.responses import JSONResponse

from backend.redaction.text_finder import TextFinder
from backend.suggestions import build_final_rules_for_document, generate_suggestions
import traceback

# Barcode fallback rendering (no Poppler dependency)
import io
import fitz  # PyMuPDF
from PIL import Image

# For pyzbar-based barcode detection
from pdf2image import convert_from_bytes
import os

try:
    from pyzbar.pyzbar import decode as pyzbar_decode
    HAS_PYZBAR = True
except Exception:
    pyzbar_decode = None
    HAS_PYZBAR = False

router = APIRouter(prefix="/redact", tags=["Auto-Suggest"])

def _find_poppler_path() -> str | None:
    # Allow override via env var
    env_path = os.environ.get("POPPLER_PATH")
    if env_path:
        pdfinfo = os.path.join(env_path, "pdfinfo.exe")
        if os.path.isfile(pdfinfo):
            return env_path

    candidates = [
        r"C:\poppler\bin",
        r"C:\poppler\Library\bin",
        r"C:\poppler\Library\mingw64\bin",
        r"C:\Program Files\poppler\bin",
        r"C:\Program Files (x86)\poppler\bin",
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files (x86)\poppler\Library\bin",
    ]
    for path in candidates:
        if os.path.isfile(os.path.join(path, "pdfinfo.exe")):
            return path
    return None


def _barcode_symbol_meta(decoded_symbol) -> dict:
    raw_type = str(getattr(decoded_symbol, "type", "") or "").upper()
    is_qr = "QR" in raw_type

    return {
        "type": "qrcode" if is_qr else "barcode",
        "group": "qr" if is_qr else "barcode",
        "label": "QR Code" if is_qr else "Barcode",
        "rule_id": "pyzbar_qrcode" if is_qr else "pyzbar_barcode",
    }


def _detect_barcodes_pyzbar(pdf_bytes: bytes):
    if not HAS_PYZBAR or pyzbar_decode is None:
        return []

    poppler_path = _find_poppler_path()
    images = None
    if poppler_path:
        # Fast path (requires Poppler/pdfinfo)
        images = convert_from_bytes(
            pdf_bytes,
            dpi=200,
            poppler_path=poppler_path,
        )
    else:
        # Fallback path (requires no Poppler): render via PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        try:
            zoom = 200 / 72.0
            mat = fitz.Matrix(zoom, zoom)
            for page in doc:
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                images.append(img)
        finally:
            doc.close()

    suggestions = []
    page_number = 1

    for img in images:
        decoded = pyzbar_decode(img)

        width, height = img.size

        for d in decoded:
            x, y, w, h = d.rect
            meta = _barcode_symbol_meta(d)

            norm = {
                "x0": x / width,
                "y0": y / height,
                "x1": (x + w) / width,
                "y1": (y + h) / height
            }

            suggestions.append({
                "type": meta["type"],
                "rule_id": meta["rule_id"],
                "label": meta["label"],
                "group": meta["group"],
                "page": page_number,
                "rects": [norm],
                "selected": True,
                "text": d.data.decode("utf-8", errors="ignore") if d.data else "",
                "reason": "Detected barcode (pyzbar)"
            })

        page_number += 1

    return suggestions


@router.post("/template")
async def auto_suggest_template(
    file: UploadFile = File(...),
    company_id: str | None = Query(None),
    sensitivity: int = Query(50, ge=0, le=100),
):
    try:
        pdf_bytes = await file.read()

        finder = TextFinder()
        spans = finder.find_text_spans(pdf_bytes, use_ocr=False, auto_ocr=True)

        spans_by_page: dict[int, list[dict]] = {}
        for s in spans:
            page = getattr(s, "page", None) or getattr(s, "page", 1)
            text = getattr(s, "text", None) or getattr(s, "text", "")
            x0 = getattr(s, "x0", None) or getattr(s, "x0", 0.0)
            y0 = getattr(s, "y0", None) or getattr(s, "y0", 0.0)
            x1 = getattr(s, "x1", None) or getattr(s, "x1", 1.0)
            y1 = getattr(s, "y1", None) or getattr(s, "y1", 1.0)

            page = int(page)
            spans_by_page.setdefault(page, []).append(
                {
                    "text": text,
                    "x0": float(x0),
                    "y0": float(y0),
                    "x1": float(x1),
                    "y1": float(y1),
                }
            )

        pages_text = [
            " ".join(s["text"] for s in spans_by_page[p] if s["text"])
            for p in sorted(spans_by_page.keys())
        ] if spans_by_page else [""]

        full_text = " ".join(pages_text)

        final_rules = build_final_rules_for_document(
            full_text,
            company_hint=company_id,
        )

        # IMPORTANT: use pages_text key to match suggestion engine
        ocr_result = {
            "pages_text": pages_text,
            "spans_by_page": spans_by_page,
        }

        # Rule-based suggestions (text + layout + zones)
        suggestions = generate_suggestions([], ocr_result, final_rules, sensitivity=sensitivity)

        # PyMuPDF image-block barcodes
        pymupdf_barcodes = finder.find_barcodes(pdf_bytes)
        for b in pymupdf_barcodes:
            suggestions.append(
                {
                    "type": "barcode",
                    "rule_id": "pymupdf_barcode",
                    "label": "Barcode",
                    "group": "barcode",
                    "page": b["page"],
                    "rects": b["rects"],
                    "text": b.get("text", ""),
                    "reason": "Detected image block (PyMuPDF)"
                }
            )

        # pyzbar barcodes (same engine as barcode button)
        pyzbar_suggestions = _detect_barcodes_pyzbar(pdf_bytes)
        suggestions.extend(pyzbar_suggestions)

        return JSONResponse({"candidates": suggestions}, status_code=200)

    except Exception as e:
        print("🔥🔥🔥 AUTO-SUGGEST ERROR 🔥🔥🔥")
        traceback.print_exc()
        print("🔥🔥🔥 END ERROR 🔥🔥🔥")
        return JSONResponse({"error": str(e)}, status_code=500)
