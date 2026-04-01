import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from backend.ai.learned_rules_loader import load_learned_rules


def _project_root() -> str:
    this_dir = os.path.dirname(__file__)  # backend/ai
    return os.path.abspath(os.path.join(this_dir, "..", ".."))


def _learned_ai_path(company_id: str) -> str:
    root = _project_root()
    return os.path.join(root, "config", "rules", "learned_ai", f"{company_id}.json")


def _safe_label_key(label: str) -> str:
    s = (label or "").strip()
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")
    return s.lower() or "unknown"


def _escape_for_regex(literal: str) -> str:
    # Escape literal text so it's safe to embed into a Python `re` pattern.
    return re.escape(literal)


def _most_common_lengths(values: List[str]) -> Tuple[int, int]:
    lengths = [len(v) for v in values if isinstance(v, str)]
    if not lengths:
        return 0, 0
    return min(lengths), max(lengths)


def _looks_like_email(s: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", s.strip()))


def _looks_like_phone(s: str) -> bool:
    # Accept digits, spaces, hyphens, parentheses, dots. Require 8+ digits total.
    digits = re.sub(r"\D+", "", s)
    if len(digits) < 8:
        return False
    return bool(re.fullmatch(r"[0-9\s\-\(\)\.]+", s.strip()))


def _looks_like_report_number(s: str) -> bool:
    s = s.strip()
    return bool(re.fullmatch(r"C[0-9A-Z]{4,6}-[0-9A-Z]{4,6}", s, flags=re.IGNORECASE))


def _looks_like_account_number(s: str) -> bool:
    return bool(re.fullmatch(r"\d{5}", s.strip()))


def _looks_like_digits_only(s: str) -> bool:
    return bool(re.fullmatch(r"\d+", s.strip()))


def synthesize_pattern_for_label(label: str, group: str, values: List[str]) -> str:
    """
    Deterministic "value -> regex" synthesizer.
    This is NOT ML; it uses heuristics based on label/group and observed value formats.
    """
    label_u = (label or "").upper()
    group_u = (group or "").upper()

    cleaned = [str(v).strip() for v in (values or []) if isinstance(v, str) and str(v).strip()]
    if not cleaned:
        return _escape_for_regex(label or "UNKNOWN")

    # Label-first heuristics
    if "REPORT" in label_u or "REPORT" in group_u:
        return r"C[0-9A-Z]{4,6}-[0-9A-Z]{4,6}"
    if "ACCOUNT" in label_u or "ACCOUNT" in group_u:
        # Your existing A&L rules use 5 digits for account.
        return r"\d{5}"
    if "PHONE" in label_u or "PHONE" in group_u:
        return r"[0-9\-\(\)\s]{8,20}"
    if "EMAIL" in label_u or "EMAIL" in group_u:
        return r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"
    if "ADDRESS" in label_u or "ADDRESS" in group_u:
        return r"\d{1,6}\s+[A-Z][A-Za-z0-9\s,'\-\.\:]{6,160}"
    if "PO" in label_u or "PO#" in label_u or "PO" in group_u:
        return r"[A-Za-z0-9\- ]{3,40}"
    if "LAB" in label_u or "LAB" in group_u:
        return r"\d{4,10}"
    if "SAMPLE" in label_u or "SAMPLE" in group_u:
        return r"[A-Za-z0-9\-]{3,40}"
    if "CLIENT" in label_u and ("NAME" in label_u or "TO" in label_u):
        return r"[A-Z][A-Za-z'\- ]{2,80}"

    # Value-shape heuristics
    if all(_looks_like_email(v) for v in cleaned):
        return r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"
    if all(_looks_like_phone(v) for v in cleaned):
        return r"[0-9\-\(\)\s]{8,20}"
    if all(_looks_like_report_number(v) for v in cleaned):
        return r"C[0-9A-Z]{4,6}-[0-9A-Z]{4,6}"
    if all(_looks_like_account_number(v) for v in cleaned):
        return r"\d{5}"

    # digits-only
    if all(_looks_like_digits_only(v) for v in cleaned):
        mn, mx = _most_common_lengths(cleaned)
        if mn > 0 and mn == mx:
            return rf"\d{{{mn}}}"
        # range
        if mn > 0 and mx > 0:
            return rf"\d{{{mn},{mx}}}"
        return r"\d+"

    # Generic alphanumeric fallback: allow common separators
    mn_len = min(len(v) for v in cleaned)
    mx_len = max(len(v) for v in cleaned)
    mn = max(3, mn_len)
    mx = min(80, max(mn + 1, mx_len))
    return rf"[A-Za-z0-9\- ]{{{mn},{mx}}}"


def update_learned_regex_entries(
    learned: Dict[str, Any],
    company_id: str,
    display_name: str,
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update/merge learned regex entries for each distinct (label, group) pair.
    """
    learned_regex: List[Dict[str, Any]] = learned.get("regex", []) or []

    # Index by id
    id_to_entry: Dict[str, Dict[str, Any]] = {}
    for entry in learned_regex:
        if not isinstance(entry, dict):
            continue
        eid = entry.get("id")
        if eid:
            id_to_entry[str(eid)] = entry

    # Group events by label+group
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for ev in events:
        label = str(ev.get("label") or "").strip()
        group = str(ev.get("group") or "").strip()
        if not label:
            continue
        key = f"{_safe_label_key(label)}::{group.lower() if group else ''}"
        buckets.setdefault(key, []).append(ev)

    timestamp = datetime.utcnow().isoformat() + "Z"
    for key, bucket in buckets.items():
        label = str(bucket[0].get("label") or "").strip()
        group = str(bucket[0].get("group") or "").strip()

        # Collect values and examples
        values = [str(b.get("sample_text") or "").strip() for b in bucket if str(b.get("sample_text") or "").strip()]
        values_unique = list(dict.fromkeys(values))  # stable unique

        group_slug = _safe_label_key(group) if group else ""
        # Include group in the entry id so label+group stays distinct.
        entry_id = f"learned_{_safe_label_key(label)}"
        if group_slug:
            entry_id = f"{entry_id}_{group_slug}"
        # Backwards compatibility: older learned files were keyed only by label.
        legacy_entry_id = f"learned_{_safe_label_key(label)}"

        existing = id_to_entry.get(entry_id) or id_to_entry.get(legacy_entry_id)
        existing_conf = float(existing.get("confidence", 0.6)) if existing else 0.6

        new_pattern = synthesize_pattern_for_label(label=label, group=group, values=values_unique)

        # Update confidence based on number of distinct confirmations.
        distinct_n = len(values_unique)
        conf_boost = min(0.4, 0.04 * distinct_n)
        new_confidence = min(0.99, max(existing_conf, 0.55) + conf_boost)

        # Store coordinates/examples (bounded)
        examples = existing.get("examples", []) if existing else []
        if not isinstance(examples, list):
            examples = []

        # Append up to 20 new examples
        for ev in bucket[:20]:
            sample_text = str(ev.get("sample_text") or "").strip()
            if not sample_text:
                continue

            rects = ev.get("rects") or []
            if not isinstance(rects, list):
                rects = [rects]

            page = int(ev.get("page") or 1)
            examples.append(
                {
                    "sample_text": sample_text,
                    "rects": rects,
                    "page": page,
                }
            )

        # Bound examples
        examples = examples[-50:]

        updated_entry = {
            "id": entry_id,
            "label": label,
            "pattern": new_pattern,
            "action": "suggest",
            "confidence": float(new_confidence),
            "group": group,
            "examples": examples,
            "updated_at": timestamp,
        }

        id_to_entry[entry_id] = updated_entry

    # Rebuild learned.regex list deterministically
    merged_regex = list(id_to_entry.values())
    merged_regex.sort(key=lambda x: str(x.get("label", "")))

    learned["company_id"] = company_id
    learned["display_name"] = display_name
    learned["regex"] = merged_regex
    learned.setdefault("layout", learned.get("layout", []) or [])
    learned["version"] = learned.get("version", 1) or 1

    return learned


def update_learned_rules(
    company_id: str,
    display_name: str,
    events: List[Dict[str, Any]],
    base_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update learned rules for a company using selected redaction examples.
    Offline only: writes to config/rules/learned_ai/<company_id>.json
    """
    # Load existing learned rules
    learned = load_learned_rules(company_id, base_dir=base_dir)

    # Filter to only value-like events (label + sample_text)
    normalized_events = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        label = str(ev.get("label") or "").strip()
        sample_text = str(ev.get("sample_text") or "").strip()
        if not label or not sample_text:
            continue
        normalized_events.append(ev)

    learned = update_learned_regex_entries(
        learned=learned,
        company_id=company_id,
        display_name=display_name,
        events=normalized_events,
    )

    # Ensure output dir exists
    out_path = _learned_ai_path(company_id)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(learned, f, indent=2)

    return learned

