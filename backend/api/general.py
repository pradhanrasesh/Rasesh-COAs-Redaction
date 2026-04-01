"""
General PDF editing API.
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

import fitz
import pikepdf

router = APIRouter(prefix="/api/general", tags=["General"])


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class TextAddRequest(BaseModel):
    text: str
    x: float
    y: float
    page: int = 1
    font_size: int = 12
    color: str = "#000000"


class ImageAddRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float
    page: int = 1


class AnnotationRequest(BaseModel):
    type: str  # "highlight", "underline", "strikeout", "text"
    rect: Dict[str, float]  # x, y, width, height
    page: int = 1
    content: Optional[str] = None
    color: str = "#FFFF00"


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_general_{uuid.uuid4()}")
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
@router.post("/add-text")
async def add_text(
    file: UploadFile = File(...),
    text: str = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    page: int = Form(1),
    font_size: int = Form(12),
    color: str = Form("#000000"),
):
    """
    Add text to PDF at specified position.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"text_added_{file.filename}")
        
        with fitz.open(input_path) as doc:
            if page < 1 or page > len(doc):
                raise HTTPException(status_code=400, detail="Invalid page number")
            pdf_page = doc[page - 1]
            
            # Convert hex color to RGB
            color = color.lstrip('#')
            if len(color) == 6:
                r = int(color[0:2], 16) / 255.0
                g = int(color[2:4], 16) / 255.0
                b = int(color[4:6], 16) / 255.0
            else:
                r, g, b = 0, 0, 0
            
            pdf_page.insert_text(
                (x, y),
                text,
                fontsize=font_size,
                color=(r, g, b)
            )
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"text_added_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add text: {str(e)}")


@router.post("/add-image")
async def add_image(
    file: UploadFile = File(...),
    image_file: UploadFile = File(...),
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
    page: int = Form(1),
):
    """
    Add image to PDF at specified position.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        image_path = _save_upload_file(image_file, temp_dir)
        output_path = os.path.join(temp_dir, f"image_added_{file.filename}")
        
        with fitz.open(input_path) as doc:
            if page < 1 or page > len(doc):
                raise HTTPException(status_code=400, detail="Invalid page number")
            pdf_page = doc[page - 1]
            
            rect = fitz.Rect(x, y, x + width, y + height)
            pdf_page.insert_image(rect, filename=image_path)
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"image_added_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add image: {str(e)}")


@router.post("/annotate")
async def annotate_pdf(
    file: UploadFile = File(...),
    annotation_json: str = Form(...),
):
    """
    Add annotation to PDF.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"annotated_{file.filename}")
        
        data = json.loads(annotation_json)
        annot_type = data.get("type", "highlight")
        rect_data = data.get("rect", {})
        page_num = data.get("page", 1)
        content = data.get("content", "")
        color = data.get("color", "#FFFF00")
        
        with fitz.open(input_path) as doc:
            if page_num < 1 or page_num > len(doc):
                raise HTTPException(status_code=400, detail="Invalid page number")
            pdf_page = doc[page_num - 1]
            
            x = rect_data.get("x", 0)
            y = rect_data.get("y", 0)
            width = rect_data.get("width", 100)
            height = rect_data.get("height", 20)
            rect = fitz.Rect(x, y, x + width, y + height)
            
            # Convert color
            color = color.lstrip('#')
            if len(color) == 6:
                r = int(color[0:2], 16) / 255.0
                g = int(color[2:4], 16) / 255.0
                b = int(color[4:6], 16) / 255.0
            else:
                r, g, b = 1, 1, 0  # yellow
            
            if annot_type == "highlight":
                annot = pdf_page.add_highlight_annot(rect)
                annot.set_colors(stroke=(r, g, b))
                annot.update()
            elif annot_type == "underline":
                annot = pdf_page.add_underline_annot(rect)
                annot.set_colors(stroke=(r, g, b))
                annot.update()
            elif annot_type == "strikeout":
                annot = pdf_page.add_strikeout_annot(rect)
                annot.set_colors(stroke=(r, g, b))
                annot.update()
            elif annot_type == "text":
                annot = pdf_page.add_text_annot(rect, content)
                annot.set_colors(stroke=(r, g, b))
                annot.update()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported annotation type: {annot_type}")
            
            doc.save(output_path)
        
        return FileResponse(
            output_path,
            filename=f"annotated_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add annotation: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available general editing features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Add Text",
                "endpoint": "/api/general/add-text",
                "description": "Add text to PDF at specified position"
            },
            {
                "name": "Add image",
                "endpoint": "/api/general/add-image",
                "description": "Add image to PDF at specified position"
            },
            {
                "name": "Annotate",
                "endpoint": "/api/general/annotate",
                "description": "Add annotation to PDF"
            },
        ]
    })