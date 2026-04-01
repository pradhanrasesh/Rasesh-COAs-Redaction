# backend/pdf_text_extractor.py
# SAFE LEGACY STUB — prevents crashes in old endpoints

class PDFTextExtractor:
    """
    Legacy-safe text extractor.
    Modern pipeline uses TextFinder + OCR, so this stub simply
    returns an empty string but exposes BOTH methods used by
    legacy endpoints:
      - extract(pdf_bytes)
      - extract_text(file_path)
    """

    def extract(self, pdf_bytes: bytes) -> str:
        # Legacy behavior: return empty text
        return ""

    def extract_text(self, file_path: str) -> str:
        # Legacy behavior: return empty text
        return ""
