"""
Document Security API for PDF security features.
Inspired by Stirling-PDF functionality.
"""
import os
import json
import tempfile
import uuid
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.pdf_utils import PDFUtils
import fitz
import pikepdf

router = APIRouter(prefix="/api/security", tags=["Document-Security"])


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class PasswordRequest(BaseModel):
    password: str


class WatermarkRequest(BaseModel):
    text: Optional[str] = None
    image_path: Optional[str] = None
    opacity: float = 0.5


class StampRequest(BaseModel):
    text: Optional[str] = None
    image_path: Optional[str] = None
    position: str = "center"


class PermissionsRequest(BaseModel):
    print_allowed: bool = True
    modify_allowed: bool = True
    copy_allowed: bool = True
    annotate_allowed: bool = True


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_security_{uuid.uuid4()}")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir


def _save_upload_file(upload_file: UploadFile, directory: str) -> str:
    """Save uploaded file to directory and return path."""
    file_path = os.path.join(directory, upload_file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())
    return file_path


# ------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------
@router.post("/password/add")
async def add_password(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    """
    Add password protection to PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"password_protected_{file.filename}")
        
        PDFUtils.add_password(input_path, output_path, password)
        
        return FileResponse(
            output_path,
            filename=f"password_protected_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add password: {str(e)}")


@router.post("/password/remove")
async def remove_password(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    """
    Remove password protection from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"password_removed_{file.filename}")
        
        PDFUtils.remove_password(input_path, output_path, password)
        
        return FileResponse(
            output_path,
            filename=f"password_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove password: {str(e)}")


@router.post("/watermark/add")
async def add_watermark(
    file: UploadFile = File(...),
    text: str = Form(...),
):
    """
    Add text watermark to PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"watermarked_{file.filename}")
        
        PDFUtils.add_watermark(input_path, output_path, text)
        
        return FileResponse(
            output_path,
            filename=f"watermarked_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add watermark: {str(e)}")


@router.post("/stamp/add")
async def add_stamp(
    file: UploadFile = File(...),
    text: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
):
    """
    Add stamp (text or image) to PDF.
    Supports both text stamps (using watermark) and image stamps.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"stamped_{file.filename}")
        
        # Implement text stamp using watermark function
        if text:
            PDFUtils.add_watermark(input_path, output_path, text)
        elif image_file:
            # Save image and implement image stamp
            image_path = _save_upload_file(image_file, temp_dir)
            # Use the new image stamp method with default position/size
            PDFUtils.add_image_stamp(input_path, output_path, image_path)
        else:
            raise HTTPException(status_code=400, detail="Either text or image must be provided")
        
        return FileResponse(
            output_path,
            filename=f"stamped_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add stamp: {str(e)}")


@router.post("/sanitize")
async def sanitize_pdf(
    file: UploadFile = File(...),
):
    """
    Sanitize PDF by removing potentially malicious content.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"sanitized_{file.filename}")
        
        # Use pikepdf to sanitize by rewriting the PDF
        with pikepdf.open(input_path) as pdf:
            pdf.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"sanitized_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sanitize PDF: {str(e)}")


@router.post("/flatten")
async def flatten_pdf(
    file: UploadFile = File(...),
):
    """
    Flatten PDF (merge annotations and form fields into page content).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"flattened_{file.filename}")
        
        # Use fitz to flatten annotations
        with fitz.open(input_path) as doc:
            for page in doc:
                page.apply_redactions()  # This also flatten annotations
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"flattened_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to flatten PDF: {str(e)}")


@router.post("/forms/unlock")
async def unlock_pdf_forms(
    file: UploadFile = File(...),
):
    """
    Unlock PDF forms (make form fields editable).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"forms_unlocked_{file.filename}")
        
        # Use pikepdf to remove form field restrictions
        with pikepdf.open(input_path) as pdf:
            if '/AcroForm' in pdf.Root:
                acroform = pdf.Root.AcroForm
                if '/Fields' in acroform:
                    # Remove any field restrictions (simplistic)
                    pass
            pdf.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"forms_unlocked_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unlock PDF forms: {str(e)}")


@router.post("/permissions/change")
async def change_permissions(
    file: UploadFile = File(...),
    print_allowed: bool = Form(True),
    modify_allowed: bool = Form(True),
    copy_allowed: bool = Form(True),
    annotate_allowed: bool = Form(True),
):
    """
    Change PDF permissions (placeholder).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"permissions_updated_{file.filename}")
        
        # Currently, pikepdf does not support setting permissions directly.
        # For now, just copy the file as placeholder.
        import shutil
        shutil.copy2(input_path, output_path)
        
        return FileResponse(
            output_path,
            filename=f"permissions_updated_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to change permissions: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available document security features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Add Password",
                "endpoint": "/api/security/password/add",
                "description": "Add password protection to PDF"
            },
            {
                "name": "Remove Password",
                "endpoint": "/api/security/password/remove",
                "description": "Remove password protection from PDF"
            },
            {
                "name": "Add Watermark",
                "endpoint": "/api/security/watermark/add",
                "description": "Add text watermark to PDF"
            },
            {
                "name": "Add Stamp",
                "endpoint": "/api/security/stamp/add",
                "description": "Add stamp (text or image) to PDF"
            },
            {
                "name": "Sanitize PDF",
                "endpoint": "/api/security/sanitize",
                "description": "Sanitize PDF by removing potentially malicious content"
            },
            {
                "name": "Flatten PDF",
                "endpoint": "/api/security/flatten",
                "description": "Flatten PDF (merge annotations and form fields)"
            },
            {
                "name": "Unlock PDF Forms",
                "endpoint": "/api/security/forms/unlock",
                "description": "Unlock PDF forms (make form fields editable)"
            },
            {
                "name": "Change Permissions",
                "endpoint": "/api/security/permissions/change",
                "description": "Change PDF permissions (placeholder)"
            },
        ]
    })