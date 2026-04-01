# backend: ocr_report.py
# Unified FastAPI app for:
# - Report-number OCR helper
# - Template-based auto-suggest (hybrid engine)
# - Manual redaction application
# - Barcode / QR detection
# - Plugin system (tools)
#
# Requires:
#   pip install pymupdf pillow pytesseract fastapi uvicorn pdf2image pyzbar

import io
import os
import re
import json
import zipfile
from typing import Dict, Any, List, Optional

import fitz  # PyMuPDF
from PIL import Image
import pytesseract
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

# Plugin system
from backend.plugins.manager import load_plugins

# Rule engine
from backend.suggestions import (
    build_final_rules_for_document,
    generate_suggestions,
)
from backend.rules.merge_engine import detect_company
from backend.pdf_engine import build_redacted_filename

# Barcode libs
from pyzbar.pyzbar import decode
from pdf2image import convert_from_bytes

# ------------------------------------------------------------
# Resolve company rules directory
# ------------------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMPANY_RULES_DIR = os.path.join(PROJECT_ROOT, "config", "rules", "company_rules")

# ------------------------------------------------------------
# FastAPI app + plugins
# ------------------------------------------------------------
app = FastAPI()
PLUGINS = load_plugins()
print("[plugins] Loaded:", list(PLUGINS.keys()))

# ------------------------------------------------------------
# Configure Tesseract for this module
# ------------------------------------------------------------
def _configure_tesseract():
    # If already configured, keep it.
    cmd = getattr(pytesseract.pytesseract, "tesseract_cmd", "")
    if cmd and isinstance(cmd, str) and os.path.isfile(cmd):
        return

    env_cmd = os.environ.get("TESSERACT_CMD")
    if env_cmd and os.path.isfile(env_cmd):
        pytesseract.pytesseract.tesseract_cmd = env_cmd
        return

    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for c in candidates:
        try:
            if os.path.isfile(c):
                pytesseract.pytesseract.tesseract_cmd = c
                return
        except Exception:
            continue


_configure_tesseract()

# ------------------------------------------------------------
# 1) OCR helper for report number
# ------------------------------------------------------------

REPORT_REGEX = re.compile(r"C[0-9A-Z]{4,6}-[0-9A-Z]{4,6}")

def ocr_region_from_pdf(
    pdf_bytes: bytes,
    page_index: int = 0,
    rect_frac=(0.55, 0.70, 0.95, 0.90),
    dpi: int = 300,
):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if page_index >= len(doc):
        return None, None, None

    page = doc[page_index]
    page_rect = page.rect

    x0 = page_rect.x0 + rect_frac[0] * page_rect.width
    y0 = page_rect.y0 + rect_frac[1] * page_rect.height
    x1 = page_rect.x0 + rect_frac[2] * page_rect.width
    y1 = page_rect.y0 + rect_frac[3] * page_rect.height

    clip = fitz.Rect(x0, y0, x1, y1)
    pix = page.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes()))
    # If Tesseract isn't installed/available, keep frontend working.
    try:
        text = pytesseract.image_to_string(img)
    except Exception:
        return "", None, None
    return text, clip, page_rect


@app.post("/api/redact/ocr-report")
async def ocr_report(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    try:
        text, clip, page_rect = ocr_region_from_pdf(pdf_bytes)
        if not text:
            return JSONResponse({"ok": False, "message": "no text"}, status_code=200)

        m = REPORT_REGEX.search(text)
        if not m:
            return JSONResponse({"ok": True, "candidate": None}, status_code=200)

        report = m.group()

        rect = {
            "x0": clip.x0 / page_rect.width,
            "y0": clip.y0 / page_rect.height,
            "x1": clip.x1 / page_rect.width,
            "y1": clip.y1 / page_rect.height,
        }

        candidate = {
            "page": 1,
            "rect": rect,
            "value": report,
        }
        return JSONResponse({"ok": True, "candidate": candidate}, status_code=200)

    except Exception as e:
        return JSONResponse({"ok": False, "message": str(e)}, status_code=500)


# ------------------------------------------------------------
# 2) OCR/Text extraction → spans_by_page
# ------------------------------------------------------------

def extract_ocr_structure(pdf_bytes: bytes) -> Dict[str, Any]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_text: List[str] = []
    spans_by_page: Dict[int, List[Dict[str, Any]]] = {}

    for i, page in enumerate(doc):
        page_num = i + 1
        width = page.rect.width
        height = page.rect.height
        text = page.get_text("text") or ""
        pages_text.append(text)

        spans: List[Dict[str, Any]] = []
        # PyMuPDF returns tuples like:
        #   (x0, y0, x1, y1, word, block_no, line_no, word_no)
        # so we must tolerate extra fields and normalize coords to 0..1.
        for w in page.get_text("words") or []:
            x0, y0, x1, y1, word_text, *_ = w
            word_text = (word_text or "").strip()
            if not word_text:
                continue

            # Convert PyMuPDF's bottom-origin coords to frontend top-origin normalized coords.
            spans.append(
                {
                    "text": word_text,
                    "x0": float(x0) / width if width else 0.0,
                    "y0": 1 - (float(y1) / height) if height else 0.0,
                    "x1": float(x1) / width if width else 0.0,
                    "y1": 1 - (float(y0) / height) if height else 0.0,
                }
            )

        spans_by_page[page_num] = spans

    return {
        "pages_text": pages_text,
        "spans_by_page": spans_by_page,
    }


# ------------------------------------------------------------
# 3) Company detection
# ------------------------------------------------------------

@app.post("/api/templates/detect-company")
async def api_detect_company(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_text = "\n".join(page.get_text("text") or "" for page in doc)

        company_rules = detect_company(all_text, COMPANY_RULES_DIR)
        company_id = company_rules.get("company_id") if company_rules else None

        return {"ok": True, "company_id": company_id}
    except Exception as e:
        return {"ok": False, "company_id": None, "error": str(e)}


# ------------------------------------------------------------
# 4) Template-based auto-suggest
# ------------------------------------------------------------

async def _run_template_suggest_internal(
    file: UploadFile,
    company_id: Optional[str] = None,
    sensitivity: int = 50,
):
    pdf_bytes = await file.read()

    ocr_result = extract_ocr_structure(pdf_bytes)
    full_text = "\n".join(ocr_result.get("pages_text") or [])

    final_rules = build_final_rules_for_document(
        ocr_text=full_text,
        company_hint=company_id,
    )

    suggestions = generate_suggestions(
        pdf_pages=None,
        ocr_result=ocr_result,
        final_rules=final_rules,
        sensitivity=sensitivity,
    )

    cid = getattr(final_rules, "company_id", None)
    return {
        "ok": True,
        "company_id": cid,
        "suggestions": suggestions,
    }


@app.post("/api/redact/auto-suggest")
async def api_auto_suggest(file: UploadFile = File(...)):
    try:
        result = await _run_template_suggest_internal(file, company_id=None)
        return JSONResponse(result, status_code=200)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@app.post("/api/redact/auto-suggest-ocr")
async def api_auto_suggest_ocr(file: UploadFile = File(...)):
    try:
        result = await _run_template_suggest_internal(file, company_id=None)
        return JSONResponse(result, status_code=200)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ------------------------------------------------------------
# 5) Barcode / QR detection
# ------------------------------------------------------------

def find_poppler_path():
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


@app.post("/api/redact/auto-suggest-barcodes")
async def auto_suggest_barcodes(file: UploadFile = File(...)):
    pdf_bytes = await file.read()

    poppler_path = find_poppler_path()
    if poppler_path:
        pages_or_images = convert_from_bytes(
            pdf_bytes,
            dpi=200,
            poppler_path=poppler_path
        )
    else:
        # Fallback: render with PyMuPDF when Poppler/pdfinfo isn't installed.
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_or_images = []
        try:
            zoom = 200 / 72.0
            mat = fitz.Matrix(zoom, zoom)
            for page in doc:
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                pages_or_images.append(img)
        finally:
            doc.close()

    suggestions: List[Dict[str, Any]] = []
    page_number = 1

    for img in pages_or_images:
        decoded = decode(img)

        for d in decoded:
            x, y, w, h = d.rect
            width, height = img.size

            norm = {
                "x0": x / width,
                "y0": y / height,
                "x1": (x + w) / width,
                "y1": (y + h) / height
            }

            suggestions.append({
                "id": f"barcode-{page_number}-{x}-{y}",
                "page": page_number,
                "rects": [norm],
                "selected": True,
                "type": "barcode",
                "group": "barcode",
                "label": "BARCODE"
            })

        page_number += 1

    return {"ok": True, "suggestions": suggestions}


# ------------------------------------------------------------
# 6) Manual redaction
# ------------------------------------------------------------

def _apply_redactions_to_pdf(
    pdf_bytes: bytes,
    redactions: List[Dict[str, Any]],
    scrub_metadata: bool = True,
    allow_unlock: bool = True,
) -> bytes:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        for r in redactions:
            page_index = int(r.get("page", 1)) - 1
            if page_index < 0 or page_index >= len(doc):
                continue

            page = doc[page_index]
            page_rect = page.rect

            rects = r.get("rects") or []
            for nr in rects:
                try:
                    x0 = float(nr.get("x0", 0.0)) * page_rect.width
                    y0 = float(nr.get("y0", 0.0)) * page_rect.height
                    x1 = float(nr.get("x1", 1.0)) * page_rect.width
                    y1 = float(nr.get("y1", 1.0)) * page_rect.height
                except Exception:
                    continue

                rect = fitz.Rect(x0, y0, x1, y1)
                page.add_redact_annot(rect, fill=(0, 0, 0))

            page.apply_redactions()

        if scrub_metadata:
            try:
                doc.set_metadata({})
            except Exception:
                pass

        out_bytes = doc.tobytes()
        doc.close()
        return out_bytes
    except Exception as e:
        if not allow_unlock:
            raise

        # PDF permission bypass:
        # If saving/applying redactions fails (common with locked/encrypted PDFs),
        # render pages to images and rebuild a fresh PDF from those images.
        # Then re-apply redactions to the rebuilt document.
        try:
            unlocked_pdf_bytes = _unlock_pdf_via_render_to_images(pdf_bytes)
            return _apply_redactions_to_pdf(
                pdf_bytes=unlocked_pdf_bytes,
                redactions=redactions,
                scrub_metadata=scrub_metadata,
                allow_unlock=False,
            )
        except Exception as e2:
            # Bubble the original error if unlock fails.
            raise e from e2


def _unlock_pdf_via_render_to_images(pdf_bytes: bytes, zoom: float = 2.0) -> bytes:
    """
    Rebuild a new PDF from rendered page images or use pikepdf to unlock permissions.

    This helps bypass PDFs that block editing/saving when applying redactions.
    """
    # 1) Try pikepdf for metadata/permission unlocking (Fast & Lossless)
    try:
        import pikepdf
        with pikepdf.open(io.BytesIO(pdf_bytes), allow_overwriting_input=True) as pdf:
            out_buf = io.BytesIO()
            pdf.save(out_buf)
            return out_buf.getvalue()
    except Exception as e:
        print(f"pikepdf unlock failed, falling back to rasterization: {e}")

    # 2) Fallback: Rasterize to images (Stirling-PDF 'Bypass Permission' style)
    src = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        new_doc = fitz.open()
        try:
            for i in range(len(src)):
                page = src[i]
                # High-res capture for better OCR later
                pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
                w = float(page.rect.width)
                h = float(page.rect.height)

                new_page = new_doc.new_page(width=w, height=h)
                img_bytes = pix.tobytes("png")
                new_page.insert_image(fitz.Rect(0, 0, w, h), stream=img_bytes)
        finally:
            out_bytes = new_doc.tobytes()
            new_doc.close()
        return out_bytes
    finally:
        src.close()


@app.post("/api/redact/manual")
async def api_manual_redact(
    file: UploadFile = File(...),
    redactions: str = Form(...),
    scrub_metadata: str = Form("true"),
):
    try:
        pdf_bytes = await file.read()
        redactions_list = json.loads(redactions) if redactions else []
        scrub = scrub_metadata.lower() == "true"

        out_bytes = _apply_redactions_to_pdf(
            pdf_bytes=pdf_bytes,
            redactions=redactions_list,
            scrub_metadata=scrub,
        )

        return Response(
            content=out_bytes,
            media_type="application/pdf",
        )
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ------------------------------------------------------------
# 7) Batch redaction (auto-apply using suggestion engine)
# ------------------------------------------------------------
@app.post("/api/batch/redact")
async def api_batch_redact(
    files: List[UploadFile] = File(...),
    auto_apply: str = Form("true"),
    scrub_metadata: str = Form("true"),
    sensitivity: int = Form(50),
):
    """
    Batch redaction pipeline:
      - Run template rules + (offline) learned rules to generate suggestions.
      - Convert suggestions to redaction rectangles.
      - Apply redactions to each PDF.

    Output:
      - A .zip containing `<original>_Redacted.pdf` for each file (auto_apply=true),
        or `<original>_redactions.json` (auto_apply=false).
    """
    auto_apply_bool = str(auto_apply).lower() == "true"
    scrub_bool = str(scrub_metadata).lower() == "true"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        processed = []

        for f in files:
            pdf_bytes = await f.read()
            original_name = f.filename or "document.pdf"
            safe_name = os.path.splitext(os.path.basename(original_name))[0]

            try:
                ocr_result = extract_ocr_structure(pdf_bytes)
                full_text = "\n".join(ocr_result.get("pages_text") or [])
                final_rules = build_final_rules_for_document(
                    ocr_text=full_text,
                    company_hint=None,
                )

                suggestions = generate_suggestions(
                    pdf_pages=None,
                    ocr_result=ocr_result,
                    final_rules=final_rules,
                    sensitivity=sensitivity,
                )

                if not auto_apply_bool:
                    # Save suggestions for later manual review.
                    out_json = {
                        "status": "ok",
                        "company_id": getattr(final_rules, "company_id", None),
                        "suggestions": suggestions,
                    }
                    zf.writestr(f"{safe_name}_redactions.json", json.dumps(out_json, indent=2))
                    processed.append({"file": original_name, "status": "suggestions"})
                    continue

                redactions_by_page: Dict[int, List[Dict[str, Any]]] = {}
                for s in suggestions:
                    if s.get("group") == "layout_zone":
                        continue
                    rects = s.get("rects") or []
                    if not rects:
                        continue
                    page = int(s.get("page") or 1)
                    redactions_by_page.setdefault(page, []).extend(rects)

                redactions_list = [
                    {"page": p, "rects": rects}
                    for p, rects in sorted(redactions_by_page.items(), key=lambda x: x[0])
                    if rects
                ]

                out_bytes = _apply_redactions_to_pdf(
                    pdf_bytes=pdf_bytes,
                    redactions=redactions_list,
                    scrub_metadata=scrub_bool,
                    allow_unlock=True,
                )

                out_filename = build_redacted_filename(original_name)
                zf.writestr(out_filename, out_bytes)
                processed.append({"file": original_name, "status": "success"})
            except Exception as e:
                processed.append(
                    {
                        "file": original_name,
                        "status": "failed",
                        "error": str(e),
                    }
                )

        # Always include a processing summary.
        zf.writestr("batch_summary.json", json.dumps({"processed": processed}, indent=2))

    zip_bytes = zip_buf.getvalue()
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="batch_redacted.zip"'},
    )


# ------------------------------------------------------------
# 7) Plugin System Endpoints
# ------------------------------------------------------------

@app.get("/api/tools")
def list_tools():
    state = load_plugin_state()

    return [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "description": getattr(p, "description", ""),
            "version": getattr(p, "version", "1.0.0"),
            "icon": getattr(p, "icon", "fa-solid fa-toolbox"),
            "enabled": state.get(p.id, True)
        }
        for p in PLUGINS.values()
    ]



import tempfile
import shutil

@app.post("/api/tools/run/{tool_id}")
async def run_tool(tool_id: str, file: UploadFile = File(...), options: str = Form("{}")):
    if tool_id not in PLUGINS:
        return {"ok": False, "error": "Unknown tool"}

    plugin = PLUGINS[tool_id]

    # Save uploaded file to temp
    temp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    shutil.copyfileobj(file.file, temp_in)
    temp_in.close()

    opts = json.loads(options)

    # Run plugin
    output_path = plugin.run(temp_in.name, opts)

    # Return output PDF
    with open(output_path, "rb") as f:
        data = f.read()

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename=\"{tool_id}_output.pdf\"'
        }
    )
@app.post("/api/tools/reload")
def reload_plugins():
    global PLUGINS
    import importlib
    import backend.plugins.manager as mgr

    importlib.reload(mgr)
    PLUGINS = mgr.load_plugins()

    return {"ok": True, "plugins": list(PLUGINS.keys())}
PLUGIN_STATE_PATH = os.path.join(PROJECT_ROOT, "backend", "plugins", "state.json")

def load_plugin_state():
    try:
        with open(PLUGIN_STATE_PATH, "r") as f:
            return json.load(f)
    except:
        return {}

def save_plugin_state(state):
    with open(PLUGIN_STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)

@app.post("/api/tools/toggle/{tool_id}")
def toggle_plugin(tool_id: str):
    state = load_plugin_state()
    state[tool_id] = not state.get(tool_id, True)
    save_plugin_state(state)
    return {"ok": True, "tool_id": tool_id, "enabled": state[tool_id]}

# Serve static files from frontend directory (must be after all API routes)
frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    print(f"[static] Serving frontend from {frontend_dir}")
else:
    print(f"[warning] Frontend directory not found: {frontend_dir}")
