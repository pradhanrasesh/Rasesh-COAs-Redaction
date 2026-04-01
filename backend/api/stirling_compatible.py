# ------------------------------------------------------------
# backend/api/stirling_compatible.py
# FIXED: Y-flip, rect validation, multi-mode support, error handling
# ------------------------------------------------------------

import json

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse

from backend.redaction.manual_redaction_engine import ManualRedactionEngine

router = APIRouter(prefix="/stirling", tags=["Stirling-PDF Compatible"])

manual_engine = ManualRedactionEngine()


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def _clamp(v):
    try:
        v = float(v)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, v))


def _normalize_rect(r):
    """Normalize Stirling rect → normalized PDF rect with Y-flip."""
    pw = r.get("pageWidth") or 1
    ph = r.get("pageHeight") or 1

    x = r.get("x", 0)
    y = r.get("y", 0)
    w = r.get("width", 0)
    h = r.get("height", 0)

    # Convert to normalized
    x0 = _clamp(x / pw)
    x1 = _clamp((x + w) / pw)

    # FIXED: Y-FLIP (Stirling uses top-left origin)
    y0 = _clamp(1 - ((y + h) / ph))
    y1 = _clamp(1 - (y / ph))

    return {
        "x0": min(x0, x1),
        "y0": min(y0, y1),
        "x1": max(x0, x1),
        "y1": max(y0, y1),
    }


def _normalize_mode(stirling_type: str) -> str:
    """Map Stirling redaction types → internal modes."""
    t = (stirling_type or "").lower()

    if t in ("highlight", "hl"):
        return "highlight"
    if t in ("underline", "ul"):
        return "underline"
    if t in ("strikeout", "strike", "so"):
        return "strikeout"
    if t in ("white", "erase"):
        return "white"
    if t in ("remove", "delete"):
        return "remove"

    # Default
    return "black"


# ------------------------------------------------------------
# API endpoint
# ------------------------------------------------------------
@router.post("/api/v1/redact")
async def stirling_redact(
    file: UploadFile = File(...),
    redactions: str = Form(...),
):
    """
    Compatible with Stirling-PDF's redaction API format.

    FIXED:
    - Y-axis flip
    - Rect validation
    - Multi-mode support
    - Error handling
    """
    try:
        pdf_bytes = await file.read()
    except Exception:
        return JSONResponse({"error": "Failed to read uploaded file"}, status_code=400)

    try:
        stirling_redactions = json.loads(redactions)
        if not isinstance(stirling_redactions, list):
            raise ValueError("Redactions must be a JSON array")
    except Exception as e:
        return JSONResponse({"error": f"Invalid redactions JSON: {e}"}, status_code=400)

    converted = []

    for r in stirling_redactions:
        try:
            rect = _normalize_rect(r)
            mode = _normalize_mode(r.get("redactionType"))
            color = r.get("color", "#000000")

            converted.append(
                {
                    "page": r.get("page", 1),
                    "type": "box",
                    "rects": [rect],
                    "color": color,
                    "mode": mode,
                }
            )
        except Exception as e:
            # Skip malformed entries but continue processing
            print(f"[stirling_compatible] WARNING: Skipping malformed redaction: {e}")
            continue

    try:
        out_path = manual_engine.apply_redactions(
            pdf_bytes=pdf_bytes,
            redactions=converted,
            scrub_metadata=True,
            base_filename=file.filename,
        )
    except Exception as e:
        return JSONResponse({"error": f"Redaction failed: {e}"}, status_code=500)

    return FileResponse(
        out_path,
        media_type="application/pdf",
        filename=file.filename or "redacted.pdf",
    )
