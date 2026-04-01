# backend/rules/build_rule_set.py
import argparse
import json
import os
from .merge_engine import detect_company, merge_rules_for_company

def build_for_document(doc_text_path: str, base_dir: str, company_rules_dir: str, out_path: str):
    with open(doc_text_path, "r", encoding="utf-8") as fh:
        doc_text = fh.read()

    company = detect_company(doc_text, company_rules_dir)
    merged = merge_rules_for_company(company, base_dir)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(merged.to_jsonable(), fh, indent=2)

    print(f"Saved merged rules to {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc-text", required=True, help="Path to plain text extracted from document")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    parser.add_argument("--base-dir", default=project_root, help="Project base dir")
    parser.add_argument(
        "--company-rules-dir",
        default=os.path.join(project_root, "config", "rules", "company_rules"),
        help="Company rules dir",
    )
    parser.add_argument("--out", default="merged_rules.json")
    args = parser.parse_args()

    build_for_document(args.doc_text, args.base_dir, args.company_rules_dir, args.out)
