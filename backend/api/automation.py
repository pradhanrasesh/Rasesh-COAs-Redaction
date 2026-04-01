"""
Automation API for PDF automation tasks.
Inspired by Stirling-PDF functionality.
"""
import os
import json
import tempfile
import uuid
import re
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import fitz
import pikepdf

router = APIRouter(prefix="/api/automation", tags=["Automation"])


# ------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------
def _create_temp_dir() -> str:
    """Create a temporary directory for processing files."""
    temp_dir = os.path.join(tempfile.gettempdir(), f"redact_automation_{uuid.uuid4()}")
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
@router.post("/auto-rename")
async def auto_rename_pdf(
    file: UploadFile = File(...),
    pattern: str = Form("{title}_{date}.pdf"),
):
    """
    Auto rename PDF file based on metadata or content.
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        
        with fitz.open(input_path) as doc:
            metadata = doc.metadata
            title = metadata.get('title', 'Untitled')
            author = metadata.get('author', 'Unknown')
            # Extract date from metadata or use current date
            from datetime import datetime
            date = datetime.now().strftime("%Y%m%d")
            
            # Build new filename
            new_name = pattern
            new_name = new_name.replace("{title}", title[:50])
            new_name = new_name.replace("{author}", author[:30])
            new_name = new_name.replace("{date}", date)
            new_name = new_name.replace("{original}", file.filename.rsplit('.', 1)[0])
            
            # Ensure .pdf extension
            if not new_name.lower().endswith('.pdf'):
                new_name += '.pdf'
            
            # Sanitize filename
            new_name = re.sub(r'[<>:"/\\|?*]', '_', new_name)
            
            output_path = os.path.join(temp_dir, new_name)
            # Copy file with new name
            import shutil
            shutil.copy2(input_path, output_path)
        
        return FileResponse(
            output_path,
            filename=new_name,
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to auto rename PDF: {str(e)}")


@router.post("/automate")
async def automate_pdf(
    file: UploadFile = File(...),
    actions_json: str = Form("[]"),
):
    """
    Apply a series of automation actions to PDF (placeholder).
    """
    temp_dir = _create_temp_dir()
    try:
        input_path = _save_upload_file(file, temp_dir)
        output_path = os.path.join(temp_dir, f"automated_{file.filename}")
        
        actions = json.loads(actions_json)
        if not isinstance(actions, list):
            raise HTTPException(status_code=400, detail="Actions must be a JSON array")
        
        # Placeholder: just copy the file
        import shutil
        shutil.copy2(input_path, output_path)
        
        return FileResponse(
            output_path,
            filename=f"automated_{file.filename}",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to automate PDF: {str(e)}")


@router.get("/features")
async def list_features():
    """
    List available automation features.
    """
    return JSONResponse({
        "features": [
            {
                "name": "Auto Rename PDF File",
                "endpoint": "/api/automation/auto-rename",
                "description": "Auto rename PDF file based on metadata or content"
            },
            {
                "name": "Automate",
                "endpoint": "/api/automation/automate",
                "description": "Apply a series of automation actions to PDF (placeholder)"
            },
        ]
    })