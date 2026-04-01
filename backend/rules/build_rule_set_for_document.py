import argparse
from .merge_engine import detect_company, merge_rules_for_company


def build_rule_set(doc_text: str, base_dir: str):
    company = detect_company(doc_text, f"{base_dir}/config/rules/company_rules")
    merged = merge_rules_for_company(company, base_dir)
    return merged


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc-text", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--base-dir", default="C:/projects/redact-tool-K2")

    args = parser.parse_args()

    with open(args.doc_text, "r", encoding="utf-8") as f:
        text = f.read()

    merged = build_rule_set(text, args.base_dir)

    import json
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(merged.__dict__, f, indent=2)
