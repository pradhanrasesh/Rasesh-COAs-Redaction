// ------------------------------------------------------------
// FileIO.js — Upload, drag/drop, save PDF, export/import redactions
// FIXED: textStore reset, highlightMode default true, safe rect validation
// FIXED: double file picker (one-time init + addListener registry)
// ------------------------------------------------------------

import {
  pdfBytes,
  redactions,
  setPdfDoc,
  setPdfBytes,
  setNumPages,
  setPageViews,
  setRedactions,
  setAutoRedactSuggestions,
  setUndoStack,
  setRedoStack,
  setSearchResults,
  setSearchIndex,
  setHighlightMode,
  setStatus,
  setOriginalPdfBytes
} from "./Utils.js";

import { clearTextStore } from "./TextLayer.js";
import { loadPDF } from "./PDF_Loader.js";
import { downloadBlob, getRedactedFilename } from "./Utils.js";

// ⭐ Import global listener registry from Events.js
import { addListener } from "./Events.js";
import { detectCompanyFromBackend } from "./Template_Detect_Backend.js";
import { loadTemplateForCompany } from "./Template_UI.js";

// ⭐ One-time initialization guard
let fileIOInitialized = false;

function setHomeLandingVisible(visible) {
  const landing = document.getElementById("homeLanding");
  if (!landing) return;

  if (visible) landing.classList.remove("hidden");
  else landing.classList.add("hidden");
}

// ------------------------------------------------------------
// initFileIO() — now guaranteed to run ONCE, AFTER layout is loaded
// ------------------------------------------------------------
export function initFileIO() {
  if (fileIOInitialized) return;
  fileIOInitialized = true;

  // 🔍 Look up DOM elements *now*, after sidebar partial is injected
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileNameLabel = document.getElementById("fileName");
  const uploadSection = document.getElementById("uploadSection");
  const btnRedact = document.getElementById("btnRedact");
  const btnSavePdf = document.getElementById("btnSavePdf");
  const btnClear = document.getElementById("btnClear");

  const btnExportRedactions = document.getElementById("btnExportRedactions");
  const btnImportRedactions = document.getElementById("btnImportRedactions");
  const importRedactionsInput = document.getElementById("importRedactionsInput");

  initUploadHandlers(dropZone, fileInput, fileNameLabel, btnRedact, btnSavePdf);
  initExportImportHandlers(
    btnExportRedactions,
    btnImportRedactions,
    importRedactionsInput
  );
  initClearSession(btnClear, fileNameLabel);
  initSavePdfButton(btnSavePdf, btnRedact, fileNameLabel);

  // Compact upload panel by default to keep Templates visible.
  if (uploadSection) {
    uploadSection.classList.add("upload-compact");
    uploadSection.classList.remove("upload-expanded");
  }
}

// ------------------------------------------------------------
// Upload Handlers (click + drag/drop)
// ------------------------------------------------------------
function initUploadHandlers(dropZone, fileInput, fileNameLabel, btnRedact, btnSavePdf) {
  if (!dropZone || !fileInput) {
    console.warn("[FileIO] dropZone or fileInput not found; upload disabled.");
    return;
  }

  addListener(dropZone, "click", (e) => {
    // Prevent double file picker:
    if (e.target === fileInput || e.target.closest("input[type='file']")) {
      return;
    }

    // Ignore clicks on buttons inside the dropzone
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;

    // Expand upload panel while user is choosing a file.
    const uploadSection = dropZone.closest("#uploadSection");
    uploadSection?.classList.remove("upload-compact");
    uploadSection?.classList.add("upload-expanded");

    fileInput.click();
  });

  addListener(fileInput, "change", async (e) => {
    const file = e.target.files[0];
    if (file) await handleFileUpload(file, fileNameLabel, btnRedact, btnSavePdf);
  });

  addListener(dropZone, "dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  addListener(dropZone, "dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });

  addListener(dropZone, "drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (file) await handleFileUpload(file, fileNameLabel, btnRedact, btnSavePdf);
  });
}

// ------------------------------------------------------------
// handleFileUpload(file)
// ------------------------------------------------------------
async function handleFileUpload(file, fileNameLabel, btnRedact, btnSavePdf) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Please upload a valid PDF file.");
    alert("Please upload a valid PDF file.");
    return;
  }

  if (fileNameLabel) fileNameLabel.textContent = file.name;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    // ⭐ IMPORTANT: make a separate copy for backend use
    const backendBytes = new Uint8Array(bytes);   // clone buffer

    setOriginalPdfBytes(backendBytes);
    console.log("SET originalPdfBytes length:", backendBytes.length);

    // This one can be safely "stolen" by PDF.js worker
    setPdfBytes(bytes);

    clearTextStore();
    setHighlightMode(true);

    await loadPDF(bytes);

    // Hide the landing overlay once we have a PDF loaded.
    setHomeLandingVisible(false);

    // → NEW: attempt auto-detect company after load (non-blocking)
    try {
      const detected = await detectCompanyFromBackend();
      if (detected) {
        await loadTemplateForCompany(detected);
        console.log("Auto-detected company:", detected);
      }
    } catch (err) {
      console.warn("Auto company detection after upload failed:", err);
    }

    if (btnRedact) btnRedact.disabled = false;
    if (btnSavePdf) btnSavePdf.disabled = false;

    // Keep upload compact so Templates remain visible.
    const uploadSection = document.getElementById("uploadSection");
    uploadSection?.classList.add("upload-compact");
    uploadSection?.classList.remove("upload-expanded");

    setStatus("");
  } catch (err) {
    console.error("[FileIO] Error loading PDF:", err);
    setStatus("Error loading PDF");
    alert("Error loading PDF: " + err.message);
  }
}

// ------------------------------------------------------------
// SAFE rect validation
// ------------------------------------------------------------
function validateRect(rect) {
  if (!rect) return { x0: 0, y0: 0, x1: 1, y1: 1 };

  const x0 = Number(rect.x0);
  const y0 = Number(rect.y0);
  const x1 = Number(rect.x1);
  const y1 = Number(rect.y1);

  if ([x0, y0, x1, y1].some((v) => isNaN(v))) {
    return { x0: 0, y0: 0, x1: 1, y1: 1 };
  }

  return {
    x0: Math.min(Math.max(x0, 0), 1),
    y0: Math.min(Math.max(y0, 0), 1),
    x1: Math.min(Math.max(x1, 0), 1),
    y1: Math.min(Math.max(y1, 0), 1)
  };
}

function flattenRedactionsMap(map) {
  const list = [];

  for (const page in map) {
    for (const r of map[page]) {
      const rects = Array.isArray(r.rects)
        ? r.rects.map(validateRect)
        : [validateRect(r.rect)];

      list.push({
        page: Number(page),
        type: r.type || "box",
        rects,
        color: r.color || "#000000"
      });
    }
  }

  return list;
}

export async function applyManualRedactionsAndDownload(fileNameLabel) {
  if (!pdfBytes) {
    setStatus("Upload a PDF first.");
    alert("Please upload a PDF first.");
    return;
  }

  const flatList = flattenRedactionsMap(redactions);
  if (flatList.length === 0) {
    setStatus("No redactions to apply.");
    alert("No redactions to apply.");
    return;
  }

  setStatus("Applying manual redactions...");

  const form = new FormData();
  form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "file.pdf");
  form.append("redactions", JSON.stringify(flatList));
  form.append("scrub_metadata", "true");

  try {
    const res = await fetch("/api/redact/manual", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Backend error:", errorText);
      setStatus(`Manual redaction failed: ${res.status}`);
      alert(`Redaction failed: ${res.status}`);
      return;
    }

    const blob = await res.blob();
    downloadBlob(blob, getRedactedFilename(fileNameLabel?.textContent || "document.pdf"));
    setStatus("Manual redaction complete.");
  } catch (err) {
    console.error(err);
    setStatus("Manual redaction failed (backend not reachable).");
    alert("Backend not reachable. Is the server running on port 8000?");
  }
}

function initSavePdfButton(btnSavePdf, btnRedact, fileNameLabel) {
  if (btnSavePdf) {
    addListener(btnSavePdf, "click", async () => {
      await applyManualRedactionsAndDownload(fileNameLabel);
    });
  }

  if (btnRedact) {
    addListener(btnRedact, "click", async () => {
      await applyManualRedactionsAndDownload(fileNameLabel);
    });
  }
}

function initExportImportHandlers(btnExportRedactions, btnImportRedactions, importRedactionsInput) {
  addListener(btnExportRedactions, "click", () => {
    const blob = new Blob([JSON.stringify(redactions, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "redactions.json");
    setStatus("Redactions exported.");
  });

  addListener(btnImportRedactions, "click", () => {
    importRedactionsInput?.click();
  });

  addListener(importRedactionsInput, "change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      let map = {};

      if (Array.isArray(imported)) {
        for (const r of imported) {
          const page = r.page;
          if (!map[page]) map[page] = [];
          map[page].push(r);
        }
      } else if (typeof imported === "object") {
        map = imported;
      } else {
        setStatus("Invalid redactions file.");
        return;
      }

      setRedactions(map);

      const { renderAllPages } = await import("./PDF_Loader.js");
      await renderAllPages();

      setStatus("Redactions imported.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to import redactions.");
    }
  });
}

function initClearSession(btnClear, fileNameLabel) {
  addListener(btnClear, "click", () => {
    // Show the landing overlay again for a fresh start.
    setHomeLandingVisible(true);

    setPdfDoc(null);
    setOriginalPdfBytes(null);
    setNumPages(0);
    setPageViews([]);

    setRedactions({});
    setAutoRedactSuggestions([]);
    setUndoStack([]);
    setRedoStack([]);
    setSearchResults([]);
    setSearchIndex(0);

    clearTextStore();
    setHighlightMode(true);

    if (fileNameLabel) fileNameLabel.textContent = "";
    const uploadSection = document.getElementById("uploadSection");
    uploadSection?.classList.add("upload-compact");
    uploadSection?.classList.remove("upload-expanded");
    const pdfContainer = document.getElementById("pdfPagesColumn");
    if (pdfContainer) pdfContainer.innerHTML = "";

    setStatus("Session cleared.");
  });
}
