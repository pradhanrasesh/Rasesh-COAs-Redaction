from .base import ToolPlugin
import json
import pikepdf

class TrueRedactPlugin(ToolPlugin):
    id = "true_redact"
    name = "True Content Redaction"
    category = "redaction"

    def run(self, input_path, options):
        redactions = options.get("redactions", [])

        pdf = pikepdf.open(input_path)

        for r in redactions:
            page = pdf.pages[r["page"] - 1]
            for rect in r["rects"]:
                x0 = rect["x0"] * float(page.MediaBox[2])
                y0 = rect["y0"] * float(page.MediaBox[3])
                x1 = rect["x1"] * float(page.MediaBox[2])
                y1 = rect["y1"] * float(page.MediaBox[3])

                page.add_redact_annotation((x0, y0, x1, y1))

        pdf.apply_redactions()

        out = input_path.replace(".pdf", "_redacted.pdf")
        pdf.save(out)
        return out
