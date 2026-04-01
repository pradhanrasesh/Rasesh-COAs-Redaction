# backend/rules/merge_engine.py
import json
import os
from typing import Optional, List

from .types import (
    UniversalRules,
    DefaultsAnchors,
    DefaultsRegex,
    DefaultsLayout,
    DefaultsBarcodeQr,
    CompanyRules,
    MergedRuleSet,
    BarcodeZone,
)
from .merge_utils import (
    merge_by_id,
    concat_unique_strings,
    normalize_defaults_regex_to_text_rules,
    normalize_company_regex_to_text_rules,
    normalize_defaults_layout_to_layout_rules,
    normalize_company_layout_to_layout_rules,
    normalize_defaults_barcode_qr,
)

# -------------------------------------------------------------------
# Base paths (robust against where uvicorn is launched from)
# -------------------------------------------------------------------
_THIS_DIR = os.path.dirname(__file__)
_PROJECT_ROOT = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))
_RULES_ROOT = os.path.join(_PROJECT_ROOT, "config", "rules")
_COMPANY_RULES_DIR = os.path.join(_RULES_ROOT, "company_rules")
_DEFAULTS_DIR = os.path.join(_COMPANY_RULES_DIR, "defaults")
_UNIVERSAL_RULES_PATH = os.path.join(_RULES_ROOT, "universal_rules.json")
_COMPANY_CONSTANTS_PATH = os.path.join(_RULES_ROOT, "company_constants.json")


def load_json(path: str):
    """
    Safe JSON loader. Returns {} if file is missing or invalid,
    instead of crashing the whole app.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"[merge_engine] WARNING: JSON file not found: {path}")
        return {}
    except Exception as e:
        print(f"[merge_engine] ERROR reading {path}: {e}")
        return {}


def detect_company(doc_text: str, company_rules_dir: str) -> Optional[CompanyRules]:
    """
    Scan all company JSONs and pick the highest-priority match
    whose detection.match_strings appear in doc_text.
    """
    best: Optional[CompanyRules] = None
    best_score = -1

    if not os.path.isdir(company_rules_dir):
        print(f"[merge_engine] WARNING: company_rules_dir does not exist: {company_rules_dir}")
        return None

    for fname in os.listdir(company_rules_dir):
        if not fname.endswith(".json"):
            continue
        if fname.lower().startswith("defaults"):
            continue

        full = os.path.join(company_rules_dir, fname)
        rules: CompanyRules = load_json(full)
        if not rules:
            continue

        detection = rules.get("detection")
        if not detection:
            continue

        match_strings: List[str] = detection.get("match_strings", [])
        priority: int = detection.get("priority", 0)

        if any(s.lower() in doc_text.lower() for s in match_strings):
            if priority > best_score:
                best = rules
                best_score = priority

    return best


def merge_rules_for_company(company: Optional[CompanyRules], base_dir: str | None = None) -> MergedRuleSet:
    """
    Merge universal + defaults + company rules into a structured MergedRuleSet.

    base_dir is optional; if it's wrong or missing, we fall back to the
    project root resolved above so we never end up at C:\\projects\\config\\...
    """
    # Resolve base_dir safely
    if base_dir and os.path.isdir(os.path.join(base_dir, "config", "rules")):
        project_root = base_dir
    else:
        project_root = _PROJECT_ROOT

    rules_root = os.path.join(project_root, "config", "rules")
    company_rules_dir = os.path.join(rules_root, "company_rules")
    defaults_dir = os.path.join(company_rules_dir, "defaults")

    universal_path = os.path.join(rules_root, "universal_rules.json")
    anchors_path = os.path.join(defaults_dir, "anchors.json")
    regex_path = os.path.join(defaults_dir, "regex.json")
    layout_path = os.path.join(defaults_dir, "layout.json")
    barcode_qr_path = os.path.join(defaults_dir, "barcode_qr.json")

    # -------------------------------------------------------------------
    # UNIVERSAL + DEFAULTS
    # -------------------------------------------------------------------
    # NEW LOGIC:
    # - If company is detected: ONLY use company-specific rules (no universal, no defaults)
    # - If company is NOT detected: use universal rules + defaults
    if company:
        # Company detected: use only company rules
        universal = {
            "text_rules": [],
            "layout_rules": [],
            "barcode_rules": {},
            "qr_rules": {},
        }
        # Don't load defaults for detected companies
        defaults_anchors: DefaultsAnchors = {}
        defaults_regex: DefaultsRegex = {}
        defaults_layout: DefaultsLayout = {}
        defaults_barcode_qr: DefaultsBarcodeQr = {}
    else:
        # No company detected: use universal + defaults
        universal = load_json(_UNIVERSAL_RULES_PATH)
        defaults_anchors: DefaultsAnchors = load_json(anchors_path)
        defaults_regex: DefaultsRegex = load_json(regex_path)
        defaults_layout: DefaultsLayout = load_json(layout_path)
        defaults_barcode_qr: DefaultsBarcodeQr = load_json(barcode_qr_path)
    
    global_company_constants = load_json(_COMPANY_CONSTANTS_PATH).get("company_constants", {})

    # -------------------------------------------------------------------
    # 1) TEXT RULES
    # -------------------------------------------------------------------
    from .types import TextRule

    universal_text: List[TextRule] = []
    for r in universal.get("text_rules", []):
        try:
            universal_text.append(
                TextRule(
                    id=r["id"],
                    label=r.get("label", r["id"]),
                    type="regex",
                    pattern=r.get("pattern", ""),
                    action=r.get("action", "suggest"),
                    confidence=r.get("confidence", 1.0),
                    page_scope=r.get("page_scope", "all"),
                )
            )
        except KeyError:
            continue

    defaults_text = normalize_defaults_regex_to_text_rules(defaults_regex)
    company_text = (
        normalize_company_regex_to_text_rules(company.get("regex", []))
        if company and "regex" in company
        else []
    )

    def text_to_dict(ts: List[TextRule]):
        return [t.__dict__ for t in ts]

    def dict_to_text(ds):
        out: List[TextRule] = []
        for d in ds:
            out.append(
                TextRule(
                    id=d["id"],
                    label=d.get("label", d["id"]),
                    type="regex",
                    pattern=d.get("pattern", ""),
                    action=d.get("action", "suggest"),
                    confidence=d.get("confidence", 1.0),
                    page_scope=d.get("page_scope", "all"),
                )
            )
        return out

    merged_text_dicts = merge_by_id(
        merge_by_id(text_to_dict(universal_text), text_to_dict(defaults_text)),
        text_to_dict(company_text),
    )
    text_merged = dict_to_text(merged_text_dicts)

    # -------------------------------------------------------------------
    # 2) ANCHORS
    # -------------------------------------------------------------------
    anchors = list(defaults_anchors.get("actual_anchors", []))
    if company and "anchors" in company:
        anchors = concat_unique_strings(anchors, company.get("anchors", []))

    # -------------------------------------------------------------------
    # 3) LAYOUT
    # -------------------------------------------------------------------
    from .types import LayoutRule

    universal_layout_raw = universal.get("layout_rules", [])
    universal_layout: List[LayoutRule] = []
    for r in universal_layout_raw:
        try:
            universal_layout.append(
                LayoutRule(
                    id=r["id"],
                    label=r.get("label", r["id"]),
                    type="zone",
                    rect=r["rect"],
                    page_scope=r.get("page_scope", "all"),
                    action=r.get("action", "suggest"),
                    relative=r.get("relative", True),
                    anchor_text=r.get("anchor_text"),
                )
            )
        except KeyError:
            continue

    defaults_layout_rules = normalize_defaults_layout_to_layout_rules(defaults_layout)
    company_layout_rules = (
        normalize_company_layout_to_layout_rules(company.get("layout", []))
        if company and "layout" in company
        else []
    )

    def layout_to_dict(ls: List[LayoutRule]):
        return [l.__dict__ for l in ls]

    def dict_to_layout(ds):
        out: List[LayoutRule] = []
        for d in ds:
            out.append(
                LayoutRule(
                    id=d["id"],
                    label=d.get("label", d["id"]),
                    type="zone",
                    rect=d["rect"],
                    page_scope=d.get("page_scope", "all"),
                    action=d.get("action", "suggest"),
                    relative=d.get("relative", True),
                )
            )
        return out

    merged_layout_dicts = merge_by_id(
        merge_by_id(layout_to_dict(universal_layout), layout_to_dict(defaults_layout_rules)),
        layout_to_dict(company_layout_rules),
    )
    layout_merged = dict_to_layout(merged_layout_dicts)

    # -------------------------------------------------------------------
    # 3.5) LEARNED RULES (offline training layer)
    # -------------------------------------------------------------------
    # Learned rules are merged after curated company rules, so they can
    # override/augment patterns by id.
    learned_regex = []
    learned_layout = []
    learned_company_id = company.get("company_id") if company else None
    if learned_company_id:
        try:
            from backend.ai.learned_rules_loader import load_learned_rules

            learned = load_learned_rules(str(learned_company_id), base_dir=project_root)
            learned_regex = learned.get("regex", []) or []
            learned_layout = learned.get("layout", []) or []
        except Exception as e:
            print(f"[merge_engine] WARNING: failed to load learned rules: {e}")

    if learned_regex:
        learned_text_rules: List[TextRule] = normalize_company_regex_to_text_rules(learned_regex)
        text_merged_dicts = merge_by_id(
            [t.__dict__ for t in text_merged],
            [t.__dict__ for t in learned_text_rules],
        )
        text_merged = dict_to_text(text_merged_dicts)

    if learned_layout:
        # Learned layout entries follow the same keys as company layout entries.
        learned_layout_rules: List[LayoutRule] = []
        for z in learned_layout:
            try:
                learned_layout_rules.append(
                    LayoutRule(
                        id=z["id"],
                        label=z.get("label", z["id"]),
                        type="zone",
                        rect=z["rect"],
                        page_scope=z.get("page_scope", "all"),
                        action=z.get("action", "suggest"),
                        relative=z.get("relative", True),
                        anchor_text=z.get("anchor_text"),
                    )
                )
            except Exception:
                continue

        layout_merged_dicts = merge_by_id(
            [l.__dict__ for l in layout_merged],
            [l.__dict__ for l in learned_layout_rules],
        )
        layout_merged = dict_to_layout(layout_merged_dicts)

    # -------------------------------------------------------------------
    # 4) BARCODE / QR CONFIG + ZONES
    # -------------------------------------------------------------------
    barcode_config = universal.get("barcode_rules", {})
    qr_config = universal.get("qr_rules", {})

    default_barcode_zones, default_qr_zones = normalize_defaults_barcode_qr(defaults_barcode_qr)

    company_barcode_zones: List[BarcodeZone] = []
    if company and "barcode_qr" in company:
        for z in company.get("barcode_qr", []):
            try:
                company_barcode_zones.append(
                    BarcodeZone(
                        rect=z["rect"],
                        page_scope=z.get("page_scope", "all"),
                        action=z.get("action", "suggest"),
                    )
                )
            except KeyError:
                continue

    barcode_zones = default_barcode_zones + company_barcode_zones
    qr_zones = default_qr_zones  # extend later if company adds QR-specific zones

    # ------------------------------------------------------------
    # 5) COMPANY CONSTANTS (global + per-company)
    # ------------------------------------------------------------
    company_constants = {
        "addresses": [],
        "phones": [],
        "emails": [],
        "ignore_patterns": [],
    }

    # Add global constants first
    company_constants["addresses"].extend(global_company_constants.get("addresses", []))
    company_constants["phones"].extend(global_company_constants.get("phones", []))
    company_constants["emails"].extend(global_company_constants.get("emails", []))
    company_constants["ignore_patterns"].extend(global_company_constants.get("ignore_patterns", []))

    # Add company-specific constants
    if company and "company_constants" in company:
        cc = company.get("company_constants") or {}
        company_constants["addresses"].extend(cc.get("addresses", []))
        company_constants["phones"].extend(cc.get("phones", []))
        company_constants["emails"].extend(cc.get("emails", []))
        company_constants["ignore_patterns"].extend(cc.get("ignore_patterns", []))

    return MergedRuleSet(
        company_id=company.get("company_id") if company else None,
        display_name=company.get("display_name") if company else None,
        text_rules=text_merged,
        anchors=anchors,
        layout_rules=layout_merged,
        barcode_config=barcode_config,
        qr_config=qr_config,
        barcode_zones=barcode_zones,
        qr_zones=qr_zones,
        sensitive_terms=company.get("sensitive_terms", []) if company else [],
        company_constants=company_constants,
    )
