# backend/api/__init__.py

from .auto_suggest import router as auto_suggest_router
from .company_detection import router as company_detection_router
from .ocr import router as ocr_router
from .stirling_compatible import router as stirling_router

# Router list kept for lightweight module compatibility.
routers = [
    auto_suggest_router,
    company_detection_router,
    ocr_router,
    stirling_router,
]
