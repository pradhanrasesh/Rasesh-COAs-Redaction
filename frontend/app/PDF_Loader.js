// ------------------------------------------------------------
// PDF_Loader.js — Safe PDF rendering with text + box redaction support
// ------------------------------------------------------------

// IMPORTANT: pdf-init sets the workerSrc safely.
// DO NOT set workerSrc here.
const pdfjsLib = window.pdfjsLib;

import {
  setPdfDoc,
  setPdfBytes,
  setNumPages,
  pageViews,
  setPageViews,
  zoom,
  highlightMode
} from "./Utils.js";

import { drawRedactionsOnView } from "./Redaction_Core.js";
import { drawSearchHighlightsOnView } from "./Search.js";
import { drawAutoRedactPreviewOnView } from "./Redaction_Auto.js";
import { attachAnnotationHandlers } from "./AnnotationEngine.js";
import { buildTextLayer, clearTextStore } from "./TextLayer.js";

// ⭐ OCR fallback
import { runOCRFallback } from "./OCR_Fallback.js";

// ------------------------------------------------------------
// loadPDF(pdfBytes)
// ------------------------------------------------------------
export async function loadPDF(pdfBytes) {
  setPdfBytes(pdfBytes);

  // Reset text store
  clearTextStore();

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;

  window.__PDF_DOC = pdf;
  setPdfDoc(pdf);
  setNumPages(pdf.numPages);

  // Render normally first
  await renderAllPages();

  // ⭐ Run OCR fallback if PDF.js extracted no text
  await runOCRFallback();

  document.dispatchEvent(new CustomEvent("pdf-loaded"));
}

// ------------------------------------------------------------
// createPageView(page, viewport, pageNum)
// ------------------------------------------------------------
function createPageView(page, viewport, pageNum) {
  const container = document.getElementById("pdfPagesColumn");

  const wrapper = document.createElement("div");
  wrapper.className = "page-container";
  wrapper.dataset.pageNumber = pageNum;

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "text-layer";

  const overlay = document.createElement("canvas");
  overlay.className = "overlay-canvas";

  // ⭐ Shim to give wrapper real size
  const sizeShim = document.createElement("div");
  sizeShim.className = "page-size-shim";
  wrapper.appendChild(sizeShim);

  wrapper.appendChild(canvas);
  wrapper.appendChild(textLayerDiv);
  wrapper.appendChild(overlay);
  container.appendChild(wrapper);

  // Size the drawing surfaces
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  overlay.width = viewport.width;
  overlay.height = viewport.height;
  // Attach annotation handlers (INK / HIGHLIGHT / POLYGON only)
  attachAnnotationHandlers(overlay, {
    pageNumber: pageNum,
    viewport,
    overlay
  });


  return {
    pageNumber: pageNum,
    page,
    canvas,
    textLayerDiv,
    overlay,
    overlayCanvas: overlay,
    wrapper,
    viewport
  };
}

// ------------------------------------------------------------
// renderPageView(view)
// ------------------------------------------------------------
export async function renderPageView(view) {
  const pdf = window.__PDF_DOC;
  if (!pdf) return;

  const page = await pdf.getPage(view.pageNumber);

  const currentZoom = zoom || 1.25;
  const viewport = page.getViewport({ scale: currentZoom });
  view.viewport = viewport;

  // Resize layers
  view.canvas.width = viewport.width;
  view.canvas.height = viewport.height;

  // ⭐ Keep wrapper size in sync with viewport
  view.wrapper.style.width = viewport.width + "px";
  view.wrapper.style.height = viewport.height + "px";

  view.overlay.width = viewport.width;
  view.overlay.height = viewport.height;

  view.textLayerDiv.style.width = viewport.width + "px";
  view.textLayerDiv.style.height = viewport.height + "px";

  // Render PDF page
  const ctx = view.canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Build text layer (PDF.js text)
  await buildTextLayer(view, viewport);

  // Draw overlays
  drawRedactionsOnView(view);
  if (highlightMode) drawSearchHighlightsOnView(view);
  drawAutoRedactPreviewOnView(view);
}

// ------------------------------------------------------------
// renderAllPages()
// ------------------------------------------------------------
export async function renderAllPages() {
  const pdf = window.__PDF_DOC;
  if (!pdf) return;

  const container = document.getElementById("pdfPagesColumn");
  container.innerHTML = "";

  // Reset text store for full re-render
  clearTextStore();

  const views = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const currentZoom = zoom || 1.25;
    const viewport = page.getViewport({ scale: currentZoom });

    const view = createPageView(page, viewport, pageNum);

    await renderPageView(view);

    views.push(view);
  }

  setPageViews(views);

  document.dispatchEvent(new CustomEvent("pages-rendered"));
}
