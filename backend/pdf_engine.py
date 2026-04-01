# backend/pdf_engine.py
# SAFE LEGACY STUB — filename helper only

import os

def build_redacted_filename(original_filename: str) -> str:
    """
    Generate a safe redacted filename.
    Used only by legacy endpoints.
    """
    base, ext = os.path.splitext(original_filename)
    if not ext:
        ext = ".pdf"
    return f"{base}_Redacted{ext}"
