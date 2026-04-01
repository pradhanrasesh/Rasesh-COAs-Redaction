// ------------------------------------------------------------
// Utils.js — Centralized global state manager
// ------------------------------------------------------------

// ------------------------------------------------------------
// PDF + Rendering State
// ------------------------------------------------------------
export let pdfDoc = null;
export let pdfBytes = null;
export let numPages = 0;
export let pageViews = [];

export function setPdfDoc(v) { pdfDoc = v; }
export function setPdfBytes(v) { pdfBytes = v; }
export function setNumPages(v) { numPages = v; }
export function setPageViews(v) { pageViews = v; }

// ------------------------------------------------------------
// Zoom + Pan
// ------------------------------------------------------------
export let zoom = 1.0;
export let panMode = false;
export let currentPageVisible = 1;

export function setZoom(v) { zoom = v; }
export function setPanMode(v) { panMode = v; }
export function setCurrentPageVisible(v) { currentPageVisible = v; }

// ------------------------------------------------------------
// Redactions (per page)
// ------------------------------------------------------------
export let redactions = {}; // { pageNumber: [ { page, type, rects, color } ] }

export function setRedactions(v) { redactions = v; }

// Undo/Redo
export let undoStack = [];
export let redoStack = [];

export function setUndoStack(v) { undoStack = v; }
export function setRedoStack(v) { redoStack = v; }

// ------------------------------------------------------------
// Auto-Redaction Suggestions
// ------------------------------------------------------------
export let autoRedactSuggestions = []; // [ { id, page, rects, selected, color } ]
export let hoveredSuggestionId = null;

export function setAutoRedactSuggestions(v) { autoRedactSuggestions = v; }
export function setHoveredSuggestionId(v) { hoveredSuggestionId = v; }

// ------------------------------------------------------------
// Search State
// ------------------------------------------------------------
export let searchResults = []; // [ { page, rects } ]
export let searchIndex = 0;
export let highlightMode = true;

export function setSearchResults(v) { searchResults = v; }
export function setSearchIndex(v) { searchIndex = v; }
export function setHighlightMode(v) { highlightMode = v; }

// ------------------------------------------------------------
// Review Mode
// ------------------------------------------------------------
export let reviewMode = false;
export let showOnlyAuto = false;

export function setReviewMode(v) { reviewMode = v; }
export function setShowOnlyAuto(v) { showOnlyAuto = v; }

// ------------------------------------------------------------
// Selection Mode (text vs box)
// ------------------------------------------------------------
export let selectionMode = "box"; // default matches UI

export function setSelectionMode(v) {
  selectionMode = v;
}

// ------------------------------------------------------------
// Status Bar + Toast
// ------------------------------------------------------------
export function setStatus(msg) {
  const el = document.getElementById("statusBar") || document.getElementById("statusText");
  if (el) el.textContent = msg;
  console.log("[Status]", msg);
}

export function showToast(msg, timeout = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.log("[Toast]", msg);
    return;
  }

  const div = document.createElement("div");
  div.className = "toast";
  div.style.pointerEvents = "auto";

  const text = document.createElement("span");
  text.textContent = msg;

  const close = document.createElement("button");
  close.className = "toast-close";
  close.setAttribute("type", "button");
  close.setAttribute("aria-label", "Close toast");
  close.textContent = "×";

  close.addEventListener("click", () => {
    div.style.transition = "opacity 200ms ease";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 220);
  });

  div.appendChild(text);
  div.appendChild(close);

  container.appendChild(div);

  setTimeout(() => div.remove(), timeout);
}

export function setCurrentCompany(id, name) {
  const select = document.getElementById("companySelect");
  if (select) {
    // Ensure option exists
    let opt = Array.from(select.options).find(o => o.value === id);
    if (!opt && id) {
      opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name || id;
      select.appendChild(opt);
    }
    select.value = id || "";
  }

  const status = document.getElementById("statusText");
  if (status) {
    status.textContent = name ? `Detected company: ${name}` : "No company detected";
  }
}

// ------------------------------------------------------------
// Utility: Normalize rectangle
// ------------------------------------------------------------
export function normalizeRect(x0, y0, x1, y1, width, height) {
  return {
    x0: Math.min(x0, x1) / width,
    y0: Math.min(y0, y1) / height,
    x1: Math.max(x0, x1) / width,
    y1: Math.max(y0, y1) / height
  };
}

// ------------------------------------------------------------
// Utility: Download blob
// ------------------------------------------------------------
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// Utility: Generate redacted filename
// ------------------------------------------------------------
export function getRedactedFilename(original) {
  // Filename rules (Adobe Acrobat style):
  // Uses `coaSettings.outputPattern` from Settings page.
  // Tokens supported:
  //   {name}   -> original filename without extension
  //   {date}   -> YYYY-MM-DD
  //   {time}   -> HH-MM
  //   {redacted} -> `_redacted`
  //   {rejected} -> `_rejected`
  if (!original) return "document_redacted.pdf";

  let clean = String(original);
  // Remove any path prefix.
  clean = clean.split("\\").pop();
  clean = clean.split("/").pop();

  const dot = clean.lastIndexOf(".");
  const ext = dot === -1 ? ".pdf" : clean.slice(dot).toLowerCase();
  const name = dot === -1 ? clean : clean.slice(0, dot);

  let pattern = "{name}_redacted.pdf";
  try {
    const raw = localStorage.getItem("coaSettings") || "{}";
    const settings = JSON.parse(raw);
    pattern = settings.outputPattern || pattern;
  } catch {
    // keep default
  }

  const now = new Date();
  const pad2 = n => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}-${pad2(now.getMinutes())}`;

  const redactedToken = "_redacted";
  const rejectedToken = "_rejected";

  let out = String(pattern);
  out = out.replaceAll("{name}", name);
  out = out.replaceAll("{date}", dateStr);
  out = out.replaceAll("{time}", timeStr);
  out = out.replaceAll("{redacted}", redactedToken);
  out = out.replaceAll("{rejected}", rejectedToken);

  // Ensure it ends with a .pdf extension.
  if (!out.toLowerCase().endsWith(".pdf")) {
    // If pattern already includes another extension, keep the original ext.
    out += ext === ".pdf" ? ".pdf" : ext;
  }

  return out;
}

export let originalPdfBytes = null;
export function setOriginalPdfBytes(bytes) {
  originalPdfBytes = bytes;
  console.log(
    "[Utils] setOriginalPdfBytes called:",
    "len =", bytes?.length,
    "instance id =", window.__UTILS_DEBUG_ID
  );
}

// ------------------------------------------------------------
// Debug Helper
// ------------------------------------------------------------
export function debugState() {
  console.log("PDF:", { pdfDoc, numPages });
  console.log("Zoom:", zoom);
  console.log("Redactions:", redactions);
  console.log("Auto Suggestions:", autoRedactSuggestions);
  console.log("Search:", { searchResults, searchIndex });
  console.log("Review Mode:", { reviewMode, showOnlyAuto });
}

// ------------------------------------------------------------
// DEBUG FINGERPRINT
// ------------------------------------------------------------
if (!window.__UTILS_DEBUG_ID) {
  window.__UTILS_DEBUG_ID = Math.random().toString(36).slice(2);
  console.log("[Utils] NEW INSTANCE, id =", window.__UTILS_DEBUG_ID);
} else {
  console.log("[Utils] REUSED INSTANCE, id =", window.__UTILS_DEBUG_ID);
}
