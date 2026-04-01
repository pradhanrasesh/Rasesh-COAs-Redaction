from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from backend.redaction.text_finder import TextFinder
from backend.suggestions import build_final_rules_for_document, generate_suggestions
from backend.ai.local_learner import update_learned_rules


def _spans_to_ocr_result(spans: List[Any]) -> Dict[str, Any]:
    """
    Convert TextFinder spans into the ocr_result shape expected by backend/suggestions.py:
      { pages_text: [...], spans_by_page: {page: [{text,x0,y0,x1,y1}, ...]} }
    """
    spans_by_page: Dict[int, List[Dict[str, float]]] = {}

    for s in spans or []:
        page = int(getattr(s, "page", 1) or 1)
        text = getattr(s, "text", "") or ""
        spans_by_page.setdefault(page, []).append(
            {
                "text": str(text),
                "x0": float(getattr(s, "x0", 0.0) or 0.0),
                "y0": float(getattr(s, "y0", 0.0) or 0.0),
                "x1": float(getattr(s, "x1", 1.0) or 1.0),
                "y1": float(getattr(s, "y1", 1.0) or 1.0),
            }
        )

    pages = sorted(spans_by_page.keys()) if spans_by_page else []
    pages_text = [
        " ".join(s["text"] for s in spans_by_page[p] if (s.get("text") or "").strip())
        for p in pages
    ] if spans_by_page else [""]

    return {
        "pages_text": pages_text,
        "spans_by_page": spans_by_page,
    }


def _rect_sig(rect: Dict[str, float], nd: int = 3) -> Tuple[float, float, float, float]:
    return (
        round(float(rect.get("x0", 0.0)), nd),
        round(float(rect.get("y0", 0.0)), nd),
        round(float(rect.get("x1", 1.0)), nd),
        round(float(rect.get("y1", 1.0)), nd),
    )


def _suggestion_sig(s: Dict[str, Any]) -> Tuple[str, str, Tuple[float, float, float, float]]:
    rects = s.get("rects") or []
    rect = rects[0] if rects else {}
    return (str(s.get("label") or ""), str(s.get("text") or ""), _rect_sig(rect))


def train_from_pair(
    unredacted_pdf_bytes: bytes,
    redacted_pdf_bytes: bytes,
    company_hint: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Offline pair training:
    - Compare original vs redacted PDFs pixel-by-pixel or span-by-span.
    - Identify text that was removed/redacted in the second file.
    - Guess labels and learn rules.
    """
    finder = TextFinder()
    
    # 1. Extract spans
    orig_spans = finder.find_text_spans(unredacted_pdf_bytes, use_ocr=False, auto_ocr=True)
    red_spans = finder.find_text_spans(redacted_pdf_bytes, use_ocr=False, auto_ocr=True)
    
    # 2. Identify missing spans (redacted)
    red_sigs = { (s.page, round(s.x0, 3), round(s.y0, 3)) for s in red_spans }
    
    missing_spans = []
    for s in orig_spans:
        sig = (s.page, round(s.x0, 3), round(s.y0, 3))
        if sig not in red_sigs:
            missing_spans.append(s)
            
    if not missing_spans:
        return {"status": "no_changes_detected", "events_created": 0}
        
    # 3. Build rules context
    ocr_original = _spans_to_ocr_result(orig_spans)
    full_text = " ".join(ocr_original.get("pages_text") or [])
    final_rules = build_final_rules_for_document(full_text, company_hint=company_hint)
    
    learned_company_id = str(getattr(final_rules, "company_id", None) or company_hint or "universal")
    display_name = str(getattr(final_rules, "display_name", None) or learned_company_id)
    
    # 4. Create events from missing spans
    events = []
    from backend.suggestions import _LABEL_TOKENS # Heuristic helper
    
    for s in missing_spans:
        # Simple heuristic: look for text to the left on the same line
        label = "REDACTED"
        # Find spans on same page, same Y, but earlier X
        row_candidates = [o for o in orig_spans if o.page == s.page and abs(o.y0 - s.y0) < 0.005 and o.x0 < s.x0]
        if row_candidates:
            # Take the closest one to the left
            row_candidates.sort(key=lambda x: s.x0 - x.x0)
            candidate_text = row_candidates[0].text.strip().upper()
            if candidate_text in _LABEL_TOKENS:
                label = candidate_text.strip(":")
        
        events.append({
            "label": label,
            "sample_text": s.text,
            "rects": [{"x0": s.x0, "y0": s.y0, "x1": s.x1, "y1": s.y1}],
            "page": s.page
        })
        
    # 5. Return suggestions for interactive review (instead of auto-updating here)
    # The frontend will review these and call a separate 'save' endpoint.
    
    return {
        "status": "ok",
        "company_id": learned_company_id,
        "display_name": display_name,
        "missing_spans_found": len(missing_spans),
        "suggestions": events,
    }

