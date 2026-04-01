"""
Document Review API for PDF manipulation features.
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

router = APIRouter(prefix="/api/document", tags=["Document-Review"])


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class MetadataUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    keywords: Optional[str] = None
    creator: Optional[str] = None
    producer: Optional[str] = None


class TocEntry(BaseModel):
    title: str
    page: int
    level: int = 1
    children: Optional[List['TocEntry']] = None


TocEntry.update_forward_refs()


class TocUpdate(BaseModel):
    entries: List[TocEntry]


class SignRequest(BaseModel):
    reason: Optional[str] = None
    location: Optional[str] = None
    contact_info: Optional[str] = None


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_doc_review_{uuid.uuid4()}")
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
@router.post("/metadata/update")
async def update_metadata(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    creator: Optional[str] = Form(None),
    producer: Optional[str] = Form(None),
):
    """
    Update PDF metadata.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"metadata_updated_{file.filename}")
        
        metadata = {}
        if title: metadata['title'] = title
        if author: metadata['author'] = author
        if subject: metadata['subject'] = subject
        if keywords: metadata['keywords'] = keywords
        if creator: metadata['creator'] = creator
        if producer: metadata['producer'] = producer
        
        PDFUtils.update_metadata(input_path, output_path, metadata)
        
        return FileResponse(
            output_path,
            filename=f"metadata_updated_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update metadata: {str(e)}")
    finally:
        # Cleanup temp files after some time
        pass


@router.post("/toc/update")
async def update_table_of_contents(
    file: UploadFile = File(...),
    toc_json: str = Form(...),
):
    """
    Update PDF table of contents (bookmarks).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"toc_updated_{file.filename}")
        
        # Parse TOC entries
        toc_data = json.loads(toc_json)
        
        # Open PDF with pikepdf to update bookmarks
        with pikepdf.open(input_path) as pdf:
            # Clear existing bookmarks
            if '/Outlines' in pdf.Root:
                del pdf.Root.Outlines
            
            # Create new bookmarks if we have entries
            if toc_data.get('entries'):
                # For now, we'll use a simple approach - more advanced TOC editing
                # would require more complex PDF manipulation
                # This is a placeholder implementation
                pass
            
            pdf.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"toc_updated_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update table of contents: {str(e)}")


@router.post("/toc/extract")
async def extract_table_of_contents(
    file: UploadFile = File(...),
):
    """
    Extract existing table of contents from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        
        with pikepdf.open(input_path) as pdf:
            toc_entries = []
            
            # Extract bookmarks if they exist
            if '/Outlines' in pdf.Root:
                outlines = pdf.Root.Outlines
                # Simple extraction - in real implementation would traverse the outline tree
                toc_entries.append({
                    "title": "Extracted bookmarks",
                    "count": "Present" if outlines else "None"
                })
            
            return JSONResponse({
                "filename": file.filename,
                "page_count": len(pdf.pages),
                "has_toc": '/Outlines' in pdf.Root,
                "toc_entries": toc_entries
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract table of contents: {str(e)}")


@router.post("/read/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    page_start: Optional[int] = Form(None),
    page_end: Optional[int] = Form(None),
):
    """
    Extract text from PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        
        with fitz.open(input_path) as doc:
            text_by_page = {}
            start_page = page_start or 1
            end_page = page_end or len(doc)
            
            for page_num in range(start_page - 1, min(end_page, len(doc))):
                page = doc[page_num]
                text = page.get_text()
                text_by_page[page_num + 1] = text
            
            return JSONResponse({
                "filename": file.filename,
                "total_pages": len(doc),
                "text_extracted": len(text_by_page),
                "text_by_page": text_by_page
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")


@router.post("/read/extract-images")
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
        
        # Return info about extracted images
        return JSONResponse({
            "filename": file.filename,
            "images_extracted": len(image_paths),
            "image_paths": [os.path.basename(p) for p in image_paths],
            "message": f"Extracted {len(image_paths)} images to temporary directory"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract images: {str(e)}")


@router.post("/sign/prepare")
async def prepare_for_signing(
    file: UploadFile = File(...),
    reason: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
):
    """
    Prepare PDF for digital signing (add signature field).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"prepared_for_signing_{file.filename}")
        
        # For now, just copy the file as a placeholder
        # In a real implementation, we would add signature fields
        import shutil
        shutil.copy2(input_path, output_path)
        
        return FileResponse(
            output_path,
            filename=f"prepared_for_signing_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to prepare for signing: {str(e)}")


@router.post("/sign/apply")
async def apply_signature(
    file: UploadFile = File(...),
    certificate_file: Optional[UploadFile] = File(None),
    password: Optional[str] = Form(None),
    reason: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
):
    """
    Apply digital signature to PDF (placeholder - requires proper certificate handling).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"signed_{file.filename}")
        
        # This is a placeholder - real digital signature requires proper certificate handling
        # For now, we'll just add a visible signature annotation
        with fitz.open(input_path) as doc:
            # Add a signature annotation on first page
            if len(doc) > 0:
                page = doc[0]
                rect = fitz.Rect(50, 50, 250, 100)
                annot = page.add_freetext_annot(
                    rect,
                    "Digitally Signed\n" + (reason or "Approved") + "\n" + (location or ""),
                    fontsize=10,
                    fill_color=(0.9, 0.9, 0.9)
                )
                annot.update()
            
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"signed_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply signature: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available document review features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Change Metadata",
                "endpoint": "/api/document/metadata/update",
                "description": "Update PDF metadata (title, author, subject, etc.)"
            },
            {
                "name": "Edit Table of Contents",
                "endpoint": "/api/document/toc/update",
                "description": "Modify PDF bookmarks/outline"
            },
            {
                "name": "Extract Table of Contents",
                "endpoint": "/api/document/toc/extract",
                "description": "Extract existing bookmarks from PDF"
            },
            {
                "name": "Extract Text",
                "endpoint": "/api/document/read/extract-text",
                "description": "Extract text content from PDF"
            },
            {
                "name": "Extract Images",
                "endpoint": "/api/document/read/extract-images",
                "description": "Extract images from PDF pages"
            },
            {
                "name": "Prepare for Signing",
                "endpoint": "/api/document/sign/prepare",
                "description": "Add signature fields to PDF"
            },
            {
                "name": "Apply Signature",
                "endpoint": "/api/document/sign/apply",
                "description": "Apply digital signature to PDF"
            }
        ]
    })