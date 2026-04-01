from .base import ToolPlugin
import subprocess
import tempfile
import os
import shutil

class CompressPlugin(ToolPlugin):
    id = "compress"
    name = "Compress PDF"
    category = "optimize"

    def run(self, input_path, options):
        # If Ghostscript isn't installed, keep the app functional by returning the input.
        out = input_path.replace(".pdf", "_compressed.pdf")

        def _find_gs_cmd():
            # Prefer PATH
            for c in ("gs", "gswin64c"):
                found = shutil.which(c)
                if found:
                    return found

            # Allow explicit override
            for env_key in ("GS_CMD", "GHOSTSCRIPT_CMD"):
                env_val = os.environ.get(env_key)
                if env_val and os.path.isfile(env_val):
                    return env_val

            # Try common installation layouts: C:\\Program Files\\gs\\<version>\\bin\\gswin64c.exe
            candidates = [
                r"C:\Program Files\gs",
                r"C:\Program Files (x86)\gs",
            ]
            for base_dir in candidates:
                if not os.path.isdir(base_dir):
                    continue
                try:
                    for sub in os.listdir(base_dir):
                        bin_dir = os.path.join(base_dir, sub, "bin")
                        exe = os.path.join(bin_dir, "gswin64c.exe")
                        if os.path.isfile(exe):
                            return exe
                except Exception:
                    continue

            return None

        gs_cmd = _find_gs_cmd()
        if not gs_cmd:
            # No Ghostscript: no compression possible.
            return input_path

        # Ghostscript compression
        try:
            subprocess.run(
                [
                    gs_cmd,
                    "-sDEVICE=pdfwrite",
                    "-dCompatibilityLevel=1.4",
                    "-dPDFSETTINGS=/ebook",
                    "-dNOPAUSE",
                    "-dQUIET",
                    "-dBATCH",
                    f"-sOutputFile={out}",
                    input_path,
                ],
                check=False,
            )
        except Exception:
            # If compression fails for any reason, keep the original.
            return input_path

        # If gs didn't produce the file, also keep original.
        if not os.path.isfile(out):
            return input_path

        return out
