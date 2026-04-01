// ------------------------------------------------------------
// Review_Mode.js — Professional review workflow
// FIXED: No clearing of overlays; draw in correct order
// ------------------------------------------------------------

import {
  reviewMode,
  showOnlyAuto,
  redactions,
  autoRedactSuggestions,

  setReviewMode,
  setShowOnlyAuto
} from "./Utils.js";

import { renderAllPages } from "./PDF_Loader.js";

// ------------------------------------------------------------
// toggleReviewMode()
// ------------------------------------------------------------
export function toggleReviewMode() {
  const newMode = !reviewMode;
  setReviewMode(newMode);

  const btn = document.getElementById("btnReviewMode");
  if (btn) btn.classList.toggle("btn-toggle-active", newMode);

  renderAllPages();
}

// ------------------------------------------------------------
// toggleShowOnlyAuto()
// ------------------------------------------------------------
export function toggleShowOnlyAuto() {
  const newState = !showOnlyAuto;
  setShowOnlyAuto(newState);

  const btn = document.getElementById("btnShowOnlyAuto");
  if (btn) btn.classList.toggle("btn-toggle-active", newState);

  renderAllPages();
}

// ------------------------------------------------------------
// drawReviewOverlay(view)
// FIXED: Draw on top, never clear underlying layers
// ------------------------------------------------------------
export function drawReviewOverlay(view) {
  if (!reviewMode) return;

  const ctx = view.overlay.getContext("2d");
  ctx.save();

  // Dim entire page slightly
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(0, 0, view.overlay.width, view.overlay.height);

  // If "show only auto" is enabled → visually mute manual redactions
  if (showOnlyAuto) {
    drawAutoOnly(view, ctx);
  }

  ctx.restore();
}

// ------------------------------------------------------------
// drawAutoOnly(view)
// FIXED: Do NOT clear manual redactions — overlay them instead
// ------------------------------------------------------------
function drawAutoOnly(view, ctx) {
  const page = view.pageNumber;

  // ------------------------------------------------------------
  // 1. Dim manual redactions instead of clearing them
  // ------------------------------------------------------------
  const manual = (redactions[page] || []).filter(r => r.type !== "auto");

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)"; // darker dim for manual
  for (const r of manual) {
    for (const rect of r.rects) {
      const x = rect.x0 * view.overlay.width;
      const y = rect.y0 * view.overlay.height;
      const w = (rect.x1 - rect.x0) * view.overlay.width;
      const h = (rect.y1 - rect.y0) * view.overlay.height;

      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.restore();

  // ------------------------------------------------------------
  // 2. Highlight auto-redactions clearly on top
  // ------------------------------------------------------------
  const autos = autoRedactSuggestions.filter(s => s.page === page);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 140, 0, 1)";
  ctx.fillStyle = "rgba(255, 140, 0, 0.25)";
  ctx.lineWidth = 2;

  for (const s of autos) {
    for (const rect of s.rects) {
      const x = rect.x0 * view.overlay.width;
      const y = rect.y0 * view.overlay.height;
      const w = (rect.x1 - rect.x0) * view.overlay.width;
      const h = (rect.y1 - rect.y0) * view.overlay.height;

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }

  ctx.restore();
}
