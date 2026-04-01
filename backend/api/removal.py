"""
Removal API for removing content from PDF.
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

router = APIRouter(prefix="/api/removal", tags=["Removal"])


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class PageRange(BaseModel):
    pages: List[int]


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_removal_{uuid.uuid4()}")
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
@router.post("/pages")
async def remove_pages(
    file: UploadFile = File(...),
    pages_json: str = Form(...),
):
    """
    Remove specific pages from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"pages_removed_{file.filename}")
        
        pages = json.loads(pages_json)
        if not isinstance(pages, list):
            raise HTTPException(status_code=400, detail="Pages must be a JSON array")
        
        with fitz.open(input_path) as src:
            total_pages = len(src)
            # Keep pages not in the list (1-indexed)
            keep_pages = [i for i in range(total_pages) if (i + 1) not in pages]
            if len(keep_pages) == 0:
                raise HTTPException(status_code=400, detail="Cannot remove all pages")
            
            with fitz.open() as dst:
                for p in keep_pages:
                    dst.insert_pdf(src, from_page=p, to_page=p)
                dst.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"pages_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove pages: {str(e)}")


@router.post("/blank-pages")
async def remove_blank_pages(
    file: UploadFile = File(...),
    threshold: float = Form(0.01),
):
    """
    Remove blank pages from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"blank_removed_{file.filename}")
        
        with fitz.open(input_path) as src:
            keep_pages = []
            for i, page in enumerate(src):
                text = page.get_text()
                # Consider page blank if text length is very small
                if len(text.strip()) > 0:
                    keep_pages.append(i)
                else:
                    # Also check for images
                    if len(page.get_images()) > 0:
                        keep_pages.append(i)
            
            if len(keep_pages) == 0:
                raise HTTPException(status_code=400, detail="All pages appear blank")
            
            with fitz.open() as dst:
                for p in keep_pages:
                    dst.insert_pdf(src, from_page=p, to_page=p)
                dst.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"blank_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove blank pages: {str(e)}")


@router.post("/annotations")
async def remove_annotations(
    file: UploadFile = File(...),
):
    """
    Remove annotations from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"annotations_removed_{file.filename}")
        
        with fitz.open(input_path) as doc:
            for page in doc:
                annots = page.annots()
                if annots:
                    for annot in annots:
                        page.delete_annot(annot)
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"annotations_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove annotations: {str(e)}")


@router.post("/images")
async def remove_images(
    file: UploadFile = File(...),
):
    """
    Remove images from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"images_removed_{file.filename}")
        
        with fitz.open(input_path) as doc:
            for page in doc:
                img_list = page.get_images()
                for img in img_list:
                    # img[0] is the xref of the image
                    page.delete_image(img[0])
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"images_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove images: {str(e)}")


@router.post("/password")
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


@router.post("/certificate-sign")
async def remove_certificate_sign(
    file: UploadFile = File(...),
):
    """
    Remove certificate signature from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"certificate_removed_{file.filename}")
        
        with pikepdf.open(input_path) as pdf:
            # Remove digital signatures from AcroForm
            if '/AcroForm' in pdf.root:
                acroform = pdf.root.AcroForm
                if '/Fields' in acroform:
                    fields = acroform.Fields
                    new_fields = []
                    for field in fields:
                        if field.get('/FT') != '/Sig':
                            new_fields.append(field)
                    acroform.Fields = new_fields
            
            # Also check for signature widgets on pages
            for page in pdf.pages:
                if '/Annots' in page:
                    annots = page.Annots
                    new_annots = []
                    for annot in annots:
                        if annot.get('/Subtype') != '/Widget' or annot.get('/FT') != '/Sig':
                            new_annots.append(annot)
                    page.Annots = new_annots
            
            pdf.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"certificate_removed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove certificate signature: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available removal features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Remove Pages",
                "endpoint": "/api/removal/pages",
                "description": "Remove specific pages from PDF"
            },
            {
                "name": "Remove Blank pages",
                "endpoint": "/api/removal/blank-pages",
                "description": "Remove blank pages from PDF"
            },
            {
                "name": "Remove Annotations",
                "endpoint": "/api/removal/annotations",
                "description": "Remove annotations from PDF"
            },
            {
                "name": "Remove image",
                "endpoint": "/api/removal/images",
                "description": "Remove images from PDF (placeholder)"
            },
            {
                "name": "Remove Password",
                "endpoint": "/api/removal/password",
                "description": "Remove password protection from PDF"
            },
            {
                "name": "Remove Certificate Sign",
                "endpoint": "/api/removal/certificate-sign",
                "description": "Remove certificate signature from PDF (placeholder)"
            },
        ]
    })