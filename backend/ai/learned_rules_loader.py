import json
import os
from typing import Any, Dict, List, Optional


def _clamp01(v: Any) -> float:
    try:
        f = float(v)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, f))


def _safe_read_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"[learned_rules_loader] ERROR reading {path}: {e}")
        return {}


def load_learned_rules(company_id: str, base_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Load per-company learned rules from:
      config/rules/learned_ai/<company_id>.json

    Returns normalized dict with keys:
      - company_id
      - display_name
      - regex (list)
      - layout (list)
    """
    if not company_id:
        return {
            "company_id": None,
            "display_name": None,
            "regex": [],
            "layout": [],
        }

    # Resolve project root if caller didn't provide it.
    if base_dir:
        project_root = base_dir
    else:
        this_dir = os.path.dirname(__file__)
        project_root = os.path.abspath(os.path.join(this_dir, "..", ".."))

    path = os.path.join(project_root, "config", "rules", "learned_ai", f"{company_id}.json")
    raw = _safe_read_json(path)

    display_name = raw.get("display_name") or company_id

    # Normalize regex entries (shape validation kept intentionally loose).
    regex_entries: List[Dict[str, Any]] = []
    for r in raw.get("regex", []) or []:
        if not isinstance(r, dict):
            continue
        pattern = r.get("pattern")
        label = r.get("label") or r.get("id")
        rid = r.get("id")
        if not pattern or not label or not rid:
            # Skip incomplete entries; training endpoint will always write complete records.
            continue

        regex_entries.append(
            {
                "id": str(rid),
                "label": str(label),
                "pattern": str(pattern),
                "action": r.get("action", "suggest"),
                "confidence": float(r.get("confidence", 0.6)),
            }
        )

    # Normalize layout entries (optional).
    layout_entries: List[Dict[str, Any]] = []
    for z in raw.get("layout", []) or []:
        if not isinstance(z, dict):
            continue
        rid = z.get("id")
        label = z.get("label") or rid
        rect = z.get("rect") or {}
        if not rid or not label or not isinstance(rect, dict):
            continue

        layout_entries.append(
            {
                "id": str(rid),
                "label": str(label),
                "rect": {
                    "x0": _clamp01(rect.get("x0", 0.0)),
                    "y0": _clamp01(rect.get("y0", 0.0)),
                    "x1": _clamp01(rect.get("x1", 1.0)),
                    "y1": _clamp01(rect.get("y1", 1.0)),
                },
                "page_scope": z.get("page_scope", "all"),
                "action": z.get("action", "suggest"),
                "relative": bool(z.get("relative", True)),
                "confidence": float(z.get("confidence", 0.6)),
            }
        )

    return {
        "company_id": str(company_id),
        "display_name": str(display_name),
        "regex": regex_entries,
        "layout": layout_entries,
        "version": raw.get("version", 1),
    }

