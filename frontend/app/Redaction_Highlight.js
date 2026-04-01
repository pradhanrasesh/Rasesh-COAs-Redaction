// ------------------------------------------------------------
// Redaction_Highlight.js — Adobe-style marker highlight tool
// ------------------------------------------------------------

import { selectionMode, redactions, setRedactions } from "./Utils.js";
import { pushUndo } from "./Redaction_Core.js";
import { renderAllPages } from "./PDF_Loader.js";

export function attachHighlightHandlers(view, addListener) {
  const overlay = view.overlay;
  if (!overlay) return;

  let isDrawing = false;
  let startX = 0;
  let startY = 0;

  addListener(overlay, "mousedown", e => {
    if (selectionMode !== "highlight") return;

    isDrawing = true;
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    e.preventDefault();
  });

  addListener(overlay, "mousemove", e => {
    if (!isDrawing || selectionMode !== "highlight") return;

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
    ctx.fillRect(
      Math.min(startX, x),
      Math.min(startY, y),
      Math.abs(x - startX),
      Math.abs(y - startY)
    );
  });

  addListener(document, "mouseup", e => {
    if (!isDrawing || selectionMode !== "highlight") return;
    isDrawing = false;

    const rect = overlay.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const x0 = Math.min(startX, endX) / overlay.width;
    const y0 = Math.min(startY, endY) / overlay.height;
    const x1 = Math.max(startX, endX) / overlay.width;
    const y1 = Math.max(startY, endY) / overlay.height;

    pushUndo();

    const map = structuredClone(redactions);
    if (!map[view.pageNumber]) map[view.pageNumber] = [];

    map[view.pageNumber].push({
      page: view.pageNumber,
      type: "highlight",
      rects: [{ x0, y0, x1, y1 }],
      color: "rgba(255, 255, 0, 0.35)"
    });

    setRedactions(map);
    renderAllPages();
  });
}
