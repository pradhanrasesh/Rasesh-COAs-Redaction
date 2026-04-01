from .base import ToolPlugin
from pdf2image import convert_from_path
import tempfile
import os

class PDFToImagesPlugin(ToolPlugin):
    id = "pdf_to_images"
    name = "PDF -> Images"
    category = "convert"

    def run(self, input_path, options):
        pages = convert_from_path(input_path, dpi=200)
        out_dir = tempfile.mkdtemp()

        for i, p in enumerate(pages):
            p.save(os.path.join(out_dir, f"page_{i+1}.png"))

        return out_dir
