import os
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.ai.local_learner import update_learned_rules
from backend.ai.train_from_pair import train_from_pair
from backend.studio_rule_bridge import build_studio_rule_payload, merge_template_data, load_template_file


router = APIRouter(prefix="/api/ai", tags=["AI-Training"])


def _get_learned_base_dir() -> str:
    this_dir = os.path.dirname(__file__)  # backend/api
    return os.path.abspath(os.path.join(this_dir, "..", "..", "config", "rules", "learned_ai"))


def _get_company_rules_dir() -> str:
    this_dir = os.path.dirname(__file__)
    return os.path.abspath(os.path.join(this_dir, "..", "..", "config", "rules", "company_rules"))


def _get_company_template(company_id: str) -> Dict[str, Any]:
    company_path = os.path.join(_get_company_rules_dir(), f"{company_id}.json")
    return load_template_file(company_path)


def _template_to_training_items(company_id: str, template: Dict[str, Any]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    studio_rule = template.get("studio_rule") or {}
    for index, coord in enumerate(studio_rule.get("learnedCoordinates", []) or []):
        try:
            page_number = int(coord.get("pageIndex", 0) or 0) + 1
        except Exception:
            page_number = 1
        width = float(coord.get("width", 0.0) or 0.0) / 100.0
        height = float(coord.get("height", 0.0) or 0.0) / 100.0
        x0 = float(coord.get("x", 0.0) or 0.0) / 100.0
        y0 = float(coord.get("y", 0.0) or 0.0) / 100.0
        items.append(
            {
                "id": f"studio_{index}",
                "label": coord.get("label") or "Learned Area",
                "group": "manual",
                "sample_text": "",
                "text": "",
                "rects": [
                    {
                        "x0": x0,
                        "y0": y0,
                        "x1": x0 + width,
                        "y1": y0 + height,
                    }
                ],
                "page": page_number,
                "source": "studio_rule",
            }
        )

    for index, layout in enumerate(template.get("layout", []) or []):
        rect = layout.get("rect") or {}
        if not rect or str(layout.get("action") or "").lower() == "ignore":
            continue
        items.append(
            {
                "id": f"layout_{index}",
                "label": layout.get("label") or layout.get("id") or "Template Area",
                "group": layout.get("action") or "layout",
                "sample_text": "",
                "text": "",
                "rects": [
                    {
                        "x0": float(rect.get("x0", 0.0) or 0.0),
                        "y0": float(rect.get("y0", 0.0) or 0.0),
                        "x1": float(rect.get("x1", 1.0) or 1.0),
                        "y1": float(rect.get("y1", 1.0) or 1.0),
                    }
                ],
                "page": 1,
                "source": "layout",
            }
        )

    deduped: List[Dict[str, Any]] = []
    seen = set()
    for item in items:
        rect = (item.get("rects") or [{}])[0]
        key = (
            str(item.get("label") or ""),
            int(item.get("page", 1) or 1),
            round(float(rect.get("x0", 0.0) or 0.0), 4),
            round(float(rect.get("y0", 0.0) or 0.0), 4),
            round(float(rect.get("x1", 1.0) or 1.0), 4),
            round(float(rect.get("y1", 1.0) or 1.0), 4),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def _template_to_studio_company_rule(company_id: str, template: Dict[str, Any]) -> Dict[str, Any]:
    studio_rule = template.get("studio_rule") or {}
    return {
        "id": studio_rule.get("id") or company_id,
        "name": studio_rule.get("name") or template.get("display_name") or company_id,
        "patterns": list(studio_rule.get("patterns", []) or []),
        "type": studio_rule.get("type") or "regex",
        "isActive": bool(studio_rule.get("isActive", True)),
        "sensitiveTerms": list(studio_rule.get("sensitiveTerms", []) or template.get("sensitive_terms", []) or []),
        "learnedCoordinates": list(studio_rule.get("learnedCoordinates", []) or []),
        "identifiers": list(studio_rule.get("identifiers", []) or template.get("identifiers", []) or []),
        "description": studio_rule.get("description") or template.get("description") or "",
    }


def _studio_company_rule_to_template(rule: Dict[str, Any]) -> Dict[str, Any]:
    name = str(rule.get("name") or rule.get("id") or "Imported Company").strip() or "Imported Company"
    company_id = str(rule.get("id") or name).strip() or name
    identifiers = [name] + list(rule.get("identifiers", []) or [])
    identifiers = [str(value).strip() for value in identifiers if str(value or "").strip()]

    return {
        "company_id": company_id,
        "display_name": name,
        "detection": {
            "match_strings": identifiers,
            "priority": 5,
        },
        "anchors": identifiers,
        "regex": [
            {
                "id": f"imported_regex_{index}",
                "pattern": pattern,
                "action": "suggest",
            }
            for index, pattern in enumerate(rule.get("patterns", []) or [])
            if str(pattern or "").strip()
        ],
        "layout": [],
        "barcode_qr": [],
        "sensitive_terms": list(rule.get("sensitiveTerms", []) or []),
        "identifiers": identifiers,
        "description": str(rule.get("description") or "Imported from Redection-studio offline template").strip(),
        "studio_rule": {
            "id": company_id,
            "name": name,
            "patterns": list(rule.get("patterns", []) or []),
            "type": rule.get("type") or "regex",
            "isActive": bool(rule.get("isActive", True)),
            "sensitiveTerms": list(rule.get("sensitiveTerms", []) or []),
            "learnedCoordinates": list(rule.get("learnedCoordinates", []) or []),
            "identifiers": identifiers,
            "description": str(rule.get("description") or "Imported from Redection-studio offline template").strip(),
        },
    }


class TrainingItem(BaseModel):
    label: str
    group: Optional[str] = None
    sample_text: Optional[str] = None
    text: Optional[str] = None
    rects: List[Dict[str, Any]] = []
    page: int = 1


class LearnRequest(BaseModel):
    company_id: str
    display_name: Optional[str] = None
    items: List[TrainingItem]
    replace_existing: bool = False


@router.post("/learn")
def learn(request: LearnRequest):
    if not request.company_id:
        raise HTTPException(status_code=400, detail="Missing company_id")

    events = []
    for item in request.items or []:
        payload = item.dict()
        payload["sample_text"] = (payload.get("sample_text") or payload.get("text") or "").strip()
        events.append(payload)

    if not events:
        return {"status": "skipped", "reason": "no training items"}

    if request.replace_existing:
        learned_path = os.path.join(_get_learned_base_dir(), f"{request.company_id}.json")
        company_path = os.path.join(_get_company_rules_dir(), f"{request.company_id}.json")
        for path in [learned_path, company_path]:
            if os.path.exists(path):
                os.remove(path)

    display_name = request.display_name or request.company_id
    updated = update_learned_rules(
        company_id=request.company_id,
        display_name=display_name,
        events=events,
    )

    company_rules_dir = _get_company_rules_dir()
    os.makedirs(company_rules_dir, exist_ok=True)
    company_path = os.path.join(company_rules_dir, f"{request.company_id}.json")
    merged_company_template = merge_template_data(
        load_template_file(company_path),
        build_studio_rule_payload(request.company_id, display_name, events),
    )

    with open(company_path, "w", encoding="utf-8") as handle:
        json.dump(merged_company_template, handle, indent=2)

    return {
        "status": "ok",
        "company_id": request.company_id,
        "display_name": display_name,
        "regex_count": len(updated.get("regex", []) or []),
        "learned_version": updated.get("version", 1),
        "studio_rule": merged_company_template.get("studio_rule", {}),
    }


class TrainPairResponse(BaseModel):
    status: str


@router.post("/train-pair")
async def train_pair(
    unredacted: UploadFile = File(...),
    redacted: Optional[UploadFile] = File(None),
    company_id: Optional[str] = None,
):
    unredacted_bytes = await unredacted.read()

    if redacted is None:
        from backend.redaction.text_finder import TextFinder
        from backend.suggestions import build_final_rules_for_document, generate_suggestions

        finder = TextFinder()
        spans = finder.find_text_spans(unredacted_bytes, use_ocr=False, auto_ocr=True)

        spans_by_page: Dict[int, List[Dict[str, Any]]] = {}
        for s in spans:
            page = int(getattr(s, "page", 1) or 1)
            spans_by_page.setdefault(page, []).append(
                {
                    "text": str(getattr(s, "text", "") or ""),
                    "x0": float(getattr(s, "x0", 0.0) or 0.0),
                    "y0": float(getattr(s, "y0", 0.0) or 0.0),
                    "x1": float(getattr(s, "x1", 1.0) or 1.0),
                    "y1": float(getattr(s, "y1", 1.0) or 1.0),
                }
            )

        pages_text = [
            " ".join(span["text"] for span in spans_by_page[p] if span.get("text"))
            for p in sorted(spans_by_page.keys())
        ] if spans_by_page else [""]

        full_text = " ".join(pages_text)
        final_rules = build_final_rules_for_document(full_text, company_hint=company_id)
        suggestions = generate_suggestions(
            [],
            {"pages_text": pages_text, "spans_by_page": spans_by_page},
            final_rules,
            sensitivity=50,
        )

        normalized = []
        for s in suggestions:
            normalized.append(
                {
                    "label": s.get("label") or "REDACTED",
                    "group": s.get("group"),
                    "sample_text": s.get("text") or s.get("sample_text") or "",
                    "text": s.get("text") or s.get("sample_text") or "",
                    "rects": s.get("rects") or [],
                    "page": s.get("page") or 1,
                    "reason": s.get("reason", "Suggested from original PDF"),
                }
            )

        learned_company_id = str(getattr(final_rules, "company_id", None) or company_id or "universal")
        display_name = str(getattr(final_rules, "display_name", None) or learned_company_id)
        return {
            "status": "ok",
            "company_id": learned_company_id,
            "display_name": display_name,
            "missing_spans_found": len(normalized),
            "suggestions": normalized,
        }

    redacted_bytes = await redacted.read()

    result = train_from_pair(
        unredacted_pdf_bytes=unredacted_bytes,
        redacted_pdf_bytes=redacted_bytes,
        company_hint=company_id,
    )

    return result

@router.get("/rules/list")
def list_learned_rules():
    base_dir = _get_learned_base_dir()
    if not os.path.exists(base_dir):
        return []
    
    companies = []
    for f in os.listdir(base_dir):
        if f.endswith(".json"):
            cid = f[:-5]
            path = os.path.join(base_dir, f)
            try:
                with open(path, "r", encoding="utf-8") as j:
                    data = json.load(j)
                    company_template = _get_company_template(cid)
                    studio_rule = company_template.get("studio_rule", {})
                    companies.append({
                        "id": cid,
                        "display_name": data.get("display_name", cid),
                        "regex_count": len(data.get("regex", [])),
                        "updated_at": data.get("updated_at", "N/A"),
                        "studio_rule": {
                            "patterns": len(studio_rule.get("patterns", []) or []),
                            "sensitiveTerms": len(studio_rule.get("sensitiveTerms", []) or []),
                            "learnedCoordinates": len(studio_rule.get("learnedCoordinates", []) or []),
                        },
                    })
            except:
                continue
    return companies


@router.get("/templates/export")
def export_templates():
    rules_dir = _get_company_rules_dir()
    exported: List[Dict[str, Any]] = []
    if os.path.exists(rules_dir):
        for filename in sorted(os.listdir(rules_dir)):
            if not filename.endswith(".json"):
                continue
            company_id = filename[:-5]
            template = _get_company_template(company_id)
            if template:
                exported.append(_template_to_studio_company_rule(company_id, template))

    return JSONResponse(
        content=exported,
        headers={
            "Content-Disposition": 'attachment; filename="redectio-offline-templates.json"'
        },
    )


@router.post("/templates/import")
async def import_templates(
    file: UploadFile = File(...),
    overwrite_existing: bool = Query(False),
):
    try:
        payload = json.loads((await file.read()).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}")

    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="Imported template file must be a JSON array")

    company_rules_dir = _get_company_rules_dir()
    os.makedirs(company_rules_dir, exist_ok=True)

    imported = 0
    skipped = 0
    for raw_rule in payload:
        if not isinstance(raw_rule, dict):
            skipped += 1
            continue
        incoming_template = _studio_company_rule_to_template(raw_rule)
        company_id = incoming_template["company_id"]
        company_path = os.path.join(company_rules_dir, f"{company_id}.json")
        if overwrite_existing:
            template_to_write = incoming_template
        else:
            template_to_write = merge_template_data(load_template_file(company_path), incoming_template)
        with open(company_path, "w", encoding="utf-8") as handle:
            json.dump(template_to_write, handle, indent=2)
        imported += 1

    return {
        "status": "ok",
        "imported": imported,
        "skipped": skipped,
        "overwrite_existing": overwrite_existing,
    }


@router.get("/rules/{company_id}")
def get_company_rules(company_id: str):
    base_dir = _get_learned_base_dir()
    path = os.path.join(base_dir, f"{company_id}.json")
    if not os.path.exists(path):
        return {"error": "Not found"}
    
    with open(path, "r", encoding="utf-8") as f:
        learned = json.load(f)

    company_template = _get_company_template(company_id)
    if company_template:
        learned["studio_rule"] = company_template.get("studio_rule", {})
        learned["sensitive_terms"] = company_template.get("sensitive_terms", learned.get("sensitive_terms", []))
        learned["identifiers"] = company_template.get("identifiers", [])
        learned["description"] = company_template.get("description", "")

    return learned


@router.get("/company-template/{company_id}")
def get_company_template(company_id: str):
    template = _get_company_template(company_id)
    if not template:
        raise HTTPException(status_code=404, detail="Company template not found")

    return {
        "company_id": company_id,
        "display_name": template.get("display_name", company_id),
        "template": template,
        "training_items": _template_to_training_items(company_id, template),
    }


@router.delete("/rules/{company_id}")
def delete_company_rules(company_id: str):
    base_dir = _get_learned_base_dir()
    path = os.path.join(base_dir, f"{company_id}.json")
    if os.path.exists(path):
        os.remove(path)
        return {"status": "ok"}
    return {"error": "Not found"}
