# ------------------------------------------------------------
# backend/template_loader.py
# FIXED: schema validation, safe defaults, structure normalization
# ------------------------------------------------------------

import os
import json
from typing import Dict, Any, List, Optional


class TemplateLoader:
    """
    Loads unified templates from backend/templates_unified.

    FIXED:
    - Never crashes on missing fields
    - Validates schema
    - Normalizes rules + zones
    - Provides safe defaults
    """

    def __init__(self, templates_dir: Optional[str] = None):
        base_dir = os.path.dirname(__file__)
        self.templates_dir = templates_dir or os.path.join(
            base_dir, "..", "config", "rules", "company_rules"
        )
        self.templates: Dict[str, Dict[str, Any]] = {}
        self._loaded = False
        self.load_templates()

    # ---------------------------------------------------------
    # Safe JSON loader
    # ---------------------------------------------------------
    def _load_json(self, path: str) -> Optional[Dict[str, Any]]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[template_loader] ERROR reading {path}: {e}")
            return None

    # ---------------------------------------------------------
    # Schema normalization helpers
    # ---------------------------------------------------------
    def _normalize_rule(self, r: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure rule has safe defaults and required fields."""
        return {
            "id": r.get("id"),
            "type": r.get("type", "regex"),
            "pattern": r.get("pattern", ""),
            "flags": r.get("flags", "i"),
            "color": r.get("color", "#000000"),
            "mode": r.get("mode", "black"),
        }

    def _normalize_zone(self, z: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure zone has safe defaults and valid rect."""
        rect = z.get("rect", {})
        def clamp(v):
            try:
                v = float(v)
            except Exception:
                return 0.0
            return max(0.0, min(1.0, v))

        safe_rect = {
            "x0": clamp(rect.get("x0", 0)),
            "y0": clamp(rect.get("y0", 0)),
            "x1": clamp(rect.get("x1", 1)),
            "y1": clamp(rect.get("y1", 1)),
        }

        return {
            "id": z.get("id"),
            "page": z.get("page", 1),
            "rect": safe_rect,
            "color": z.get("color", "#000000"),
            "mode": z.get("mode", "black"),
            "action": z.get("action", "redact"),
        }

    def _normalize_template(self, t: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize entire template structure."""
        # Map your schema → detector schema
        keywords = t.get("detection", {}).get("match_strings", [])
        aliases = t.get("anchors", [])
        rules = t.get("regex", [])
        zones = t.get("layout", [])

        return {
            "company_id": t.get("company_id", "unknown"),
            "display_name": t.get("display_name", t.get("company_id", "Unknown")),
            "type": t.get("type", "generic"),
            "keywords": keywords,
            "aliases": aliases,
            "rules": [self._normalize_rule(r) for r in rules],
            "zones": [self._normalize_zone(z) for z in zones],
            "manual_presets": t.get("manual_presets", {}),
            "sensitive_terms": t.get("sensitive_terms", []),
            "identifiers": t.get("identifiers", []),
            "description": t.get("description", ""),
            "studio_rule": t.get("studio_rule", {}),
        }


    # ---------------------------------------------------------
    # Load all templates from templates_unified/*.json
    # ---------------------------------------------------------
    def load_templates(self, force: bool = False) -> None:
        if self._loaded and not force:
            return

        if not os.path.isdir(self.templates_dir):
            raise FileNotFoundError(
                f"Templates directory not found: {self.templates_dir}"
            )

        self.templates.clear()

        for filename in os.listdir(self.templates_dir):
            if not filename.lower().endswith(".json"):
                continue

            path = os.path.join(self.templates_dir, filename)
            raw = self._load_json(path)
            if not raw:
                continue

            try:
                # Validate required fields
                if "company_id" not in raw:
                    print(f"[template_loader] WARNING: {filename} missing company_id")
                    continue
                if "display_name" not in raw:
                    print(f"[template_loader] WARNING: {filename} missing display_name")

                normalized = self._normalize_template(raw)
                cid = normalized["company_id"]
                self.templates[cid] = normalized

                print(f"[template_loader] Loaded template: {cid} ({filename})")

            except Exception as e:
                print(f"[template_loader] ERROR loading {filename}: {e}")

        if not self.templates:
            raise RuntimeError(
                f"No valid templates loaded from directory: {self.templates_dir}"
            )

        self._loaded = True

    # ---------------------------------------------------------
    # Get template by company_id
    # ---------------------------------------------------------
    def get_template(self, company_id: str) -> Optional[Dict[str, Any]]:
        return self.templates.get(company_id)

    # ---------------------------------------------------------
    # Return all templates (raw dicts)
    # ---------------------------------------------------------
    def get_all_templates(self) -> List[Dict[str, Any]]:
        return list(self.templates.values())

    # ---------------------------------------------------------
    # List all template IDs
    # ---------------------------------------------------------
    def list_templates(self) -> List[str]:
        return list(self.templates.keys())
