// ------------------------------------------------------------
// Redaction_Box.js — Manual box redaction (Adobe-style)
// ------------------------------------------------------------

import {
  redactions,
  setRedactions,
  selectionMode,
  setStatus
} from "./Utils.js";

import { pushUndo } from "./Redaction_Core.js";
import { renderPageView } from "./PDF_Loader.js";
import { handleManualTrainingRect } from "./ManualTraining.js";

// Handle size in screen pixels
const HANDLE_SIZE = 8;

// Which handle is being dragged
const HandleType = {
  NONE: "none",
  TOP_LEFT: "tl",
  TOP_RIGHT: "tr",
  BOTTOM_LEFT: "bl",
  BOTTOM_RIGHT: "br",
  TOP: "t",
  BOTTOM: "b",
  LEFT: "l",
  RIGHT: "r"
};

// ------------------------------------------------------------
// Helper: convert normalized rect → screen rect
// ------------------------------------------------------------
function normToScreenRect(rect, viewport) {
  const w = viewport.width;
  const h = viewport.height;
  return {
    x: rect.x0 * w,
    y: rect.y0 * h,
    width: (rect.x1 - rect.x0) * w,
    height: (rect.y1 - rect.y0) * h
  };
}

// ------------------------------------------------------------
// Helper: convert screen rect → normalized rect
// ------------------------------------------------------------
function screenToNormRect(x0, y0, x1, y1, viewport) {
  const w = viewport.width;
  const h = viewport.height;
  return {
    x0: Math.min(x0, x1) / w,
    y0: Math.min(y0, y1) / h,
    x1: Math.max(x0, x1) / w,
    y1: Math.max(y0, y1) / h
  };
}

// ------------------------------------------------------------
// Helper: draw a single box + handles (Stirling style)
// ------------------------------------------------------------
function drawBoxWithHandles(ctx, screenRect) {
  const { x, y, width, height } = screenRect;

  // Fill (Stirling transparent black/white based on theme)
  // Check if dark mode is active
  const isDark = document.body.dataset.theme === 'dark' ||
                 (document.body.dataset.theme === 'system' &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  if (isDark) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)"; // White transparent for dark mode
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; // Black transparent for light mode
  }
  ctx.fillRect(x, y, width, height);

  // Outline (blue accent)
  ctx.strokeStyle = "rgba(59, 130, 246, 0.8)"; // studio-blue with transparency
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Handles (small white squares with blue border)
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0, 150, 255, 0.9)";
  ctx.lineWidth = 1;

  const cx = x + width / 2;
  const cy = y + height / 2;
  const hs = HANDLE_SIZE;

  const handlePoints = [
    { type: HandleType.TOP_LEFT,     x: x,          y: y },
    { type: HandleType.TOP_RIGHT,    x: x + width,  y: y },
    { type: HandleType.BOTTOM_LEFT,  x: x,          y: y + height },
    { type: HandleType.BOTTOM_RIGHT, x: x + width,  y: y + height },
    { type: HandleType.TOP,          x: cx,         y: y },
    { type: HandleType.BOTTOM,       x: cx,         y: y + height },
    { type: HandleType.LEFT,         x: x,          y: cy },
    { type: HandleType.RIGHT,        x: x + width,  y: cy }
  ];

  for (const hp of handlePoints) {
    const hx = hp.x - hs / 2;
    const hy = hp.y - hs / 2;
    ctx.beginPath();
    ctx.rect(hx, hy, hs, hs);
    ctx.fill();
    ctx.stroke();
  }
}

// ------------------------------------------------------------
// Helper: hit-test handles
// ------------------------------------------------------------
function hitTestHandle(screenRect, x, y) {
  const { x: rx, y: ry, width, height } = screenRect;
  const cx = rx + width / 2;
  const cy = ry + height / 2;
  const hs = HANDLE_SIZE;
  const half = hs / 2;

  const handles = [
    { type: HandleType.TOP_LEFT,     x: rx,         y: ry },
    { type: HandleType.TOP_RIGHT,    x: rx + width, y: ry },
    { type: HandleType.BOTTOM_LEFT,  x: rx,         y: ry + height },
    { type: HandleType.BOTTOM_RIGHT, x: rx + width, y: ry + height },
    { type: HandleType.TOP,          x: cx,         y: ry },
    { type: HandleType.BOTTOM,       x: cx,         y: ry + height },
    { type: HandleType.LEFT,         x: rx,         y: cy },
    { type: HandleType.RIGHT,        x: rx + width, y: cy }
  ];

  for (const h of handles) {
    const hx = h.x - half;
    const hy = h.y - half;
    if (x >= hx && x <= hx + hs && y >= hy && y <= hy + hs) {
      return h.type;
    }
  }

  return HandleType.NONE;
}

// ------------------------------------------------------------
// Helper: hit-test inside rect
// ------------------------------------------------------------
function hitTestInside(screenRect, x, y) {
  const { x: rx, y: ry, width, height } = screenRect;
  return x >= rx && x <= rx + width && y >= ry && y <= ry + height;
}

// ------------------------------------------------------------
// attachBoxRedactionHandlers(view, addListener)
// ------------------------------------------------------------
export function attachBoxRedactionHandlers(view, addListener) {
  const overlay = view.overlay;
  if (!overlay || !view.viewport) return;

  let mode = "idle"; // "idle" | "drawing" | "moving" | "resizing"
  let startX = 0;
  let startY = 0;

  let activePage = view.pageNumber;
  let activeRectIndex = -1;
  let activeHandle = HandleType.NONE;

  let tempScreenRect = null;      // for drawing/moving/resizing preview
  let originalScreenRect = null;  // starting rect for move/resize

  function getPageBoxes() {
    const page = activePage;
    const list = redactions[page] || [];
    return list
      .map((r, idx) => ({ r, idx }))
      .filter(x => x.r.type === "box");
  }

  function redrawPreview(ctx) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const boxes = getPageBoxes();
    for (const { r, idx } of boxes) {
      const rect = r.rects[0];
      const screenRect = normToScreenRect(rect, view.viewport);

      if (idx === activeRectIndex && tempScreenRect) {
        drawBoxWithHandles(ctx, tempScreenRect);
      } else {
        drawBoxWithHandles(ctx, screenRect);
      }
    }

    if (mode === "drawing" && tempScreenRect && activeRectIndex === -1) {
      drawBoxWithHandles(ctx, tempScreenRect);
    }
  }

  function onMouseDown(e) {
    if (selectionMode !== "box") return;

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const boxes = getPageBoxes();
    const ctx = overlay.getContext("2d");

    let hitIndex = -1;
    let hitHandle = HandleType.NONE;

    for (let i = boxes.length - 1; i >= 0; i--) {
      const { r, idx } = boxes[i];
      const screenRect = normToScreenRect(r.rects[0], view.viewport);

      const handle = hitTestHandle(screenRect, x, y);
      if (handle !== HandleType.NONE) {
        hitIndex = idx;
        hitHandle = handle;
        originalScreenRect = screenRect;
        break;
      }

      if (hitTestInside(screenRect, x, y)) {
        hitIndex = idx;
        hitHandle = HandleType.NONE;
        originalScreenRect = screenRect;
        break;
      }
    }

    if (hitIndex !== -1) {
      activeRectIndex = hitIndex;
      startX = x;
      startY = y;

      if (hitHandle !== HandleType.NONE) {
        mode = "resizing";
        activeHandle = hitHandle;
      } else {
        mode = "moving";
        activeHandle = HandleType.NONE;
      }

      tempScreenRect = { ...originalScreenRect };
      redrawPreview(ctx);
    } else {
      mode = "drawing";
      activeRectIndex = -1;
      activeHandle = HandleType.NONE;
      startX = x;
      startY = y;
      tempScreenRect = { x, y, width: 0, height: 0 };
      redrawPreview(ctx);
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function onMouseMove(e) {
    if (selectionMode !== "box") return;
    if (mode === "idle") return;

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = overlay.getContext("2d");

    if (mode === "drawing") {
      let x0 = startX;
      let y0 = startY;
      let x1 = x;
      let y1 = y;

      if (e.shiftKey) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        x1 = x0 + Math.sign(dx || 1) * size;
        y1 = y0 + Math.sign(dy || 1) * size;
      }

      tempScreenRect = {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0)
      };

      redrawPreview(ctx);
    } else if (mode === "moving" && originalScreenRect) {
      const dx = x - startX;
      const dy = y - startY;

      tempScreenRect = {
        x: originalScreenRect.x + dx,
        y: originalScreenRect.y + dy,
        width: originalScreenRect.width,
        height: originalScreenRect.height
      };

      redrawPreview(ctx);
    } else if (mode === "resizing" && originalScreenRect) {
      const dx = x - startX;
      const dy = y - startY;

      let { x: rx, y: ry, width, height } = originalScreenRect;
      let x0 = rx;
      let y0 = ry;
      let x1 = rx + width;
      let y1 = ry + height;

      switch (activeHandle) {
        case HandleType.TOP_LEFT:
          x0 += dx;
          y0 += dy;
          break;
        case HandleType.TOP_RIGHT:
          x1 += dx;
          y0 += dy;
          break;
        case HandleType.BOTTOM_LEFT:
          x0 += dx;
          y1 += dy;
          break;
        case HandleType.BOTTOM_RIGHT:
          x1 += dx;
          y1 += dy;
          break;
        case HandleType.TOP:
          y0 += dy;
          break;
        case HandleType.BOTTOM:
          y1 += dy;
          break;
        case HandleType.LEFT:
          x0 += dx;
          break;
        case HandleType.RIGHT:
          x1 += dx;
          break;
      }

      if (e.shiftKey) {
        const w = x1 - x0;
        const h = y1 - y0;
        const size = Math.max(Math.abs(w), Math.abs(h));
        const sx = Math.sign(w || 1);
        const sy = Math.sign(h || 1);
        x1 = x0 + sx * size;
        y1 = y0 + sy * size;
      }

      tempScreenRect = {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0)
      };

      redrawPreview(ctx);
    }

    e.preventDefault();
    e.stopPropagation();
  }

  async function onMouseUp(e) {
    if (selectionMode !== "box") return;
    if (mode === "idle") return;

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = overlay.getContext("2d");

    const page = activePage;

    if (mode === "drawing") {
      let x0 = startX;
      let y0 = startY;
      let x1 = x;
      let y1 = y;

      if (e.shiftKey) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        x1 = x0 + Math.sign(dx || 1) * size;
        y1 = y0 + Math.sign(dy || 1) * size;
      }

      const normRect = screenToNormRect(x0, y0, x1, y1, view.viewport);

      if (Math.abs(normRect.x1 - normRect.x0) < 0.001 ||
          Math.abs(normRect.y1 - normRect.y0) < 0.001) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        mode = "idle";
        tempScreenRect = null;
        originalScreenRect = null;
        activeRectIndex = -1;
        activeHandle = HandleType.NONE;
        return;
      }

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      mode = "idle";
      tempScreenRect = null;
      originalScreenRect = null;
      activeRectIndex = -1;
      activeHandle = HandleType.NONE;

      const manualTrainingResult = await handleManualTrainingRect({
        page,
        rect: normRect,
      });

      if (manualTrainingResult?.keepRedaction) {
        pushUndo();
        const newMap = structuredClone(redactions || {});
        if (!newMap[page]) newMap[page] = [];

        newMap[page].push({
          page,
          type: "box",
          rects: [normRect],
          color: document.getElementById("redactionColor")?.value || "#000000",
          trainingLabel: manualTrainingResult.trainingLabel || ""
        });

        setRedactions(newMap);
      }

      renderPageView(view);
      e.preventDefault();
      e.stopPropagation();
      return;
    } else if ((mode === "moving" || mode === "resizing") && tempScreenRect && activeRectIndex !== -1) {
      const sr = tempScreenRect;
      const normRect = screenToNormRect(sr.x, sr.y, sr.x + sr.width, sr.y + sr.height, view.viewport);

      pushUndo();
      const newMap = structuredClone(redactions || {});
      if (!newMap[page]) newMap[page] = [];

      const entry = newMap[page][activeRectIndex];
      if (entry && entry.rects && entry.rects.length) {
        entry.rects[0] = normRect;
      }

      setRedactions(newMap);
      setStatus(`Updated box redaction on page ${page}.`);
      renderPageView(view);
    }

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    mode = "idle";
    tempScreenRect = null;
    originalScreenRect = null;
    activeRectIndex = -1;
    activeHandle = HandleType.NONE;

    e.preventDefault();
    e.stopPropagation();
  }

  function onMouseLeave() {
    if (mode === "idle") return;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    mode = "idle";
    tempScreenRect = null;
    originalScreenRect = null;
    activeRectIndex = -1;
    activeHandle = HandleType.NONE;
  }

  addListener(overlay, "mousedown", onMouseDown);
  addListener(overlay, "mousemove", onMouseMove);
  addListener(overlay, "mouseup", onMouseUp);
  addListener(overlay, "mouseleave", onMouseLeave);
}
