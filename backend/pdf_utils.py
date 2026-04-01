import fitz
import pikepdf
import os
import re
from typing import List, Optional, Union

class PDFUtils:
    @staticmethod
    def parse_page_range(range_str: str, total_pages: int) -> List[int]:
        """
        Parse a page range string like "1-10, 14, 25-" into a list of zero-based page indices.
        Supports:
          - single numbers: "5"
          - ranges: "1-10"
          - open-ended: "25-" (from 25 to end)
          - negative numbers: "-5" (last 5 pages)
          - "all": all pages
        """
        range_str = range_str.strip().lower()
        if not range_str or range_str == "all":
            return list(range(total_pages))  # all pages
        pages = set()
        parts = [p.strip() for p in range_str.split(',')]
        for part in parts:
            if '-' in part:
                start, end = part.split('-', 1)
                start = start.strip()
                end = end.strip()
                if start == '':
                    start = 1
                else:
                    start = int(start)
                if end == '':
                    end = total_pages
                else:
                    end = int(end)
                if start < 1:
                    start = 1
                if end > total_pages:
                    end = total_pages
                pages.update(range(start - 1, end))
            else:
                try:
                    page = int(part)
                    if 1 <= page <= total_pages:
                        pages.add(page - 1)
                except ValueError:
                    pass
        return sorted(pages)

    @staticmethod
    def merge_pdfs(input_paths: List[str], output_path: str, page_ranges: Optional[List[str]] = None):
        """Merge multiple PDFs into one, optionally selecting page ranges per PDF."""
        with fitz.open() as result:
            for idx, path in enumerate(input_paths):
                with fitz.open(path) as m_pdf:
                    if page_ranges and idx < len(page_ranges):
                        range_str = page_ranges[idx]
                        if range_str:
                            page_indices = PDFUtils.parse_page_range(range_str, len(m_pdf))
                            # Insert selected pages
                            for page_idx in page_indices:
                                result.insert_pdf(m_pdf, from_page=page_idx, to_page=page_idx)
                        else:
                            result.insert_pdf(m_pdf)
                    else:
                        result.insert_pdf(m_pdf)
            result.save(output_path)
        return output_path

    @staticmethod
    def mix_pdfs(input_paths: List[str], output_path: str, reverse_order: bool = False):
        """
        Mix PDFs by taking pages alternately from each input file.
        If reverse_order is True, take pages in reverse order (last page first).
        """
        with fitz.open() as result:
            # Open all PDFs
            pdfs = [fitz.open(path) for path in input_paths]
            max_pages = max(len(pdf) for pdf in pdfs) if pdfs else 0
            
            for page_idx in range(max_pages):
                for pdf_idx, pdf in enumerate(pdfs):
                    if page_idx < len(pdf):
                        # Determine which page to take based on reverse_order
                        src_page_idx = len(pdf) - 1 - page_idx if reverse_order else page_idx
                        result.insert_pdf(pdf, from_page=src_page_idx, to_page=src_page_idx)
            # Close all PDFs
            for pdf in pdfs:
                pdf.close()
            result.save(output_path)
        return output_path

    @staticmethod
    def split_pdf(input_path: str, output_dir: str):
        """Split a PDF into individual pages."""
        os.makedirs(output_dir, exist_ok=True)
        paths = []
        with fitz.open(input_path) as src:
            for i in range(len(src)):
                out_path = os.path.join(output_dir, f"page_{i+1}.pdf")
                with fitz.open() as new_pdf:
                    new_pdf.insert_pdf(src, from_page=i, to_page=i)
                    new_pdf.save(out_path)
                paths.append(out_path)
        return paths

    @staticmethod
    def rotate_pdf(input_path: str, output_path: str, degrees: int = 90):
        """Rotate all pages in a PDF."""
        with fitz.open(input_path) as src:
            for page in src:
                page.set_rotation(page.rotation + degrees)
            src.save(output_path)
        return output_path

    @staticmethod
    def add_password(input_path: str, output_path: str, password: str):
        """Add password protection to a PDF."""
        with pikepdf.open(input_path) as pdf:
            pdf.save(output_path, encryption=pikepdf.Encryption(owner=password, user=password))
        return output_path

    @staticmethod
    def remove_password(input_path: str, output_path: str, password: str):
        """Remove password protection from a PDF."""
        with pikepdf.open(input_path, password=password) as pdf:
            pdf.save(output_path)
        return output_path

    @staticmethod
    def compress_pdf(input_path: str, output_path: str):
        """Compress a PDF by optimizing its structure."""
        with fitz.open(input_path) as src:
            src.save(output_path, garbage=4, deflate=True, clean=True)
        return output_path

    @staticmethod
    def pdf_to_images(input_path: str, output_dir: str, fmt: str = "png"):
        """Convert each PDF page to an image."""
        os.makedirs(output_dir, exist_ok=True)
        paths = []
        with fitz.open(input_path) as doc:
            for i, page in enumerate(doc):
                pix = page.get_pixmap()
                out_path = os.path.join(output_dir, f"page_{i+1}.{fmt}")
                pix.save(out_path)
                paths.append(out_path)
        return paths

    @staticmethod
    def images_to_pdf(image_paths: List[str], output_path: str):
        """Combine multiple images into a single PDF."""
        from PIL import Image
        with fitz.open() as doc:
            for img_path in image_paths:
                img = Image.open(img_path)
                page = doc.new_page(width=img.width, height=img.height)
                page.insert_image(page.rect, filename=img_path)
            doc.save(output_path)
        return output_path

    @staticmethod
    def update_metadata(input_path: str, output_path: str, metadata: dict):
        """Update PDF metadata (Title, Author, etc.)."""
        with pikepdf.open(input_path) as pdf:
            with pdf.open_metadata() as meta:
                if 'title' in metadata: meta['dc:title'] = metadata.get('title')
                if 'author' in metadata: meta['dc:creator'] = [metadata.get('author')]
            pdf.save(output_path)
        return output_path

    @staticmethod
    def add_watermark(input_path: str, output_path: str, text: str):
        """Add a simple text watermark to all pages."""
        with fitz.open(input_path) as doc:
            for page in doc:
                page.insert_text((50, 50), text, fontsize=60, color=(0.7,0.7,0.7), rotate=45)
            doc.save(output_path)
        return output_path

    @staticmethod
    def add_image_stamp(input_path: str, output_path: str, image_path: str, x: int = 50, y: int = 50, width: int = 100, height: int = 100):
        """Add an image stamp to all pages of a PDF."""
        with fitz.open(input_path) as doc:
            for page in doc:
                rect = fitz.Rect(x, y, x + width, y + height)
                page.insert_image(rect, filename=image_path)
            doc.save(output_path)
        return output_path
