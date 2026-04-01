import os
import json
import re
from typing import Any, Dict, List


def _safe_id(value: str, fallback: str = "item") -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "_", (value or "").strip()).strip("_")
    return value or fallback


def _unique_nonempty(values: List[str]) -> List[str]:
    out = []
    seen = set()
    for value in values or []:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def _merge_entries_by_id(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    index_by_id: Dict[str, int] = {}

    for entry in list(existing or []) + list(incoming or []):
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if entry_id and entry_id in index_by_id:
            merged[index_by_id[entry_id]] = {**merged[index_by_id[entry_id]], **entry}
            continue
        if entry_id:
            index_by_id[entry_id] = len(merged)
        merged.append(entry)

    return merged


def _event_to_layout(event: Dict[str, Any], index: int) -> Dict[str, Any] | None:
    rects = event.get("rects") or []
    if not rects:
        return None
    rect = rects[0]
    if not isinstance(rect, dict):
        return None

    return {
        "id": f"learned_zone_{index}_{_safe_id(event.get('label') or 'area')}",
        "label": event.get("label") or "Learned Area",
        "rect": {
            "x0": float(rect.get("x0", 0.0) or 0.0),
            "y0": float(rect.get("y0", 0.0) or 0.0),
            "x1": float(rect.get("x1", 1.0) or 1.0),
            "y1": float(rect.get("y1", 1.0) or 1.0),
        },
        "relative": True,
        "page_scope": "all",
        "action": "suggest",
    }


def build_studio_rule_payload(company_id: str, display_name: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    identifiers = _unique_nonempty([company_id, display_name])
    patterns = []
    sensitive_terms = []
    learned_coordinates = []
    regex_entries = []
    layout_entries = []

    for index, event in enumerate(events or []):
        label = str(event.get("label") or "REDACTED").strip() or "REDACTED"
        sample_text = str(event.get("sample_text") or event.get("text") or "").strip()

        if sample_text:
            escaped = re.escape(sample_text)
            patterns.append(escaped)
            sensitive_terms.append(sample_text)
            regex_entries.append(
                {
                    "id": f"learned_regex_{index}_{_safe_id(label)}",
                    "pattern": escaped,
                    "action": "suggest",
                }
            )

        rects = event.get("rects") or []
        if rects and isinstance(rects[0], dict):
            rect = rects[0]
            learned_coordinates.append(
                {
                    "pageIndex": max(0, int(event.get("page", 1) or 1) - 1),
                    "x": float(rect.get("x0", 0.0) or 0.0) * 100,
                    "y": float(rect.get("y0", 0.0) or 0.0) * 100,
                    "width": max(0.0, float(rect.get("x1", 1.0) or 1.0) - float(rect.get("x0", 0.0) or 0.0)) * 100,
                    "height": max(0.0, float(rect.get("y1", 1.0) or 1.0) - float(rect.get("y0", 0.0) or 0.0)) * 100,
                    "label": label,
                }
            )

            layout_rule = _event_to_layout(event, index)
            if layout_rule:
                layout_entries.append(layout_rule)

    studio_rule = {
        "id": _safe_id(company_id, "company_rule"),
        "name": display_name,
        "patterns": _unique_nonempty(patterns),
        "type": "regex",
        "isActive": True,
        "sensitiveTerms": _unique_nonempty(sensitive_terms),
        "learnedCoordinates": learned_coordinates,
        "identifiers": identifiers,
        "description": "Imported from Redection-studio training structure",
    }

    return {
        "company_id": company_id,
        "display_name": display_name,
        "detection": {
            "match_strings": identifiers,
            "priority": 5,
        },
        "anchors": identifiers,
        "regex": regex_entries,
        "layout": layout_entries,
        "barcode_qr": [],
        "sensitive_terms": studio_rule["sensitiveTerms"],
        "identifiers": studio_rule["identifiers"],
        "description": studio_rule["description"],
        "studio_rule": studio_rule,
    }


def merge_template_data(existing: Dict[str, Any] | None, incoming: Dict[str, Any]) -> Dict[str, Any]:
    existing = existing or {}

    result = dict(existing)
    result["company_id"] = incoming.get("company_id") or existing.get("company_id")
    result["display_name"] = incoming.get("display_name") or existing.get("display_name")

    existing_detection = existing.get("detection") or {}
    incoming_detection = incoming.get("detection") or {}
    result["detection"] = {
        "match_strings": _unique_nonempty(
            list(existing_detection.get("match_strings", [])) +
            list(incoming_detection.get("match_strings", []))
        ),
        "priority": max(int(existing_detection.get("priority", 0) or 0), int(incoming_detection.get("priority", 0) or 0)),
    }

    result["anchors"] = _unique_nonempty(list(existing.get("anchors", [])) + list(incoming.get("anchors", [])))
    result["regex"] = _merge_entries_by_id(existing.get("regex", []), incoming.get("regex", []))
    result["layout"] = _merge_entries_by_id(existing.get("layout", []), incoming.get("layout", []))
    result["barcode_qr"] = _merge_entries_by_id(existing.get("barcode_qr", []), incoming.get("barcode_qr", []))
    result["sensitive_terms"] = _unique_nonempty(list(existing.get("sensitive_terms", [])) + list(incoming.get("sensitive_terms", [])))
    result["identifiers"] = _unique_nonempty(list(existing.get("identifiers", [])) + list(incoming.get("identifiers", [])))
    result["description"] = incoming.get("description") or existing.get("description") or ""

    existing_studio = existing.get("studio_rule") or {}
    incoming_studio = incoming.get("studio_rule") or {}
    result["studio_rule"] = {
        "id": incoming_studio.get("id") or existing_studio.get("id") or _safe_id(result["company_id"], "company_rule"),
        "name": incoming_studio.get("name") or existing_studio.get("name") or result["display_name"],
        "patterns": _unique_nonempty(list(existing_studio.get("patterns", [])) + list(incoming_studio.get("patterns", []))),
        "type": incoming_studio.get("type") or existing_studio.get("type") or "regex",
        "isActive": incoming_studio.get("isActive", existing_studio.get("isActive", True)),
        "sensitiveTerms": _unique_nonempty(list(existing_studio.get("sensitiveTerms", [])) + list(incoming_studio.get("sensitiveTerms", []))),
        "learnedCoordinates": _merge_entries_by_id(
            existing_studio.get("learnedCoordinates", []),
            incoming_studio.get("learnedCoordinates", []),
        ),
        "identifiers": _unique_nonempty(list(existing_studio.get("identifiers", [])) + list(incoming_studio.get("identifiers", []))),
        "description": incoming_studio.get("description") or existing_studio.get("description") or result["description"],
    }

    return result


def load_template_file(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)
