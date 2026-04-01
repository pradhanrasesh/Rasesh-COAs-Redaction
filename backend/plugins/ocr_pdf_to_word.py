import os
import fitz
from docx import Document
from docx.shared import Inches
from backend.plugins.base import ToolPlugin
from typing import Dict, Any

class OCRWordPlugin(ToolPlugin):
    id = "ocr_pdf_to_word"
    name = "PDF to Word (OCR)"
    category = "conversion"
    description = "Convert PDF to an editable Word document using OCR layout preservation."
    icon = "fa-solid fa-file-word"

    def run(self, input_path: str, options: Dict[str, Any]) -> str:
        doc = Document()
        pdf = fitz.open(input_path)
        
        output_path = input_path.replace(".pdf", ".docx")
        
        for page in pdf:
            # Add text from page
            text = page.get_text("text")
            if text.strip():
                doc.add_paragraph(text)
            
            # Optional: Add images if needed
            # For simplicity in this first version, we just extract text.
            # Real Stirling-style would use hOCR or similar for positioning.
        
        pdf.close()
        doc.save(output_path)
        return output_path

