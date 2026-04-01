# backend/rules/types.py
from dataclasses import dataclass, field
from typing import List, Optional, Literal, TypedDict, Dict, Any

PageScope = Literal["all", "first_page"]

# ---- Universal rules JSON ----

class TextRuleDict(TypedDict, total=False):
    id: str
    label: str
    type: Literal["regex"]
    pattern: str
    page_scope: PageScope
    group: str
    confidence: float
    action: Literal["suggest", "redact"]

class BarcodeRulesDict(TypedDict):
    enabled: bool
    engines: List[str]
    default_action: Literal["suggest", "redact"]
    page_scope: PageScope
    confidence: float

class LayoutRuleDict(TypedDict, total=False):
    id: str
    label: str
    type: Literal["zone"]
    page_scope: PageScope
    relative: bool
    rect: Dict[str, float]
    anchor_text: Optional[str]
    action: Literal["suggest", "redact"]

class UniversalRules(TypedDict):
    version: str
    description: str
    text_rules: List[TextRuleDict]
    barcode_rules: BarcodeRulesDict
    qr_rules: BarcodeRulesDict
    layout_rules: List[LayoutRuleDict]

# ---- Defaults JSONs ----

class DefaultsAnchors(TypedDict):
    actual_anchors: List[str]

class DefaultsRegexEntry(TypedDict):
    id: str
    pattern: str
    label: str
    action: Literal["suggest", "redact"]
    confidence: float

class DefaultsRegex(TypedDict):
    actual_regex: List[DefaultsRegexEntry]

class DefaultsLayoutEntry(TypedDict, total=False):
    id: str
    rect: Dict[str, float]
    page_scope: PageScope
    action: Literal["suggest", "redact"]

class DefaultsLayout(TypedDict):
    layout_defaults: List[DefaultsLayoutEntry]

class DefaultsBarcodeZone(TypedDict):
    rect: Dict[str, float]
    page_scope: PageScope
    action: Literal["suggest", "redact"]

class DefaultsBarcodeQrInner(TypedDict):
    barcode_zones: List[DefaultsBarcodeZone]
    qr_zones: List[DefaultsBarcodeZone]

class DefaultsBarcodeQr(TypedDict):
    barcode_qr_defaults: DefaultsBarcodeQrInner

# ---- Company rules JSON ----

class CompanyDetection(TypedDict):
    match_strings: List[str]
    priority: int

class CompanyRegexEntry(TypedDict, total=False):
    id: str
    pattern: str
    action: Literal["suggest", "redact"]

class CompanyLayoutEntry(TypedDict, total=False):
    id: str
    rect: Dict[str, float]
    relative: bool
    page_scope: PageScope
    anchor_text: Optional[str]
    action: Literal["suggest", "redact"]

class CompanyBarcodeQrEntry(TypedDict, total=False):
    id: str
    rect: Dict[str, float]
    relative: bool
    page_scope: PageScope
    action: Literal["suggest", "redact"]

class CompanyRules(TypedDict, total=False):
    company_id: str
    display_name: str
    detection: CompanyDetection
    anchors: List[str]
    regex: List[CompanyRegexEntry]
    layout: List[CompanyLayoutEntry]
    barcode_qr: List[CompanyBarcodeQrEntry]
    sensitive_terms: List[str]
    identifiers: List[str]
    description: str
    studio_rule: Dict[str, Any]

# ---- Normalized internal types ----

@dataclass
class TextRule:
    id: str
    label: str
    type: Literal["regex"]
    pattern: str
    action: Literal["suggest", "redact"]
    confidence: float
    page_scope: PageScope

@dataclass
class LayoutRule:
    id: str
    label: str
    type: Literal["zone"]
    rect: Dict[str, float]
    page_scope: PageScope
    action: Literal["suggest", "redact"]
    relative: bool
    anchor_text: Optional[str] = None

@dataclass
class BarcodeZone:
    rect: Dict[str, float]
    page_scope: PageScope
    action: Literal["suggest", "redact"]

@dataclass
class MergedRuleSet:
    company_id: Optional[str]
    display_name: Optional[str]
    text_rules: List[TextRule]
    anchors: List[str]
    layout_rules: List[LayoutRule]
    barcode_config: BarcodeRulesDict
    qr_config: BarcodeRulesDict
    barcode_zones: List[BarcodeZone]
    qr_zones: List[BarcodeZone]
    sensitive_terms: List[str] = field(default_factory=list)
    company_constants: Dict[str, List[str]] = field(default_factory=dict)

    def to_jsonable(self) -> Dict[str, Any]:
        return {
            "company_id": self.company_id,
            "display_name": self.display_name,
            "text_rules": [t.__dict__ for t in self.text_rules],
            "anchors": self.anchors,
            "layout_rules": [l.__dict__ for l in self.layout_rules],
            "barcode_config": self.barcode_config,
            "qr_config": self.qr_config,
            "barcode_zones": [z.__dict__ for z in self.barcode_zones],
            "qr_zones": [z.__dict__ for z in self.qr_zones],
        }
