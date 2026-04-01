# ------------------------------------------------------------
# backend/cli_batch_redact.py
# FIXED: imports, parallelism, template integration, retry logic
# ------------------------------------------------------------

import sys
import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.template_loader import TemplateLoader
from backend.company_detector import CompanyDetector
from backend.template_compiler import TemplateCompiler
from backend.redaction.auto_redaction_engine import AutoRedactionEngine
from backend.redaction.manual_redaction_engine import ManualRedactionEngine


def process_file(
    input_path: str,
    output_folder: str,
    loader: TemplateLoader,
    detector: CompanyDetector,
    auto_engine: AutoRedactionEngine,
    manual_engine: ManualRedactionEngine,
    max_retries: int = 2,
):
    filename = os.path.basename(input_path)
    print(f"\nProcessing: {filename}")

    attempts = 0
    while attempts <= max_retries:
        attempts += 1
        try:
            with open(input_path, "rb") as f:
                pdf_bytes = f.read()

            # Detect company
            detected = detector.detect_company(pdf_bytes)
            if not detected:
                print("  ERROR: No matching company template found. Skipping.")
                return False

            company_id = detected.get("company_id")
            template = loader.get_template(company_id)
            if not template:
                print(f"  ERROR: Template not found for company_id={company_id}. Skipping.")
                return False

            print(f"  Detected company: {template['display_name']} ({company_id})")

            # Compile template (ensures rules/zones are valid)
            try:
                TemplateCompiler(template).compile()
            except Exception as e:
                print(f"  ERROR: Template compilation failed: {e}")
                return False

            # Auto-redaction suggestions
            suggestions = auto_engine.suggest_redactions(
                pdf_bytes=pdf_bytes,
                company_id=company_id,
                use_ocr=False,
                auto_ocr=True,
            )

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

            output_path = os.path.join(
                output_folder,
                filename.replace(".pdf", "_Redacted.pdf"),
            )

            manual_engine.apply_redactions(
                pdf_bytes=pdf_bytes,
                redactions=redactions,
                scrub_metadata=True,
                base_filename=output_path,
            )

            print(f"  Saved: {output_path}")
            return True

        except Exception as e:
            print(f"  ERROR processing file (attempt {attempts}/{max_retries + 1}): {e}")
            if attempts > max_retries:
                return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python -m backend.cli_batch_redact <input_folder> <output_folder>")
        return

    input_folder = sys.argv[1]
    output_folder = sys.argv[2]

    if not os.path.isdir(input_folder):
        print(f"ERROR: Input folder not found: {input_folder}")
        return

    os.makedirs(output_folder, exist_ok=True)

    print("\n=== COA Batch Redaction Tool (Template‑Driven) ===\n")
    print(f"Input folder:  {input_folder}")
    print(f"Output folder: {output_folder}\n")

    loader = TemplateLoader()
    detector = CompanyDetector()
    auto_engine = AutoRedactionEngine()
    manual_engine = ManualRedactionEngine()

    pdf_files = [
        os.path.join(input_folder, f)
        for f in os.listdir(input_folder)
        if f.lower().endswith(".pdf")
    ]

    total = len(pdf_files)
    success = 0
    failed = 0

    # Parallel processing
    with ThreadPoolExecutor() as executor:
        futures = {
            executor.submit(
                process_file,
                path,
                output_folder,
                loader,
                detector,
                auto_engine,
                manual_engine,
            ): path
            for path in pdf_files
        }

        for future in as_completed(futures):
            ok = future.result()
            if ok:
                success += 1
            else:
                failed += 1

    print("\n=== Batch Redaction Summary ===")
    print(f"Total PDFs:   {total}")
    print(f"Success:      {success}")
    print(f"Failed:       {failed}")
    print("\n")


if __name__ == "__main__":
    main()
