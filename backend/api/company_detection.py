# backend/api/company_detection.py
# FIXED: Added FastAPI router for company detection

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse

from backend.company_detector import CompanyDetector

router = APIRouter(prefix="/company", tags=["Company Detection"])

detector = CompanyDetector()

@router.post("/detect")
async def detect_company(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        result = detector.detect_company_json(pdf_bytes)

        return JSONResponse(result, status_code=200)

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
