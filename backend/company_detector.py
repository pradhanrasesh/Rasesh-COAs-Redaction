# ------------------------------------------------------------
# company_detector.py — Template‑driven company detection engine
# ------------------------------------------------------------

import re
from typing import Optional, Dict, Any, List
from difflib import SequenceMatcher

from backend.redaction.text_finder import TextFinder
from backend.template_loader import TemplateLoader


class CompanyDetector:
    """
    Detects the company associated with a PDF using:
    - template keywords
    - aliases
    - regex rules
    - fuzzy matching
    - OCR fallback
    """

    def __init__(self, template_loader: Optional[TemplateLoader] = None):
        self.text_finder = TextFinder()
        self.template_loader = template_loader or TemplateLoader()

    # ------------------------------------------------------------
    # Fuzzy match helper
    # ------------------------------------------------------------
    def _fuzzy_match(self, a: str, b: str) -> float:
        return SequenceMatcher(None, a.lower(), b.lower()).ratio()

    # ------------------------------------------------------------
    # Extract full text from PDF (with OCR fallback)
    # ------------------------------------------------------------
    def _extract_text(self, pdf_bytes: bytes) -> str:
        spans = self.text_finder.find_text_spans(pdf_bytes, use_ocr=False, auto_ocr=True)
        return " ".join(s.text for s in spans)

    # ------------------------------------------------------------
    # Score a template against the document text
    # ------------------------------------------------------------
    def _score_template(self, template: Dict[str, Any], text: str) -> float:
        score = 0.0

        # 1. Keywords
        for kw in template.get("keywords", []):
            if kw.lower() in text.lower():
                score += 5

        # 2. Aliases (fuzzy)
        for alias in template.get("aliases", []):
            if alias.lower() in text.lower():
                score += 10
            else:
                ratio = self._fuzzy_match(alias, text)
                if ratio > 0.75:
                    score += ratio * 5

        # 3. Regex rules
        for rule in template.get("rules", []):
            if rule.get("type") != "regex":
                continue

            pattern = rule.get("pattern")
            flags = rule.get("flags", "i")

            re_flags = 0
            if "i" in flags: re_flags |= re.IGNORECASE
            if "m" in flags: re_flags |= re.MULTILINE
            if "s" in flags: re_flags |= re.DOTALL

            if re.search(pattern, text, re_flags):
                score += 15

        return score

    # ------------------------------------------------------------
    # Main detection entry point
    # ------------------------------------------------------------
    def detect_company(self, pdf_bytes: bytes) -> Optional[str]:
        text = self._extract_text(pdf_bytes)

        templates = self.template_loader.get_all_templates()
        best_company = None
        best_score = 0.0

        for template in templates:
            score = self._score_template(template, text)
            if score > best_score:
                best_score = score
                best_company = template.get("company_id")

        # Threshold to avoid false positives
        if best_score < 10:
            return None

        return best_company

    # ------------------------------------------------------------
    # JSON output for API
    # ------------------------------------------------------------
    def detect_company_json(self, pdf_bytes: bytes):
        company_id = self.detect_company(pdf_bytes)
        return {"company_id": company_id}
