import os
import re
from typing import Optional, Dict, Any, List

from .rules.merge_engine import detect_company, merge_rules_for_company
from .rules.types import (
    MergedRuleSet,
    TextRule,
    LayoutRule,
    BarcodeZone,
)

# ------------------------------------------------------------
# Build merged rule set
# ------------------------------------------------------------
def build_final_rules_for_document(
    ocr_text: str,
    company_hint: str | None = None,
) -> MergedRuleSet:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    company_rules_dir = os.path.join(base_dir, "config", "rules", "company_rules")

    company_rules = None

    if company_hint:
        path = os.path.join(company_rules_dir, f"{company_hint}.json")
        if os.path.isfile(path):
            import json
            with open(path, "r", encoding="utf-8") as f:
                company_rules = json.load(f)
    else:
        company_rules = detect_company(ocr_text, company_rules_dir)

    merged: MergedRuleSet = merge_rules_for_company(company_rules, base_dir)
    return merged


# ------------------------------------------------------------
# Regex compiler
# ------------------------------------------------------------
def _compile_regex(pattern: str, flags: str = "i") -> Optional[re.Pattern]:
    if not pattern:
        return None

    re_flags = 0
    if "i" in flags:
        re_flags |= re.IGNORECASE
    if "m" in flags:
        re_flags |= re.MULTILINE
    if "s" in flags:
        re_flags |= re.DOTALL

    try:
        return re.compile(pattern, re_flags)
    except re.error:
        return None


# ------------------------------------------------------------
# Group inference
# ------------------------------------------------------------
def _infer_group_from_id(rule_id: str) -> str:
    rid = (rule_id or "").lower()

    if any(k in rid for k in ["barcode", "qr"]):
        return "barcode"
    if any(k in rid for k in ["client", "name", "address", "phone", "email"]):
        return "client_info"
    if any(k in rid for k in ["report", "account", "sample", "lot", "batch", "lab", "po", "category"]):
        return "document_id"

    return "pii"


# ------------------------------------------------------------
# Label filter
# ------------------------------------------------------------
_LABEL_TOKENS = {
    "REPORT NO",
    "REPORT NO.",
    "REPORT NUMBER",
    "ACCOUNT NUMBER",
    "ACCOUNT NO",
    "ACCOUNT NO.",
    "TO",
    "TO:",
    "PHONE",
    "PHONE:",
    "PO#",
    "PO#:",
    "LAB NUMBER",
    "LAB NUMBER:",
    "SAMPLE ID",
    "SAMPLE ID:",
    "CATEGORY",
    "CATEGORY:",
    "STRAIN",
    "STRAIN:",
    "SAMPLE MATRIX",
    "SAMPLE MATRIX:",
    "DATE SAMPLED",
    "DATE SAMPLED:",
    "DATE RECEIVED",
    "DATE RECEIVED:",
    "DATE REPORTED",
    "DATE REPORTED:",
    "DATE PRINTED",
    "DATE PRINTED:",
    "REPORT NO.",
    "ACCOUNT NUMBER",
    "TO:",
    "PHONE",
    "PO#:",
    "LAB NUMBER:",
    "SAMPLE ID:",
}

# Map label tokens to semantic info
_LABEL_FIELD_MAP = {
    "REPORT NO":      {"group": "document_id", "label": "Report Number"},
    "REPORT NO.":     {"group": "document_id", "label": "Report Number"},
    "REPORT NUMBER":  {"group": "document_id", "label": "Report Number"},

    "ACCOUNT NUMBER": {"group": "document_id", "label": "Account Number"},
    "ACCOUNT NO":     {"group": "document_id", "label": "Account Number"},
    "ACCOUNT NO.":    {"group": "document_id", "label": "Account Number"},

    "TO":             {"group": "client_info", "label": "Client Name"},
    "TO:":            {"group": "client_info", "label": "Client Name"},

    "PHONE":          {"group": "client_info", "label": "Client Phone"},
    "PHONE:":         {"group": "client_info", "label": "Client Phone"},

    "PO#":            {"group": "document_id", "label": "PO Number"},
    "PO#:":           {"group": "document_id", "label": "PO Number"},

    "LAB NUMBER":     {"group": "product_info", "label": "Lab Number"},
    "LAB NUMBER:":    {"group": "product_info", "label": "Lab Number"},

    "SAMPLE ID":      {"group": "product_info", "label": "Sample ID"},
    "SAMPLE ID:":     {"group": "product_info", "label": "Sample ID"},
    "REPORT NO.":     {"group": "document_id", "label": "Report Number"},
    "TO:":            {"group": "client_info", "label": "Client Name"},
    "PHONE":          {"group": "client_info", "label": "Client Phone"},
    "PO#: ":          {"group": "document_id", "label": "PO Number"},
    "LAB NUMBER:":    {"group": "product_info", "label": "Lab Number"},
}

# Expected value extractors for label->value suggestions.
# These regexes include optional label prefixes so they still work when OCR
# returns combined spans like "Phone:905-244-7477".
_EXPECTED_VALUE_REGEX_BY_NORM_LABEL: dict[str, re.Pattern] = {
    "REPORT NO": re.compile(
        r"(?:REPORT\s*NO\.?[:\s]*)?(C[0-9A-Z]{4,6}-[0-9A-Z]{4,6})",
        re.IGNORECASE,
    ),
    "REPORT NO.": re.compile(
        r"(?:REPORT\s*NO\.?[:\s]*)?(C[0-9A-Z]{4,6}-[0-9A-Z]{4,6})",
        re.IGNORECASE,
    ),
    "REPORT NUMBER": re.compile(
        r"(?:REPORT\s*NUMBER[:\s]*)?(C[0-9A-Z]{4,6}-[0-9A-Z]{4,6})",
        re.IGNORECASE,
    ),

    "ACCOUNT NUMBER": re.compile(
        r"(?:ACCOUNT\s*NUMBER[:\s]*)?(\d{5})",
        re.IGNORECASE,
    ),
    "ACCOUNT NO": re.compile(
        r"(?:ACCOUNT\s*NO\.?[:\s]*)?(\d{5})",
        re.IGNORECASE,
    ),
    "ACCOUNT NO.": re.compile(
        r"(?:ACCOUNT\s*NO\.?[:\s]*)?(\d{5})",
        re.IGNORECASE,
    ),

    "TO": re.compile(
        r"(?:TO[:\s]*)?([A-Z][A-Za-z'-]{3,80}(?:\s+[A-Z][A-Za-z'-]{3,80})*)",
        re.IGNORECASE,
    ),
    "TO:": re.compile(
        r"(?:TO[:\s]*)?([A-Z][A-Za-z'-]{3,80}(?:\s+[A-Z][A-Za-z'-]{3,80})*)",
        re.IGNORECASE,
    ),

    "PHONE": re.compile(
        r"(?:PHONE[:\s]*)?([0-9\-\(\)\s]{8,20})",
        re.IGNORECASE,
    ),
    "PHONE:": re.compile(
        r"(?:PHONE[:\s]*)?([0-9\-\(\)\s]{8,20})",
        re.IGNORECASE,
    ),

    "PO#": re.compile(
        r"(?:PO#[:\s]*)?([A-Za-z0-9\-]{3,20}(?:\s+[A-Za-z0-9\-]{3,20})*)",
        re.IGNORECASE,
    ),
    "PO#:": re.compile(
        r"(?:PO#[:\s]*)?([A-Za-z0-9\-]{3,20}(?:\s+[A-Za-z0-9\-]{3,20})*)",
        re.IGNORECASE,
    ),

    "LAB NUMBER": re.compile(
        r"(?:LAB\s*NUMBER[:\s]*)?(\d{4,10})",
        re.IGNORECASE,
    ),
    "LAB NUMBER:": re.compile(
        r"(?:LAB\s*NUMBER[:\s]*)?(\d{4,10})",
        re.IGNORECASE,
    ),

    "SAMPLE ID": re.compile(
        r"(?:SAMPLE\s*ID[:\s]*)?([A-Za-z0-9\-]{3,40})",
        re.IGNORECASE,
    ),
    "SAMPLE ID:": re.compile(
        r"(?:SAMPLE\s*ID[:\s]*)?([A-Za-z0-9\-]{3,40})",
        re.IGNORECASE,
    ),
}


def _normalize_ws(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _adjust_rect_x_for_substring(rect: dict[str, float], full_text: str, start: int, end: int) -> dict[str, float]:
    """
    Approximate x0/x1 adjustment for substring [start:end] inside full_text.
    We assume a roughly uniform horizontal spread within the word span bbox.
    """
    full_text = full_text or ""
    if not full_text:
        return rect
    if start < 0 or end <= start or end > len(full_text):
        return rect

    width = float(rect.get("x1", 1.0)) - float(rect.get("x0", 0.0))
    if width == 0:
        return rect

    fx0 = start / len(full_text)
    fx1 = end / len(full_text)
    new_rect = dict(rect)
    new_rect["x0"] = float(rect.get("x0", 0.0)) + fx0 * width
    new_rect["x1"] = float(rect.get("x0", 0.0)) + fx1 * width
    return new_rect


def _extract_value_from_match(match: re.Match) -> str:
    if not match:
        return ""
    # prefer group(1) (value-only) when present
    if match.lastindex and match.lastindex >= 1:
        g1 = match.group(1)
        return (g1 or "").strip() or match.group(0).strip()
    return match.group(0).strip()


def _label_value_suggestions(spans_by_page):
    """
    For label patterns (REPORT NO, ACCOUNT NUMBER, TO, etc.),
    handle both single-span and multi-span labels on the same line,
    then pick the nearest value span to the right.
    """
    suggestions = []

    for page_num, spans in spans_by_page.items():
        # sort spans top-to-bottom, left-to-right
        spans_sorted = sorted(
            spans,
            key=lambda s: (float(s.get("y0", 0.0)), float(s.get("x0", 0.0)))
        )

        # group spans into "lines" by vertical overlap
        lines: List[List[Dict[str, Any]]] = []
        for span in spans_sorted:
            y0 = float(span.get("y0", 0.0))
            y1 = float(span.get("y1", 0.0))

            placed = False
            for line in lines:
                ly0 = float(line[0].get("y0", 0.0))
                ly1 = float(line[0].get("y1", 0.0))
                # vertical overlap → same line
                if not (y1 < ly0 or y0 > ly1):
                    line.append(span)
                    placed = True
                    break
            if not placed:
                lines.append([span])

        # process each line
        for line in lines:
            # sort left-to-right within line
            line.sort(key=lambda s: float(s.get("x0", 0.0)))

            n = len(line)
            i = 0
            while i < n:
                # try to build a label from consecutive spans
                label_spans = [line[i]]
                j = i + 1

                while j < n:
                    candidate_text = " ".join(
                        (ls.get("text") or "").strip()
                        for ls in label_spans + [line[j]]
                        if (ls.get("text") or "").strip()
                    )
                    norm = _normalize_ws(candidate_text).upper()
                    if norm.endswith(":"):
                        norm = norm[:-1].strip()

                    # If OCR merges label + first value token into one span,
                    # normalize by prefix (e.g. "PHONE:905-244-..." -> "PHONE:").
                    raw_norm = norm
                    for key in _LABEL_FIELD_MAP.keys():
                        if norm == key:
                            norm = key
                            break
                        if norm.startswith(key):
                            # Avoid accidental matches like "TOWNLINE" -> "TO".
                            if key.endswith(":") or key.endswith(".") or "#" in key:
                                norm = key
                                break
                            # Allow keys with spaces to match merged tokens like
                            # "LAB NUMBER:3029330" (key "LAB NUMBER" + ':...').
                            if " " in key and len(norm) > len(key):
                                nxt = norm[len(key)]
                                if nxt in {":", "."} or nxt.isspace():
                                    norm = key
                                    break

                    if norm in _LABEL_FIELD_MAP:
                        # If we only matched by prefix (raw_norm != norm), don't
                        # extend label_spans with line[j] (it likely belongs to the
                        # value). For exact label matches, we extend as before.
                        if raw_norm == norm:
                            label_spans.append(line[j])
                        break

                    # if adding this span makes it worse, stop extending
                    # (we only allow short labels)
                    if len(candidate_text) > 40:
                        break

                    # Skip numeric-ish tokens that are likely values between
                    # label words (e.g. "ACCOUNT 07282 NUMBER").
                    token_norm = _normalize_ws(line[j].get("text", "") or "").upper()
                    is_numeric_like = bool(re.search(r"\d", token_norm)) and not bool(
                        re.search(r"[A-Z]", token_norm)
                    )
                    if is_numeric_like:
                        j += 1
                        continue

                    label_spans.append(line[j])
                    j += 1

                # check if we formed a known label
                label_text = " ".join(
                    (ls.get("text") or "").strip()
                    for ls in label_spans
                    if (ls.get("text") or "").strip()
                )
                norm_label = label_text.upper().strip()
                if norm_label.endswith(":"):
                    norm_label = norm_label[:-1].strip()

                # If OCR merges label + first value token into one span,
                # normalize by prefix (e.g. "Phone:905-..." -> "PHONE:").
                for key in _LABEL_FIELD_MAP.keys():
                    if norm_label == key:
                        norm_label = key
                        break
                    if norm_label.startswith(key):
                        if key.endswith(":") or key.endswith(".") or "#" in key:
                            norm_label = key
                            break
                        if " " in key and len(norm_label) > len(key):
                            nxt = norm_label[len(key)]
                            if nxt in {":", "."} or nxt.isspace():
                                norm_label = key
                                break

                if norm_label in _LABEL_FIELD_MAP:
                    field_info = _LABEL_FIELD_MAP[norm_label]

                    expected_re = _EXPECTED_VALUE_REGEX_BY_NORM_LABEL.get(norm_label)
                    if not expected_re:
                        i += 1
                        continue

                    def _span_rect(s: dict[str, Any]) -> dict[str, float]:
                        return {
                            "x0": float(s.get("x0", 0.0)),
                            "y0": float(s.get("y0", 0.0)),
                            "x1": float(s.get("x1", 1.0)),
                            "y1": float(s.get("y1", 1.0)),
                        }

                    label_start_idx = line.index(label_spans[0])
                    label_end_idx = line.index(label_spans[-1])

                    # 1) If OCR merged "LABEL+VALUE" into one span (e.g. "Phone:905-..."),
                    # extract the value directly from the label span.
                    seed_value = ""
                    seed_span: dict[str, Any] | None = None
                    seed_match: re.Match | None = None
                    for ls in label_spans:
                        ls_text = ls.get("text", "") or ""
                        m = expected_re.search(ls_text)
                        if m:
                            seed_value = _extract_value_from_match(m)
                            if seed_value:
                                seed_span = ls
                                seed_match = m
                                break

                    # 1a) Handle cases where OCR orders tokens like:
                    #   "ACCOUNT 07282 NUMBER"
                    # value is between the label words, so scan the whole label span block.
                    block_value = ""
                    block_span: dict[str, Any] | None = None
                    block_match: re.Match | None = None
                    block_allow_expand = norm_label in {"TO", "TO:", "PO#", "PO#:"}
                    for sp in line[label_start_idx : label_end_idx + 1]:
                        sp_text = sp.get("text", "") or ""
                        m = expected_re.search(sp_text)
                        if not m:
                            continue
                        v = _extract_value_from_match(m)
                        if not v or len(v) < 2:
                            continue
                        if block_allow_expand and norm_label in {"TO", "TO:"}:
                            if len([w for w in v.split() if w.strip()]) < 2:
                                continue
                        if block_allow_expand and norm_label in {"PO#", "PO#:"}:
                            if len([w for w in v.split() if w.strip()]) < 2:
                                continue

                        block_value = v
                        block_span = sp
                        block_match = m
                        break

                    if block_value and block_span:
                        rect = _span_rect(block_span)
                        if block_match:
                            try:
                                start, end = (
                                    block_match.span(1)
                                    if block_match.lastindex and block_match.lastindex >= 1
                                    else block_match.span(0)
                                )
                                rect = _adjust_rect_x_for_substring(rect, block_span.get("text", "") or "", start, end)
                            except Exception:
                                pass

                        suggestions.append(
                            {
                                "type": "text",
                                "rule_id": f"label_value_{norm_label.replace(' ', '_')}",
                                "label": field_info["label"],
                                "group": field_info["group"],
                                "page": int(page_num),
                                "rects": [rect],
                                "text": block_value,
                                "reason": f"Value for label: {norm_label}",
                            }
                        )
                        i = line.index(label_spans[-1]) + 1
                        continue

                    def _union_rect(spans_used: List[Dict[str, Any]]) -> dict[str, float]:
                        rect = {
                            "x0": float("inf"),
                            "y0": float("inf"),
                            "x1": float("-inf"),
                            "y1": float("-inf"),
                        }
                        for sp in spans_used:
                            sr = _span_rect(sp)
                            rect["x0"] = min(rect["x0"], sr["x0"])
                            rect["y0"] = min(rect["y0"], sr["y0"])
                            rect["x1"] = max(rect["x1"], sr["x1"])
                            rect["y1"] = max(rect["y1"], sr["y1"])
                        # If we somehow failed to build a rect:
                        if rect["x0"] == float("inf"):
                            return _span_rect(spans_used[0])
                        return rect

                    # Only expand multi-token values for TO / PO#.
                    allow_expand = norm_label in {"TO", "TO:", "PO#", "PO#:"}

                    # 2) For simple numeric-ish values, the seed extraction is usually enough.
                    if seed_value and seed_span and not allow_expand:
                        value_text = seed_value
                        if value_text:
                            rect = _span_rect(seed_span)
                            # Narrow rect to the extracted value substring when possible.
                            try:
                                if seed_match:
                                    start, end = seed_match.span(1) if seed_match.lastindex and seed_match.lastindex >= 1 else seed_match.span(0)
                                    rect = _adjust_rect_x_for_substring(rect, seed_span.get("text", "") or "", start, end)
                            except Exception:
                                pass
                            suggestions.append(
                                {
                                    "type": "text",
                                    "rule_id": f"label_value_{norm_label.replace(' ', '_')}",
                                    "label": field_info["label"],
                                    "group": field_info["group"],
                                    "page": int(page_num),
                                    "rects": [rect],
                                    "text": value_text,
                                    "reason": f"Value for label: {norm_label}",
                                }
                            )
                        i = line.index(label_spans[-1]) + 1
                        continue

                    # 3) Otherwise, scan nearby tokens and extract by expected format.
                    max_concat = 3 if allow_expand else 4

                    best_value = ""
                    best_spans_for_rect: List[Dict[str, Any]] = []
                    best_single_span_match: re.Match | None = None

                    def _try_sequence(spans_used: List[Dict[str, Any]], seed_prefix: str = "") -> bool:
                        nonlocal best_value, best_spans_for_rect, best_single_span_match
                        if not spans_used and not seed_prefix:
                            return False

                        parts = []
                        if seed_prefix:
                            parts.append(seed_prefix)
                        parts.extend([(sp.get("text", "") or "") for sp in spans_used])
                        candidate_text = " ".join([p for p in parts if p]).strip()
                        if not candidate_text:
                            return False

                        m = expected_re.search(candidate_text)
                        if not m:
                            return False

                        v = _extract_value_from_match(m)
                        if not v or len(v) < 2:
                            return False

                        # In expand mode, only accept multi-token values
                        # (helps avoid cases where OCR returns label fragments).
                        if allow_expand and norm_label in {"TO", "TO:"}:
                            if len([w for w in v.split() if w.strip()]) < 2:
                                return False
                        if allow_expand and norm_label in {"PO#", "PO#:"}:
                            if len([w for w in v.split() if w.strip()]) < 2:
                                return False

                        best_value = v
                        # When we expand multi-token values (TO / PO#), include the seed span
                        # so the rect covers the full value.
                        best_spans_for_rect = list(spans_used)
                        if allow_expand and seed_span and seed_prefix:
                            best_spans_for_rect = [seed_span] + best_spans_for_rect
                        best_single_span_match = None

                        # If the match came from one span (no expansion), narrow rect.
                        if len(spans_used) == 1 and not seed_prefix:
                            # match was searched within that single span text
                            best_single_span_match = m
                        return True

                    # Try right of label first.
                    # - If we have a seed value inside label span, include it in the candidate text
                    #   so patterns like "SEAN" + "MITCHELL" can become the full name.
                    seed_prefix = seed_value.strip() if (seed_value and allow_expand) else ""
                    if allow_expand and seed_prefix:
                        for length in range(1, max_concat + 1):
                            start = label_end_idx + 1
                            end = min(n, start + length)
                            if start >= end:
                                break
                            spans_used = line[start:end]
                            if _try_sequence(spans_used, seed_prefix=seed_prefix):
                                break
                    else:
                        # numeric-ish, or seed not found: use right side only
                        for length in range(1, max_concat + 1):
                            start = label_end_idx + 1
                            end = min(n, start + length)
                            if start >= end:
                                break
                            spans_used = line[start:end]
                            if _try_sequence(spans_used):
                                break

                    # If still nothing, try left side.
                    if not best_value:
                        for length in range(1, max_concat + 1):
                            end = label_start_idx
                            start = max(0, end - length)
                            if start >= end:
                                break
                            spans_used = line[start:end]
                            # For left-side expansion, prepend the seed_prefix if we have one.
                            if allow_expand and seed_prefix:
                                if _try_sequence(spans_used, seed_prefix=seed_prefix):
                                    break
                            else:
                                if _try_sequence(spans_used):
                                    break

                    if best_value and best_spans_for_rect:
                        # If we expanded a value using a seed extracted from the label span,
                        # narrow the seed span rect to the value substring.
                        if allow_expand and seed_prefix and seed_span and any(
                            sp is seed_span for sp in best_spans_for_rect
                        ):
                            others = [sp for sp in best_spans_for_rect if sp is not seed_span]
                            rect = _span_rect(seed_span)
                            try:
                                if seed_match:
                                    start, end = (
                                        seed_match.span(1)
                                        if seed_match.lastindex and seed_match.lastindex >= 1
                                        else seed_match.span(0)
                                    )
                                    rect = _adjust_rect_x_for_substring(rect, seed_span.get("text", "") or "", start, end)
                            except Exception:
                                pass

                            if others:
                                other_rect = _union_rect(others)
                                rect["x0"] = min(rect["x0"], other_rect["x0"])
                                rect["y0"] = min(rect["y0"], other_rect["y0"])
                                rect["x1"] = max(rect["x1"], other_rect["x1"])
                                rect["y1"] = max(rect["y1"], other_rect["y1"])
                        else:
                            rect = _union_rect(best_spans_for_rect)

                        # If this value came from exactly one span, narrow rect to the match substring.
                        if best_single_span_match and len(best_spans_for_rect) == 1:
                            try:
                                one = best_spans_for_rect[0]
                                one_text = one.get("text", "") or ""
                                start, end = (
                                    best_single_span_match.span(1)
                                    if best_single_span_match.lastindex and best_single_span_match.lastindex >= 1
                                    else best_single_span_match.span(0)
                                )
                                rect = _adjust_rect_x_for_substring(rect, one_text, start, end)
                            except Exception:
                                pass

                        suggestions.append(
                            {
                                "type": "text",
                                "rule_id": f"label_value_{norm_label.replace(' ', '_')}",
                                "label": field_info["label"],
                                "group": field_info["group"],
                                "page": int(page_num),
                                "rects": [rect],
                                "text": best_value,
                                "reason": f"Value for label: {norm_label}",
                            }
                        )

                    # move past this label sequence
                    i = line.index(label_spans[-1]) + 1
                else:
                    i += 1

    # Dedupe: label parsing can sometimes emit the same value multiple times.
    deduped = []
    seen = set()
    for s in suggestions:
        if s.get("type") != "text" or not s.get("rects"):
            key = (s.get("page"), s.get("rule_id"), s.get("text"))
        else:
            r0 = s["rects"][0]
            key = (
                s.get("page"),
                s.get("rule_id"),
                s.get("text"),
                r0.get("x0"),
                r0.get("y0"),
            )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(s)

    return deduped


def _is_label_only(text: str) -> bool:
    if not text:
        return False

    norm = _normalize_ws(text).upper()
    if norm.endswith(":"):
        norm = norm[:-1].strip()

    return norm in _LABEL_TOKENS


# ------------------------------------------------------------
# Measurement filter
# ------------------------------------------------------------
_MEASUREMENT_TOKENS = {"%", "MG/G", "LOQ", "LOQ:", "ORG-M-", "METHOD", "RESULT"}


def _is_measurement_span(text: str) -> bool:
    if not text:
        return False

    t = text.upper()

    for tok in _MEASUREMENT_TOKENS:
        if tok in t:
            return True

    stripped = t.strip()

    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", stripped):
        if len(stripped) < 5:
            return True
        return False

    return False


# ------------------------------------------------------------
# Company constant filter
# ------------------------------------------------------------
def _is_company_constant(text: str, constants: Dict[str, List[str]]) -> bool:
    if not text:
        return False

    t = text.strip().lower()
    # Avoid filtering out single letters like "A" that frequently appear
    # inside larger constants (addresses/company names).
    if len(t) < 3:
        return False

    # Check addresses
    for addr in constants.get("addresses", []):
        if t in addr.lower():
            return True

    # Check phones
    for ph in constants.get("phones", []):
        if t in ph.lower():
            return True

    # Check emails
    for em in constants.get("emails", []):
        if t in em.lower():
            return True

    # Check ignore patterns (partial matches)
    for pattern in constants.get("ignore_patterns", []):
        if pattern.lower() in t:
            return True

    return False


def _get_company_constants(final_rules) -> Dict[str, List[str]]:
    """
    Safely extract company_constants from final_rules.
    If not present (older MergedRuleSet), return empty defaults.
    """
    cc = getattr(final_rules, "company_constants", None)
    if not cc:
        return {
            "addresses": [],
            "phones": [],
            "emails": [],
            "ignore_patterns": [],
        }
    if isinstance(cc, dict):
        return {
            "addresses": cc.get("addresses", []),
            "phones": cc.get("phones", []),
            "emails": cc.get("emails", []),
            "ignore_patterns": cc.get("ignore_patterns", []),
        }
    return {
        "addresses": getattr(cc, "addresses", []),
        "phones": getattr(cc, "phones", []),
        "emails": getattr(cc, "emails", []),
        "ignore_patterns": getattr(cc, "ignore_patterns", [], []),
    }


# ------------------------------------------------------------
# Main suggestion generator
# ------------------------------------------------------------
def generate_suggestions(pdf_pages, ocr_result, final_rules: MergedRuleSet, sensitivity: int = 50):
    suggestions: List[Dict[str, Any]] = []

    pages_text: List[str] = ocr_result.get("pages_text") or []
    spans_by_page: Dict[int, List[Dict[str, Any]]] = ocr_result.get("spans_by_page") or {}

    company_constants = _get_company_constants(final_rules)
    # NEW LOGIC: Always filter company constants (ignore list) regardless of company detection
    # The ignore list contains addresses, phones, emails that should never be redacted
    filter_company_constants = True  # Always filter company constants

    # ------------------------------------------------------------
    # Sensitivity controls how many learned/regex rules can fire.
    # Higher sensitivity => lower minimum confidence threshold.
    # ------------------------------------------------------------
    try:
        s = int(sensitivity)
    except Exception:
        s = 50
    s = max(0, min(100, s))
    min_confidence = 0.9 - 0.4 * (s / 100.0)  # 0 -> 0.9, 100 -> 0.5

    # ------------------------------------------------------------
    # 0) LABEL → VALUE SUGGESTIONS (REPORT NO, ACCOUNT NUMBER, TO, etc.)
    # ------------------------------------------------------------
    label_value_sugs = _label_value_suggestions(spans_by_page)
    suggestions.extend(label_value_sugs)

    # ------------------------------------------------------------
    # 1) TEXT RULES (Exact Sensitive Terms + Regex)
    # ------------------------------------------------------------
    # 1.a) Sensitive Terms (Exact Match)
    for term in (getattr(final_rules, "sensitive_terms", []) or []):
        if not term:
            continue
        rule_id = f"sensitive_{term.lower().replace(' ', '_')}"
        for page_num, spans in spans_by_page.items():
            for span in spans:
                text = span.get("text", "") or ""
                if term.lower() in text.lower():
                    suggestions.append({
                        "type": "text",
                        "rule_id": rule_id,
                        "label": term,
                        "group": "pii",
                        "page": int(page_num),
                        "rects": [{
                            "x0": float(span.get("x0", 0.0)),
                            "y0": float(span.get("y0", 0.0)),
                            "x1": float(span.get("x1", 1.0)),
                            "y1": float(span.get("y1", 1.0)),
                        }],
                        "text": text.strip(),
                        "reason": f"Matched sensitive term: {term}",
                    })

    # 1.b) Regex Rules
    for rule in final_rules.text_rules:
        pattern = rule.pattern or ""
        if not pattern:
            continue

        regex = _compile_regex(pattern, "im")
        if not regex:
            continue

        if rule.action != "suggest":
            continue

        # Sensitivity: learned regex patterns carry confidence; skip low-confidence rules.
        try:
            rule_conf = float(getattr(rule, "confidence", 0.95) or 0.95)
        except Exception:
            rule_conf = 0.95
        if rule_conf < min_confidence:
            continue

        rule_id = rule.id or "rule"
        label = rule.label or rule_id
        group = _infer_group_from_id(rule_id)

        for page_num, spans in spans_by_page.items():
            for span in spans:
                text = span.get("text", "") or ""
                if not text.strip():
                    continue

                m = regex.search(text)
                if m:
                    value_text = _extract_value_from_match(m)
                    if not value_text:
                        value_text = text.strip()

                    if _is_label_only(value_text):
                        continue
                    if _is_measurement_span(value_text):
                        continue
                    if filter_company_constants and _is_company_constant(value_text, company_constants):
                        continue

                    rect = {
                        "x0": float(span.get("x0", 0.0)),
                        "y0": float(span.get("y0", 0.0)),
                        "x1": float(span.get("x1", 1.0)),
                        "y1": float(span.get("y1", 1.0)),
                    }

                    # If regex has capture groups, narrow rect to the captured value.
                    try:
                        if m.lastindex and m.lastindex >= 1:
                            start, end = m.span(1)
                            rect = _adjust_rect_x_for_substring(rect, text, start, end)
                    except Exception:
                        pass

                    suggestions.append(
                        {
                            "type": "text",
                            "rule_id": rule_id,
                            "label": label,
                            "group": group,
                            "page": int(page_num),
                            "rects": [rect],
                            "text": value_text,
                            "reason": f"Matched pattern: {label}",
                        }
                    )

    # ------------------------------------------------------------
    # 2) LAYOUT RULES
    # ------------------------------------------------------------
    total_pages = max(len(pages_text), max(spans_by_page.keys(), default=0))
    for lr in final_rules.layout_rules:
        try:
            if lr.action != "suggest":
                continue
        except Exception:
            continue

        # page scope
        if getattr(lr, "page_scope", "all") == "first_page":
            pages_to_emit = [1]
        else:
            pages_to_emit = list(range(1, max(1, total_pages) + 1))

        rect = getattr(lr, "rect", None) or {}
        if not isinstance(rect, dict) or not rect:
            continue

        # Anchor logic
        anchor_text = getattr(lr, "anchor_text", None)
        relative = getattr(lr, "relative", False)
        
        anchor_shift_x = 0.0
        anchor_shift_y = 0.0
        
        if relative and anchor_text:
            # Look for anchor in OCR result
            found_anchor = False
            for page_num, spans in spans_by_page.items():
                for span in spans:
                    if anchor_text.lower() in (span.get("text") or "").lower():
                        # Minimal shift logic: assume rect in JSON is already correct for the original file.
                        # We don't have the original anchor pos here easily without storing it.
                        # Improved: Just emit the rect for now, Phase 5 refinement can add offset calculation.
                        found_anchor = True
                        break
                if found_anchor: break
            if not found_anchor:
                continue # Anchor missing, skip relative zone

        # Ensure frontend can detect "layout/zone" suggestions even though
        # it relies mostly on `label` text.
        rule_id = f"{lr.id}_zone" if getattr(lr, "id", None) else "layout_zone"
        label = f"{lr.label}"

        for p in pages_to_emit:
            suggestions.append(
                {
                    "type": "layout",
                    "rule_id": rule_id,
                    "label": label,
                    "group": "layout_zone",
                    "page": int(p),
                    "rects": [rect],
                    "text": "",
                    "reason": f"Matched layout zone: {label}",
                }
            )

    # ------------------------------------------------------------
    # 3) BARCODE / QR ZONES  (still handled by dedicated endpoint)
    # ------------------------------------------------------------
    # def _zones_to_suggestions(...):
    #     ...

    # ------------------------------------------------------------
    # 4) CLEANING
    # ------------------------------------------------------------
    cleaned = []
    seen = set()

    for s in suggestions:
        text = (s.get("text") or "").strip()

        if s.get("type") == "text":
            if not text:
                continue
            if _is_label_only(text):
                continue
            if _is_measurement_span(text):
                continue
            if filter_company_constants and _is_company_constant(text, company_constants):
                continue

        key = (s["page"], s["rects"][0]["x0"], s["rects"][0]["y0"], text)
        if key in seen:
            continue
        seen.add(key)

        cleaned.append(s)

    # ------------------------------------------------------------
    # 5) FINAL FILTER
    # ------------------------------------------------------------
    allowed_groups = {
        "pii",
        "client_info",
        "document_id",
        "product_info",
        "barcode",
        "qr",
        "layout_zone",
    }

    return [s for s in cleaned if s.get("group") in allowed_groups]
