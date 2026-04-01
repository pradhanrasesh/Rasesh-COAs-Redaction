function getPdfjsLib() {
  const lib = window.pdfjsLib;
  if (lib?.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
  }
  return lib;
}

let pdfDoc1 = null;
let pdfDoc2 = null;
let currentSuggestions = [];
let manualRedactions = [];
let isCompareMode = false;
let zoom = 1;

function normalizeSuggestion(item, index) {
  return {
    id: item.id || `suggestion_${index + 1}`,
    label: item.label || "REDACTED",
    group: item.group || null,
    sample_text: item.sample_text || item.text || "",
    text: item.text || item.sample_text || "",
    rects: Array.isArray(item.rects) ? item.rects : [],
    page: Number(item.page || 1),
  };
}

function normalizeManual(item, index) {
  return {
    id: item.id || `manual_${index + 1}`,
    label: item.label || "MANUAL LABEL",
    text: item.text || "",
    sample_text: item.sample_text || item.text || "",
    rect: item.rect || item.rects?.[0] || null,
    page: Number(item.page || 1),
  };
}

export async function initTrainingViewer(f1Bytes, suggestions = [], f2Bytes = null) {
  const lib = getPdfjsLib();
  const loading1 = lib.getDocument({ data: f1Bytes });
  pdfDoc1 = await loading1.promise;

  if (f2Bytes) {
    const loading2 = lib.getDocument({ data: f2Bytes });
    pdfDoc2 = await loading2.promise;
  } else {
    pdfDoc2 = null;
  }

  currentSuggestions = (suggestions || []).map(normalizeSuggestion);
  manualRedactions = [];
  zoom = 1;
  isCompareMode = !!pdfDoc2;

  await renderLayout();
}

export function setCompareMode(active) {
  if (active === undefined) isCompareMode = !isCompareMode;
  else isCompareMode = !!active;
  renderLayout();
  return isCompareMode;
}

export function setViewerZoom(nextZoom) {
  zoom = Math.max(0.5, Math.min(2, Number(nextZoom || 1)));
  renderLayout();
  return zoom;
}

export function getViewerZoom() {
  return zoom;
}

export function addManualTrainingItem({ label, text = "" }) {
  const normalized = normalizeManual({
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: String(label || "").trim().toUpperCase() || "MANUAL LABEL",
    text: String(text || "").trim(),
    sample_text: String(text || "").trim(),
    page: 1,
  }, manualRedactions.length);
  manualRedactions.push(normalized);
  return getTrainingState();
}

export function updateTrainingItem(kind, index, updates = {}) {
  const list = kind === "manual" ? manualRedactions : currentSuggestions;
  if (!list[index]) return getTrainingState();

  list[index] = {
    ...list[index],
    ...updates,
  };

  if (updates.label !== undefined) {
    list[index].label = String(updates.label || "").trim().toUpperCase();
  }
  if (updates.text !== undefined) {
    list[index].text = String(updates.text || "");
    list[index].sample_text = String(updates.text || "");
  }

  renderLayout();
  return getTrainingState();
}

export function removeTrainingItem(kind, index) {
  const list = kind === "manual" ? manualRedactions : currentSuggestions;
  if (!list[index]) return getTrainingState();
  list.splice(index, 1);
  renderLayout();
  return getTrainingState();
}

export function getTrainingState() {
  return {
    suggestions: currentSuggestions.map((item) => ({ ...item })),
    manual: manualRedactions.map((item) => ({ ...item })),
  };
}

async function renderLayout() {
  const container = document.getElementById("trainingViewerContainer");
  if (!container) return;
  container.innerHTML = "";

  if (isCompareMode && pdfDoc2) {
    const leftCol = document.createElement("div");
    leftCol.className = "training-column";
    leftCol.id = "colOriginal";
    leftCol.innerHTML = `<div class="training-column-header">Original File</div>`;

    const rightCol = document.createElement("div");
    rightCol.className = "training-column";
    rightCol.id = "colRedacted";
    rightCol.innerHTML = `<div class="training-column-header">Redacted Reference</div>`;

    container.appendChild(leftCol);
    container.appendChild(rightCol);

    await renderPages(pdfDoc1, leftCol, true);
    await renderPages(pdfDoc2, rightCol, false);
    setupSyncScroll(leftCol, rightCol);
  } else {
    const mainCol = document.createElement("div");
    mainCol.className = "training-column";
    mainCol.id = "colOriginal";
    mainCol.innerHTML = `<div class="training-column-header">Original File</div>`;
    container.appendChild(mainCol);
    await renderPages(pdfDoc1, mainCol, true);
  }
}

async function renderPages(doc, col, interactive) {
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: zoom });

    const wrapper = document.createElement("div");
    wrapper.className = "training-page-wrapper";
    wrapper.dataset.pageNum = String(i);
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = "training-pdf-canvas";

    const overlay = document.createElement("canvas");
    overlay.width = viewport.width;
    overlay.height = viewport.height;
    overlay.className = "training-overlay-canvas";
    if (interactive) overlay.classList.add("interactive");

    const labelsContainer = document.createElement("div");
    labelsContainer.className = "labels-container";

    wrapper.appendChild(canvas);
    wrapper.appendChild(overlay);
    wrapper.appendChild(labelsContainer);
    col.appendChild(wrapper);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    drawOverlays(overlay, labelsContainer, i, viewport);
    if (interactive) setupInteraction(overlay, labelsContainer, i, viewport);
  }
}

function drawOverlays(canvas, labelsContainer, pageNum, viewport) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  labelsContainer.innerHTML = "";

  currentSuggestions
    .filter((item) => item.page === pageNum)
    .forEach((item, index) => {
      (item.rects || []).forEach((rect) => {
        drawBox(ctx, labelsContainer, rect, viewport, "rgba(59, 130, 246, 0.16)", "#3b82f6", item.label, "suggestion", index);
      });
    });

  manualRedactions
    .filter((item) => item.page === pageNum && item.rect)
    .forEach((item, index) => {
      drawBox(ctx, labelsContainer, item.rect, viewport, "rgba(239, 68, 68, 0.16)", "#ef4444", item.label, "manual", index);
    });
}

function drawBox(ctx, labelsContainer, rect, viewport, fill, stroke, label, kind, index) {
  if (!rect) return;
  const x = rect.x0 * viewport.width;
  const y = (1 - rect.y1) * viewport.height;
  const w = (rect.x1 - rect.x0) * viewport.width;
  const h = (rect.y1 - rect.y0) * viewport.height;

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  if (!label) return;

  const labelEl = document.createElement("button");
  labelEl.type = "button";
  labelEl.className = "label-overlay";
  labelEl.style.left = `${x}px`;
  labelEl.style.top = `${Math.max(0, y - 26)}px`;
  labelEl.style.background = stroke;
  labelEl.textContent = label;
  labelEl.addEventListener("click", (event) => {
    event.preventDefault();
    const next = window.prompt("Edit label:", label) || "";
    if (next === "") {
      removeTrainingItem(kind, index);
      return;
    }
    updateTrainingItem(kind, index, { label: next });
  });
  labelsContainer.appendChild(labelEl);
}

function setupInteraction(canvas, labelsContainer, pageNum, viewport) {
  let isDrawing = false;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener("mousedown", (event) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = event.clientX - rect.left;
    startY = event.clientY - rect.top;
  });

  canvas.addEventListener("mousemove", (event) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const curX = event.clientX - rect.left;
    const curY = event.clientY - rect.top;

    drawOverlays(canvas, labelsContainer, pageNum, viewport);
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(startX, startY, curX - startX, curY - startY);
    ctx.setLineDash([]);
  });

  canvas.addEventListener("mouseup", (event) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rect = canvas.getBoundingClientRect();
    const endX = event.clientX - rect.left;
    const endY = event.clientY - rect.top;

    if (Math.abs(endX - startX) < 8 && Math.abs(endY - startY) < 8) {
      drawOverlays(canvas, labelsContainer, pageNum, viewport);
      return;
    }

    const x0 = Math.min(startX, endX) / viewport.width;
    const x1 = Math.max(startX, endX) / viewport.width;
    const y0 = 1 - (Math.max(startY, endY) / viewport.height);
    const y1 = 1 - (Math.min(startY, endY) / viewport.height);
    const label = (window.prompt("Label this area:", "NAME") || "").trim().toUpperCase();
    if (!label) {
      drawOverlays(canvas, labelsContainer, pageNum, viewport);
      return;
    }

    manualRedactions.push(normalizeManual({
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      rect: { x0, y0, x1, y1 },
      page: pageNum,
    }, manualRedactions.length));
    renderLayout();
  });

  canvas.addEventListener("mouseleave", () => {
    if (!isDrawing) return;
    isDrawing = false;
    drawOverlays(canvas, labelsContainer, pageNum, viewport);
  });
}

function setupSyncScroll(col1, col2) {
  let active = null;
  col1.addEventListener("mouseenter", () => { active = col1; });
  col2.addEventListener("mouseenter", () => { active = col2; });

  col1.addEventListener("scroll", () => {
    if (active === col1) {
      col2.scrollTop = col1.scrollTop;
      col2.scrollLeft = col1.scrollLeft;
    }
  });
  col2.addEventListener("scroll", () => {
    if (active === col2) {
      col1.scrollTop = col2.scrollTop;
      col1.scrollLeft = col2.scrollLeft;
    }
  });
}

export function getTrainingEvents() {
  const result = [];
  currentSuggestions.forEach((item) => {
    result.push({
      label: item.label,
      group: item.group || null,
      sample_text: item.sample_text || item.text || "",
      text: item.text || item.sample_text || "",
      rects: Array.isArray(item.rects) ? item.rects : [],
      page: item.page || 1,
    });
  });
  manualRedactions.forEach((item) => {
    result.push({
      label: item.label,
      group: "manual",
      sample_text: item.sample_text || item.text || "",
      text: item.text || item.sample_text || "",
      rects: item.rect ? [item.rect] : [],
      page: item.page || 1,
    });
  });
  return result;
}
