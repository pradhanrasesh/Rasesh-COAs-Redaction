// ------------------------------------------------------------
// pdf-init.js — Local PDF.js initialization (version-matched)
// ------------------------------------------------------------

// Load the local PDF.js library (same version as worker)
import * as pdfjsLib from "/pdfjs/pdf.mjs";

// IMPORTANT:
// Worker must be absolute path from site root
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";

// Expose globally so all modules use the same instance
window.pdfjsLib = pdfjsLib;

console.log("[pdf-init] Local PDF.js initialized with worker:", pdfjsLib.GlobalWorkerOptions.workerSrc);
