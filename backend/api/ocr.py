from fastapi import APIRouter, UploadFile, File
from backend.ocr_engine import OCREngine

router = APIRouter()
ocr_engine = OCREngine()

@router.get("/ocr/health")
async def ocr_health():
    return {"status": "ok", "engine": "local-ocr-engine"}

@router.post("/ocr")
async def ocr_pdf(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    words = ocr_engine.ocr_pdf_bytes(pdf_bytes)

    return [
        {
            "page": w.page,
            "text": w.text,
            "x0": w.x0,
            "y0": w.y0,
            "x1": w.x1,
            "y1": w.y1,
        }
        for w in words
    ]
