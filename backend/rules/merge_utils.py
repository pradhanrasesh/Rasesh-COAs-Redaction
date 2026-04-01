# backend/rules/merge_utils.py
from typing import List, TypeVar, Dict
from .types import (
    TextRule,
    LayoutRule,
    BarcodeZone,
    DefaultsRegex,
    DefaultsLayout,
    CompanyRules,
    CompanyRegexEntry,
    CompanyLayoutEntry,
    DefaultsBarcodeQr,
)

T = TypeVar("T", bound=Dict)


def merge_by_id(base: List[T], override: List[T]) -> List[T]:
    """Simple 'last wins' merge by id."""
    by_id: Dict[str, T] = {}
    for r in base:
        by_id[r["id"]] = r
    for r in override:
        by_id[r["id"]] = r
    return list(by_id.values())


def concat_unique_strings(base: List[str], extra: List[str]) -> List[str]:
    seen = set(base)
    for s in extra:
        if s not in seen:
            seen.add(s)
            base.append(s)
    return base


def normalize_defaults_regex_to_text_rules(defaults: DefaultsRegex) -> List[TextRule]:
    """
    Supports BOTH:
    - { "actual_regex": [...] }
    - { "regex": [...] }
    """
    rules: List[TextRule] = []
    entries = defaults.get("actual_regex") or defaults.get("regex") or []

    for r in entries:
        rules.append(
            TextRule(
                id=r["id"],
                label=r.get("label", r["id"]),
                type="regex",
                pattern=r["pattern"],
                action=r.get("action", "suggest"),
                confidence=r.get("confidence", 0.95),
                page_scope="all",
            )
        )
    return rules


def normalize_company_regex_to_text_rules(company_regex: List[CompanyRegexEntry]) -> List[TextRule]:
    rules: List[TextRule] = []
    for r in company_regex:
        rules.append(
            TextRule(
                id=r["id"],
                label=r.get("label", r["id"]),
                type="regex",
                pattern=r["pattern"],
                action=r["action"],
                confidence=r.get("confidence", 0.95),
                page_scope="all",
            )
        )
    return rules


def normalize_defaults_layout_to_layout_rules(defaults: DefaultsLayout) -> List[LayoutRule]:
    """
    Supports BOTH:
    - { "layout_defaults": [...] }
    - { "layout": [...] }
    """
    rules: List[LayoutRule] = []
    entries = defaults.get("layout_defaults") or defaults.get("layout") or []

    for r in entries:
        rules.append(
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
    return rules


def normalize_company_layout_to_layout_rules(company_layout: List[CompanyLayoutEntry]) -> List[LayoutRule]:
    rules: List[LayoutRule] = []
    for r in company_layout:
        rules.append(
            LayoutRule(
                id=r["id"],
                label=r["id"],
                type="zone",
                rect=r["rect"],
                page_scope=r.get("page_scope", "all"),
                action=r["action"],
                relative=r.get("relative", True),
                anchor_text=r.get("anchor_text"),
            )
        )
    return rules


def normalize_defaults_barcode_qr(defaults: DefaultsBarcodeQr):
    """
    Supports BOTH:
    - { "barcode_qr_defaults": { ... } }
    - { "barcode_qr": { ... } }
    """
    barcode_zones: List[BarcodeZone] = []
    qr_zones: List[BarcodeZone] = []

    root = defaults.get("barcode_qr_defaults") or defaults.get("barcode_qr") or {}

    for z in root.get("barcode_zones", []):
        barcode_zones.append(
            BarcodeZone(
                rect=z["rect"],
                page_scope=z.get("page_scope", "all"),
                action=z.get("action", "suggest"),
            )
        )

    for z in root.get("qr_zones", []):
        qr_zones.append(
            BarcodeZone(
                rect=z["rect"],
                page_scope=z.get("page_scope", "all"),
                action=z.get("action", "suggest"),
            )
        )

    return barcode_zones, qr_zones
