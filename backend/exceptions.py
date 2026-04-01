"""
Custom exceptions and error handling for the Redactio COA Redaction Tool.
Inspired by Stirling-PDF's exception handling patterns.
"""

from typing import Any, Dict, Optional
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse


class RedactionError(Exception):
    """Base exception for all redaction-related errors."""
    def __init__(self, message: str, code: str = "REDACTION_001", details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)


class PDFProcessingError(RedactionError):
    """Raised when PDF processing fails (e.g., invalid PDF, corruption)."""
    def __init__(self, message: str = "PDF processing failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, code="PDF_001", details=details)


class OCRProcessingError(RedactionError):
    """Raised when OCR processing fails."""
    def __init__(self, message: str = "OCR processing failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, code="OCR_001", details=details)


class TemplateError(RedactionError):
    """Raised when template loading or application fails."""
    def __init__(self, message: str = "Template error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, code="TEMPLATE_001", details=details)


class ValidationError(RedactionError):
    """Raised when input validation fails."""
    def __init__(self, message: str = "Validation error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, code="VALIDATION_001", details=details)


class ConfigurationError(RedactionError):
    """Raised when configuration is missing or invalid."""
    def __init__(self, message: str = "Configuration error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, code="CONFIG_001", details=details)


def redaction_error_handler(request, exc: RedactionError) -> JSONResponse:
    """
    FastAPI exception handler for RedactionError.
    Returns a consistent JSON error response.
    """
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "code": exc.code,
            "details": exc.details,
        },
    )


def http_exception_handler(request, exc: HTTPException) -> JSONResponse:
    """
    Handler for FastAPI's HTTPException to keep response format consistent.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTPException",
            "message": exc.detail,
            "code": f"HTTP_{exc.status_code}",
            "details": {},
        },
    )


def generic_exception_handler(request, exc: Exception) -> JSONResponse:
    """
    Catch-all exception handler for unexpected errors.
    Logs the error and returns a generic message.
    """
    # In production, log the full traceback with a request ID
    import logging
    logger = logging.getLogger(__name__)
    logger.error("Unhandled exception", exc_info=exc)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred.",
            "code": "INTERNAL_001",
            "details": {},
        },
    )