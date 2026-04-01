"""
Extraction API for PDF content extraction.
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

router = APIRouter(prefix="/api/extraction", tags=["Extraction"])


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class PageRange(BaseModel):
    start: int = 1
    end: Optional[int] = None


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_extraction_{uuid.uuid4()}")
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
async def extract_pages(
    file: UploadFile = File(...),
    page_range: str = Form("1-"),
):
    """
    Extract specific pages from PDF.
    page_range format: "1-3" or "1,2,5" or "1-"
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"extracted_pages_{file.filename}")
        
        with fitz.open(input_path) as src:
            total_pages = len(src)
            # Parse page range
            pages = []
            if '-' in page_range:
                # Range like "1-3" or "1-"
                start_end = page_range.split('-')
                start = int(start_end[0]) if start_end[0] else 1
                end = int(start_end[1]) if start_end[1] else total_pages
                pages = list(range(start, end + 1))
            elif ',' in page_range:
                # Comma separated list
                pages = [int(p.strip()) for p in page_range.split(',')]
            else:
                # Single page
                pages = [int(page_range)]
            
            # Validate pages
            pages = [p for p in pages if 1 <= p <= total_pages]
            if not pages:
                raise HTTPException(status_code=400, detail="No valid pages selected")
            
            with fitz.open() as dst:
                for p in pages:
                    dst.insert_pdf(src, from_page=p-1, to_page=p-1)
                dst.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"extracted_pages_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract pages: {str(e)}")


@router.post("/images")
async def extract_images(
    file: UploadFile = File(...),
    page_start: Optional[int] = Form(None),
    page_end: Optional[int] = Form(None),
):
    """
    Extract images from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_dir = os.path.join(temp_dir, "extracted_images")
        os.makedirs(output_dir, exist_ok=True)
        
        image_paths = PDFUtils.pdf_to_images(
            input_path, 
            output_dir,
            fmt="png"
        )
        
        # Create ZIP archive
        import zipfile
        zip_path = os.path.join(temp_dir, "extracted_images.zip")
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for p in image_paths:
                zipf.write(p, os.path.basename(p))
        
        return FileResponse(
            zip_path,
            filename="extracted_images.zip",
            media_type="application/zip"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract images: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available extraction features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Extract Pages",
                "endpoint": "/api/extraction/pages",
                "description": "Extract specific pages from PDF"
            },
            {
                "name": "Extract Images",
                "endpoint": "/api/extraction/images",
                "description": "Extract images from PDF"
            },
        ]
    })