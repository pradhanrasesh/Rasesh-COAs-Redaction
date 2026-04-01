// ------------------------------------------------------------
// AnnotationEngine.js — Safe annotation engine
// FIXED: No overlay drawing; unified with Redaction_Core overlays
// ------------------------------------------------------------

import {
  redactions,
  setRedactions,
  setStatus,
  pageViews
} from "./Utils.js";

import { pushUndo } from "./Redaction_Core.js";

// ------------------------------------------------------------
// Supported tools
// ------------------------------------------------------------
export const AnnotationTool = {
  NONE: "none",
  //BOX: "box",
  INK: "ink",
  HIGHLIGHT: "highlight",
  POLYGON: "polygon"
};

let currentTool = AnnotationTool.NONE;
let activeStroke = null;
let activeView = null;

// ------------------------------------------------------------
// Set current tool
// ------------------------------------------------------------
export function setAnnotationTool(tool) {
  currentTool = tool;
  // Only update status bar for annotation tools (ink, highlight, polygon)
  if (tool !== AnnotationTool.NONE) {
      setStatus(`Tool: ${tool}`);
  }
}

// ------------------------------------------------------------
// drawAnnotationsForPage()
// FIXED: This function no longer draws anything.
// All drawing is handled by PDF_Loader.js overlay pipeline.
// ------------------------------------------------------------
export function drawAnnotationsForPage(pageNumber) {
  // Intentionally empty — drawing is now unified in PDF_Loader.js
  return;
}

// ------------------------------------------------------------
// attachAnnotationHandlers()
// FIXED: Capture strokes only; do NOT draw on overlay
// ------------------------------------------------------------
export function attachAnnotationHandlers(overlayCanvas, view) {
  if (!overlayCanvas || !view) return;

  overlayCanvas.addEventListener("mousedown", e => {
    if (currentTool === AnnotationTool.NONE) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    activeView = view;

    activeStroke = {
      tool: currentTool,
      page: view.pageNumber,
      points: [{ x, y }]
    };

    e.preventDefault();
    e.stopPropagation();
  });

  overlayCanvas.addEventListener("mousemove", e => {
    if (!activeStroke) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    activeStroke.points.push({ x, y });

    e.preventDefault();
    e.stopPropagation();
  });

  overlayCanvas.addEventListener("mouseup", () => {
    if (!activeStroke || !activeView) return;

    const { viewport } = activeView;
    const page = activeView.pageNumber;

    // ------------------------------------------------------------
    // Convert stroke → normalized rect
    // ------------------------------------------------------------
    const xs = activeStroke.points.map(p => p.x);
    const ys = activeStroke.points.map(p => p.y);

    const x0 = Math.min(...xs) / viewport.width;
    const y0 = Math.min(...ys) / viewport.height;
    const x1 = Math.max(...xs) / viewport.width;
    const y1 = Math.max(...ys) / viewport.height;

    const rect = { x0, y0, x1, y1 };

    // ------------------------------------------------------------
    // Save annotation as a redaction entry
    // ------------------------------------------------------------
    pushUndo();

    const newMap = structuredClone(redactions);
    if (!newMap[page]) newMap[page] = [];

    newMap[page].push({
      page,
      type: activeStroke.tool,
      rects: [rect],
      color: document.getElementById("redactionColor")?.value || "#000000"
    });

    setRedactions(newMap);

    // Reset
    activeStroke = null;
    activeView = null;

    setStatus(`Added ${currentTool} annotation on page ${page}.`);
  });

  overlayCanvas.addEventListener("mouseleave", () => {
    activeStroke = null;
    activeView = null;
  });
}
