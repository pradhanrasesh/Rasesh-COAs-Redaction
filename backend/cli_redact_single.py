# ------------------------------------------------------------
# backend/cli_redact_single.py
# FIXED: correct imports, template compiler integration,
#        schema alignment, error handling
# ------------------------------------------------------------

import argparse
import os
import json

from backend.template_loader import TemplateLoader
from backend.company_detector import CompanyDetector
from backend.template_compiler import TemplateCompiler
from backend.redaction.auto_redaction_engine import AutoRedactionEngine
from backend.redaction.manual_redaction_engine import ManualRedactionEngine


def main():
    parser = argparse.ArgumentParser(
        description="Redact a single COA PDF using unified templates."
    )
    parser.add_argument("input_pdf", help="Path to input PDF")
    parser.add_argument("output_pdf", help="Path to output redacted PDF")
    parser.add_argument(
        "--company-id",
        help="Force a specific company template (e.g., 'high_north').",
        default=None,
    )

    args = parser.parse_args()

    if not os.path.isfile(args.input_pdf):
        raise FileNotFoundError(f"Input PDF not found: {args.input_pdf}")

    loader = TemplateLoader()
    detector = CompanyDetector()
    auto_engine = AutoRedactionEngine()
    manual_engine = ManualRedactionEngine()

    pdf_bytes = open(args.input_pdf, "rb").read()

    # ------------------------------------------------------------
    # Determine company
    # ------------------------------------------------------------
    if args.company_id:
        company_id = args.company_id
    else:
        detected = detector.detect_company(pdf_bytes)
        if not detected:
            raise RuntimeError("Could not auto-detect company template.")
        company_id = detected.get("company_id")

    template = loader.get_template(company_id)
    if not template:
        raise RuntimeError(f"Template not found for company_id: {company_id}")

    print(f"[cli_redact_single] Using template: {template['display_name']} ({company_id})")

    # ------------------------------------------------------------
    # Compile template rules
    # ------------------------------------------------------------
    try:
        compiled = TemplateCompiler(template).compile()
    except Exception as e:
        raise RuntimeError(f"Template compilation failed: {e}")

    # ------------------------------------------------------------
    # Auto-redaction suggestions
    # ------------------------------------------------------------
    try:
        suggestions = auto_engine.suggest_redactions(
            pdf_bytes=pdf_bytes,
            company_id=company_id,
            use_ocr=False,
            auto_ocr=True,
        )
    except Exception as e:
        raise RuntimeError(f"Auto-redaction failed: {e}")

    # Convert candidates → manual redaction format
    redactions = [
        {
            "page": c.page,
            "type": c.type,
            "rects": c.rects,
            "color": c.color,
            "mode": c.mode,
        }
        for c in suggestions
    ]

    # ------------------------------------------------------------
    # Apply redactions
    # ------------------------------------------------------------
    try:
        manual_engine.apply_redactions(
            pdf_bytes=pdf_bytes,
            redactions=redactions,
            scrub_metadata=True,
            base_filename=args.output_pdf,
        )
    except Exception as e:
        raise RuntimeError(f"Manual redaction failed: {e}")

    print(f"[cli_redact_single] Redacted PDF written to: {args.output_pdf}")


if __name__ == "__main__":
    main()
