// ------------------------------------------------------------
// Zoom_Pan.js — Correct zoom + pan with overlay redraw
// ------------------------------------------------------------

import {
  zoom,
  panMode,
  pageViews,
  numPages,
  currentPageVisible,
  setZoom,
  setPanMode,
  setCurrentPageVisible
} from "./Utils.js";

import { renderAllPages } from "./PDF_Loader.js";
import { drawRedactionsOnView } from "./Redaction_Core.js";
import { drawSearchHighlightsOnView } from "./Search.js";
import { drawAutoRedactPreviewOnView } from "./Redaction_Auto.js";

// DOM
const btnZoomIn = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnPanMode = document.getElementById("btnPanMode");
const zoomInfo = document.getElementById("zoomInfo");
const pageInfo = document.getElementById("pageInfo");
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");
const pageJumpInput = document.getElementById("pageJumpInput");
const pageTotalText = document.getElementById("pageTotalText");
const pdfScrollContainer = document.querySelector(".pdf-scroll-container");

// Zoom limits
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 1.1;

// ------------------------------------------------------------
// initZoomControls()
// ------------------------------------------------------------
export function initZoomControls() {
  btnZoomIn?.addEventListener("click", () => applyZoom(ZOOM_STEP));
  btnZoomOut?.addEventListener("click", () => applyZoom(1 / ZOOM_STEP));

  btnPanMode?.addEventListener("click", () => {
    const newPan = !panMode;
    setPanMode(newPan);
    btnPanMode.classList.toggle("btn-toggle-active", newPan);
    if (pdfScrollContainer) {
      pdfScrollContainer.style.cursor = newPan ? "grab" : "default";
    }
  });

  if (pdfScrollContainer) {
    initPanHandlers();
    initScrollTracking();
  }

  // Page navigation (prev/next + jump)
  btnPrevPage?.addEventListener("click", () => scrollToPage((currentPageVisible || 1) - 1));
  btnNextPage?.addEventListener("click", () => scrollToPage((currentPageVisible || 1) + 1));

  if (pageJumpInput) {
    pageJumpInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const v = parseInt(pageJumpInput.value, 10);
        if (!Number.isFinite(v)) return;
        scrollToPage(v);
      }
    });

    pageJumpInput.addEventListener("blur", () => {
      const v = parseInt(pageJumpInput.value, 10);
      if (!Number.isFinite(v)) return;
      scrollToPage(v);
    });
  }

  // Keyboard: Ctrl + Arrow navigation
  window.addEventListener("keydown", e => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = (document.activeElement?.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollToPage((currentPageVisible || 1) - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollToPage((currentPageVisible || 1) + 1);
    }
  });

  // Resize: re-render + redraw overlays so coordinates stay aligned
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      try {
        await renderAllPages();
        redrawAllOverlays();
      } catch {
        // ignore
      }
    }, 250);
  });

  // When a PDF finishes loading, update the page indicator total.
  document.addEventListener("pdf-loaded", () => {
    if (pageTotalText) pageTotalText.textContent = `/ ${numPages || 0}`;
    if (pageJumpInput && numPages > 0) {
      const v = Math.max(1, Math.min(numPages, currentPageVisible || 1));
      pageJumpInput.value = String(v);
    }
  });
}

// ------------------------------------------------------------
// applyZoom()
// ------------------------------------------------------------
async function applyZoom(multiplier) {
  const oldZoom = zoom;
  let newZoom = oldZoom * multiplier;

  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  setZoom(newZoom);

  if (zoomInfo) {
    zoomInfo.textContent = `${Math.round(newZoom * 100)}%`;
  }

  if (!pdfScrollContainer) {
    await renderAllPages();
    redrawAllOverlays();
    return;
  }

  // Preserve scroll center
  const rect = pdfScrollContainer.getBoundingClientRect();
  const centerY = pdfScrollContainer.scrollTop + rect.height / 2;
  const scaleFactor = newZoom / oldZoom;
  const newScrollTop = centerY * scaleFactor - rect.height / 2;

  // Re-render PDF pages at new scale
  await renderAllPages();

  // Re-draw overlays at new scale
  redrawAllOverlays();

  pdfScrollContainer.scrollTop = newScrollTop;
}

// ------------------------------------------------------------
// Redraw overlays after zoom
// ------------------------------------------------------------
function redrawAllOverlays() {
  for (const view of pageViews) {
    if (!view.overlay) continue;
    const ctx = view.overlay.getContext("2d");
    if (!ctx) continue;

    ctx.clearRect(0, 0, view.overlay.width, view.overlay.height);

    drawRedactionsOnView(view);
    drawSearchHighlightsOnView(view);
    drawAutoRedactPreviewOnView(view);
  }
}

function scrollToPage(pageNumber) {
  if (!pdfScrollContainer) return;
  if (!pageViews?.length) return;
  const total = numPages || 0;
  if (total <= 0) return;

  const target = Math.max(1, Math.min(total, pageNumber));
  const view = pageViews.find(v => v.pageNumber === target);
  if (!view || !view.wrapper) return;

  // Offset a little so header area doesn't hide the top of the page.
  const top = Math.max(0, view.wrapper.offsetTop - 80);
  pdfScrollContainer.scrollTo({ top, behavior: "smooth" });

  setCurrentPageVisible(target);
  if (pageJumpInput) pageJumpInput.value = String(target);
}

// ------------------------------------------------------------
// Pan Mode
// ------------------------------------------------------------
function initPanHandlers() {
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let scrollStartX = 0;
  let scrollStartY = 0;

  pdfScrollContainer.addEventListener("mousedown", e => {
    if (!panMode) return;

    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollStartX = pdfScrollContainer.scrollLeft;
    scrollStartY = pdfScrollContainer.scrollTop;

    pdfScrollContainer.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!isPanning) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    pdfScrollContainer.scrollLeft = scrollStartX - dx;
    pdfScrollContainer.scrollTop = scrollStartY - dy;
  });

  document.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      pdfScrollContainer.style.cursor = panMode ? "grab" : "default";
    }
  });
}

// ------------------------------------------------------------
// Scroll tracking — updates currentPageVisible + pageInfo
// ------------------------------------------------------------
function initScrollTracking() {
  pdfScrollContainer.addEventListener("scroll", () => {
    let bestPage = 1;
    let bestOffset = Infinity;

    for (const view of pageViews) {
      if (!view.wrapper) continue;
      const rect = view.wrapper.getBoundingClientRect();
      const containerRect = pdfScrollContainer.getBoundingClientRect();

      const offset = Math.abs(rect.top - containerRect.top - 50);

      if (offset < bestOffset) {
        bestOffset = offset;
        bestPage = view.pageNumber;
      }
    }

    setCurrentPageVisible(bestPage);

    if (pageJumpInput) pageJumpInput.value = String(bestPage);
    if (pageTotalText) {
      if (numPages > 0) pageTotalText.textContent = `/ ${numPages}`;
      else pageTotalText.textContent = `/ 0`;
    }
  });
}
