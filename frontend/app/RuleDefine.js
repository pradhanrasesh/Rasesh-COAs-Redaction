import { promptManualTrainingLabel } from "./ManualTraining.js";

const BACKEND_URL = "";
function getPdfjsLib() {
  const lib = window.pdfjsLib;
  if (lib?.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
  }
  return lib;
}

let pdfDoc = null;
let trainingItems = [];
let companyProfile = {
  companyId: "",
  displayName: "",
  isExisting: false,
};
let selectedItemId = null;
let nextItemId = 1;
let undoStack = [];
let redoStack = [];
let interaction = null;

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `company_${Date.now()}`;
}

function getFileBaseName(fileName) {
  return String(fileName || "").replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

function setThemeFromStorage() {
  try {
    const raw = localStorage.getItem("coaSettings") || "{}";
    const settings = JSON.parse(raw);
    if (settings.theme) document.body.dataset.theme = settings.theme;
    if (settings.density) document.body.dataset.density = settings.density;
  } catch {}
}

function setStatus(message) {
  const el = document.getElementById("ruleDefineStatus");
  if (el) el.textContent = message;
}

function cloneItems(items = trainingItems) {
  return JSON.parse(JSON.stringify(items));
}

function getCanvasRect(rect, canvas) {
  return {
    x: rect.x0 * canvas.width,
    y: (1 - rect.y1) * canvas.height,
    w: Math.max(0, (rect.x1 - rect.x0) * canvas.width),
    h: Math.max(0, (rect.y1 - rect.y0) * canvas.height),
  };
}

function pushHistory() {
  undoStack.push(cloneItems());
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  syncUndoRedoButtons();
}

function restoreHistory(sourceStack, targetStack, label) {
  if (!sourceStack.length) return;
  targetStack.push(cloneItems());
  trainingItems = sourceStack.pop();
  selectedItemId = trainingItems.some((item) => item.id === selectedItemId)
    ? selectedItemId
    : trainingItems[trainingItems.length - 1]?.id || null;
  renderRuleList();
  renderViewerOverlays();
  syncUndoRedoButtons();
  setStatus(label);
}

function syncUndoRedoButtons() {
  const undo = document.getElementById("ruleDefineUndo");
  const redo = document.getElementById("ruleDefineRedo");
  if (undo) undo.disabled = undoStack.length === 0;
  if (redo) redo.disabled = redoStack.length === 0;
}

function normalizeItem(item) {
  const normalized = {
    id: item.id || `rule_${nextItemId++}`,
    label: item.label || "REDACTED",
    group: item.group || inferGroup(item.label),
    sample_text: item.sample_text || item.text || "",
    text: item.text || item.sample_text || "",
    rects: item.rects || [],
    page: Number(item.page || 1),
    source: item.source || "manual",
  };

  if (normalized.id.startsWith("rule_")) {
    const num = Number(normalized.id.replace("rule_", ""));
    if (Number.isFinite(num)) nextItemId = Math.max(nextItemId, num + 1);
  }

  return normalized;
}

function updateCompanyBadge() {
  const el = document.getElementById("ruleDefineCompany");
  if (!el) return;
  if (!companyProfile.companyId) {
    el.textContent = "No company selected";
    return;
  }
  el.textContent = `${companyProfile.displayName} · ${companyProfile.isExisting ? "Existing Rule" : "New Rule"}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRuleList() {
  const list = document.getElementById("ruleDefineRuleList");
  const count = document.getElementById("ruleDefineRuleCount");
  if (!list) return;

  if (count) count.textContent = String(trainingItems.length);

  if (!trainingItems.length) {
    list.innerHTML = `
      <div class="rule-define-empty-card">
        Draw a box around a value in the preview, label it, and it will appear here.
      </div>
    `;
    return;
  }

  list.innerHTML = trainingItems.map((item, index) => `
    <article class="rule-define-item-card ${item.id === selectedItemId ? "active" : ""}" data-index="${index}" data-item-id="${item.id}">
      <div class="rule-define-item-head">
        <div>
          <div class="rule-define-item-label">${escapeHtml(item.label)}</div>
          <div class="rule-define-item-meta">Page ${item.page} · ${escapeHtml(item.group || "manual")} · ${escapeHtml(item.source || "manual")}</div>
        </div>
        <button type="button" class="rule-define-item-remove" data-remove-id="${item.id}">Remove</button>
      </div>
      <div class="rule-define-item-text">${escapeHtml(item.sample_text || "Position-based learned zone")}</div>
    </article>
  `).join("");

  list.querySelectorAll("[data-item-id]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-remove-id]")) return;
      selectedItemId = card.dataset.itemId;
      renderRuleList();
      renderViewerOverlays();
    });
  });

  list.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      pushHistory();
      const id = button.dataset.removeId;
      trainingItems = trainingItems.filter((item) => item.id !== id);
      if (selectedItemId === id) selectedItemId = trainingItems[trainingItems.length - 1]?.id || null;
      renderRuleList();
      renderViewerOverlays();
      setStatus("Rule removed.");
    });
  });
}

function getHandles(bounds) {
  const midX = bounds.x + bounds.w / 2;
  const midY = bounds.y + bounds.h / 2;
  return {
    nw: { x: bounds.x, y: bounds.y },
    ne: { x: bounds.x + bounds.w, y: bounds.y },
    sw: { x: bounds.x, y: bounds.y + bounds.h },
    se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    n: { x: midX, y: bounds.y },
    s: { x: midX, y: bounds.y + bounds.h },
    w: { x: bounds.x, y: midY },
    e: { x: bounds.x + bounds.w, y: midY },
  };
}

function hitTestItem(item, canvas, point) {
  const rect = item.rects?.[0];
  if (!rect) return null;
  const bounds = getCanvasRect(rect, canvas);
  const handleSize = 10;
  const handles = getHandles(bounds);

  for (const [name, handle] of Object.entries(handles)) {
    if (
      point.x >= handle.x - handleSize &&
      point.x <= handle.x + handleSize &&
      point.y >= handle.y - handleSize &&
      point.y <= handle.y + handleSize
    ) {
      return { type: "resize", handle: name, bounds };
    }
  }

  if (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.w &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.h
  ) {
    return { type: "move", bounds };
  }

  return null;
}

function drawSelectionHandles(ctx, bounds) {
  const handles = Object.values(getHandles(bounds));
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ef4444";
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - 4, handle.y - 4, 8, 8);
    ctx.fill();
    ctx.stroke();
  });
}

function renderViewerOverlays() {
  document.querySelectorAll(".rule-define-overlay").forEach((canvas) => {
    const page = Number(canvas.dataset.page || 1);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    trainingItems
      .filter((item) => item.page === page)
      .forEach((item) => {
        const rect = item.rects?.[0];
        if (!rect) return;

        const bounds = getCanvasRect(rect, canvas);
        const isSelected = item.id === selectedItemId;
        const width = Math.max(1.5, isSelected ? 3 : 2);

        ctx.fillStyle = isSelected ? "rgba(239, 68, 68, 0.24)" : "rgba(239, 68, 68, 0.12)";
        ctx.strokeStyle = isSelected ? "rgba(220, 38, 38, 0.95)" : "rgba(239, 68, 68, 0.88)";
        ctx.lineWidth = width;
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);

        const label = item.label || "RULE";
        const pillWidth = Math.min(canvas.width - bounds.x, Math.max(104, label.length * 8 + 24));
        ctx.fillStyle = "rgba(127, 29, 29, 0.96)";
        ctx.fillRect(bounds.x, Math.max(0, bounds.y - 24), pillWidth, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px sans-serif";
        ctx.fillText(label, bounds.x + 8, Math.max(14, bounds.y - 10));

        if (isSelected) drawSelectionHandles(ctx, bounds);
      });

    if (interaction?.page === page && interaction.type === "draw" && interaction.previewBounds) {
      const { x, y, w, h } = interaction.previewBounds;
      ctx.strokeStyle = "rgba(220, 38, 38, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  });
}

async function renderViewer(bytes) {
  const container = document.getElementById("ruleDefineViewer");
  if (!container) return;
  container.innerHTML = "";

  // Ensure worker source is set
  if (pdfjsLib?.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
  }

  try {
    const lib = getPdfjsLib();
    pdfDoc = await lib.getDocument({ data: bytes }).promise;

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.15 });

      const wrapper = document.createElement("div");
      wrapper.className = "rule-define-page";
      wrapper.dataset.page = String(pageNumber);
      wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      wrapper.style.width = '100%';
      wrapper.style.height = 'auto';

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = "rule-define-page-canvas";

      const overlay = document.createElement("canvas");
      overlay.width = viewport.width;
      overlay.height = viewport.height;
      overlay.className = "rule-define-overlay";
      overlay.dataset.page = String(pageNumber);

      wrapper.appendChild(canvas);
      wrapper.appendChild(overlay);
      container.appendChild(wrapper);

      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      attachOverlayInteractions(overlay, pageNumber, viewport);
    }

    renderViewerOverlays();
  } catch (error) {
    console.error("PDF preview failed:", error);
    container.innerHTML = `
      <div class="rule-define-empty-viewer">
        <i data-lucide="alert-circle"></i>
        <div>Failed to load PDF preview: ${error.message}</div>
        <div style="font-size: 12px; margin-top: 8px;">Check console for details.</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

function pointFromEvent(overlay, event) {
  const rect = overlay.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function normalizeRectFromBounds(bounds, viewport) {
  const x0 = Math.max(0, Math.min(1, bounds.x / viewport.width));
  const x1 = Math.max(0, Math.min(1, (bounds.x + bounds.w) / viewport.width));
  const y0 = Math.max(0, Math.min(1, 1 - ((bounds.y + bounds.h) / viewport.height)));
  const y1 = Math.max(0, Math.min(1, 1 - (bounds.y / viewport.height)));
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

function updateRectForHandle(originalBounds, currentPoint, handle, canvas) {
  const minSize = 12;
  const next = { ...originalBounds };

  if (handle.includes("n")) {
    next.y = Math.min(currentPoint.y, originalBounds.y + originalBounds.h - minSize);
    next.h = originalBounds.y + originalBounds.h - next.y;
  }
  if (handle.includes("s")) {
    next.h = Math.max(minSize, currentPoint.y - originalBounds.y);
  }
  if (handle.includes("w")) {
    next.x = Math.min(currentPoint.x, originalBounds.x + originalBounds.w - minSize);
    next.w = originalBounds.x + originalBounds.w - next.x;
  }
  if (handle.includes("e")) {
    next.w = Math.max(minSize, currentPoint.x - originalBounds.x);
  }

  next.x = Math.max(0, Math.min(next.x, canvas.width - minSize));
  next.y = Math.max(0, Math.min(next.y, canvas.height - minSize));
  next.w = Math.max(minSize, Math.min(next.w, canvas.width - next.x));
  next.h = Math.max(minSize, Math.min(next.h, canvas.height - next.y));

  return next;
}

function attachOverlayInteractions(overlay, pageNumber, viewport) {
  overlay.addEventListener("mousedown", (event) => {
    const point = pointFromEvent(overlay, event);
    const pageItems = trainingItems.filter((item) => item.page === pageNumber);

    for (let index = pageItems.length - 1; index >= 0; index -= 1) {
      const item = pageItems[index];
      const hit = hitTestItem(item, overlay, point);
      if (!hit) continue;

      selectedItemId = item.id;
      interaction = {
        type: hit.type,
        handle: hit.handle,
        itemId: item.id,
        page: pageNumber,
        startPoint: point,
        startBounds: hit.bounds,
        historyPushed: false,
      };
      renderRuleList();
      renderViewerOverlays();
      return;
    }

    selectedItemId = null;
    interaction = {
      type: "draw",
      page: pageNumber,
      startPoint: point,
      previewBounds: { x: point.x, y: point.y, w: 0, h: 0 },
    };
    renderRuleList();
    renderViewerOverlays();
  });

  overlay.addEventListener("mousemove", (event) => {
    if (!interaction || interaction.page !== pageNumber) return;

    const point = pointFromEvent(overlay, event);
    if (interaction.type === "draw") {
      interaction.previewBounds = {
        x: Math.min(interaction.startPoint.x, point.x),
        y: Math.min(interaction.startPoint.y, point.y),
        w: Math.abs(point.x - interaction.startPoint.x),
        h: Math.abs(point.y - interaction.startPoint.y),
      };
      renderViewerOverlays();
      return;
    }

    const item = trainingItems.find((entry) => entry.id === interaction.itemId);
    if (!item || !item.rects?.[0]) return;
    if (!interaction.historyPushed) {
      pushHistory();
      interaction.historyPushed = true;
    }

    let bounds = { ...interaction.startBounds };
    if (interaction.type === "move") {
      const dx = point.x - interaction.startPoint.x;
      const dy = point.y - interaction.startPoint.y;
      bounds.x = Math.max(0, Math.min(overlay.width - bounds.w, interaction.startBounds.x + dx));
      bounds.y = Math.max(0, Math.min(overlay.height - bounds.h, interaction.startBounds.y + dy));
    } else if (interaction.type === "resize") {
      bounds = updateRectForHandle(interaction.startBounds, point, interaction.handle, overlay);
    }

    item.rects = [normalizeRectFromBounds(bounds, viewport)];
    renderViewerOverlays();
  });

  const finishInteraction = async (event) => {
    if (!interaction || interaction.page !== pageNumber) return;
    const current = interaction;
    interaction = null;

    if (current.type !== "draw") {
      renderViewerOverlays();
      renderRuleList();
      syncUndoRedoButtons();
      setStatus(current.type === "move" ? "Rule box moved." : "Rule box resized.");
      return;
    }

    const point = pointFromEvent(overlay, event);
    const bounds = {
      x: Math.min(current.startPoint.x, point.x),
      y: Math.min(current.startPoint.y, point.y),
      w: Math.abs(point.x - current.startPoint.x),
      h: Math.abs(point.y - current.startPoint.y),
    };

    if (bounds.w < 12 || bounds.h < 12) {
      renderViewerOverlays();
      return;
    }

    const rect = normalizeRectFromBounds(bounds, viewport);
    const result = await promptManualTrainingLabel({
      page: pageNumber,
      rect,
    });

    if (result.action === "train" && result.label) {
      pushHistory();
      const item = normalizeItem({
        label: result.label,
        group: inferGroup(result.label),
        sample_text: result.extractedText || "",
        text: result.extractedText || "",
        rects: [rect],
        page: pageNumber,
      });
      trainingItems.push(item);
      selectedItemId = item.id;
      renderRuleList();
      setStatus(`Added rule for ${result.label}.`);
    } else if (result.action === "redact-only") {
      setStatus("Rule box was not saved because Rule Define Studio only stores labeled rules.");
    } else {
      setStatus("Rule creation cancelled.");
    }

    renderViewerOverlays();
    syncUndoRedoButtons();
  };

  overlay.addEventListener("mouseup", finishInteraction);
  overlay.addEventListener("mouseleave", () => {
    if (!interaction || interaction.page !== pageNumber) return;
    if (interaction.type === "draw") {
      interaction = null;
      renderViewerOverlays();
    }
  });
}

function inferGroup(label) {
  const value = String(label || "").toUpperCase();
  if (value.includes("REPORT")) return "report";
  if (value.includes("ACCOUNT")) return "account";
  if (value.includes("LICENSE")) return "license";
  if (value.includes("PHONE")) return "phone";
  if (value.includes("EMAIL")) return "email";
  if (value.includes("ADDRESS")) return "address";
  if (value.includes("CLIENT") || value.includes("NAME")) return "name";
  if (value.includes("LOT")) return "lot";
  if (value.includes("SAMPLE")) return "sample";
  if (value.includes("COA")) return "coa";
  if (value.includes("PO#") || value === "PO") return "po";
  if (value.includes("LAB")) return "lab";
  if (value.includes("BARCODE")) return "barcode";
  if (value.includes("QR")) return "qr";
  return "manual";
}

async function detectCompany(file) {
  const form = new FormData();
  form.append("file", file, file.name);

  try {
    console.log("Detecting company for file:", file.name);
    const res = await fetch(`${BACKEND_URL}/detect-company`, {
      method: "POST",
      body: form,
    });
    
    console.log("Response status:", res.status, res.statusText);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Detection failed:", errorText);
      return null;
    }
    
    const json = await res.json();
    console.log("Detection response:", json);
    
    return json.company_id ? json : null;
  } catch (error) {
    console.error("Error in detectCompany:", error);
    return null;
  }
}

async function loadExistingCompanyRules(companyId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/ai/company-template/${encodeURIComponent(companyId)}`);
    if (!response.ok) return;
    const json = await response.json();
    const items = (json.training_items || []).map(normalizeItem);
    if (!items.length) return;
    trainingItems = items;
    selectedItemId = trainingItems[0]?.id || null;
    renderRuleList();
    renderViewerOverlays();
    setStatus(`Loaded ${items.length} existing rule areas for ${json.display_name || companyId}.`);
  } catch {}
}

function ensureCompanyModal() {
  let modal = document.getElementById("companyCreateModal");
  if (modal && modal.dataset.ready === "true") return modal;
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "companyCreateModal";
    modal.className = "manual-training-modal hidden";
    document.body.appendChild(modal);
  }

  modal.dataset.ready = "true";
  modal.innerHTML = `
    <div class="manual-training-backdrop" data-close-company="true"></div>
    <div class="manual-training-dialog" role="dialog" aria-modal="true" aria-labelledby="companyCreateTitle">
      <div class="manual-training-head">
        <div>
          <div class="manual-training-kicker">New Company Rule</div>
          <h3 id="companyCreateTitle">Create Company Profile</h3>
        </div>
        <button type="button" class="manual-training-close" data-close-company="true" aria-label="Close">x</button>
      </div>
      <div class="manual-training-body">
        <label class="manual-training-label" for="companyCreateName">Company name</label>
        <input id="companyCreateName" class="manual-training-input" type="text" placeholder="Company name" />
        <label class="manual-training-label" for="companyCreateId">Company ID</label>
        <input id="companyCreateId" class="manual-training-input" type="text" placeholder="company_id" />
      </div>
      <div class="manual-training-actions">
        <button type="button" id="companyCreateCancel" class="btn btn-ghost">Cancel</button>
        <button type="button" id="companyCreateSave" class="btn btn-primary">Create Rule</button>
      </div>
    </div>
  `;
  return modal;
}

function promptForCompany(fileName) {
  const modal = ensureCompanyModal();
  const nameInput = document.getElementById("companyCreateName");
  const idInput = document.getElementById("companyCreateId");
  const suggestion = getFileBaseName(fileName) || "New Company";

  nameInput.value = suggestion;
  idInput.value = slugify(suggestion);
  delete idInput.dataset.touched;

  nameInput.oninput = () => {
    if (!idInput.dataset.touched) idInput.value = slugify(nameInput.value);
  };
  idInput.oninput = () => {
    idInput.dataset.touched = "true";
  };

  modal.classList.remove("hidden");
  setTimeout(() => nameInput.focus(), 0);

  return new Promise((resolve) => {
    const close = (value) => {
      modal.classList.add("hidden");
      delete idInput.dataset.touched;
      resolve(value);
    };

    const onCancel = () => {
      cleanup();
      close(null);
    };

    const onSave = () => {
      const displayName = nameInput.value.trim();
      const companyId = slugify(idInput.value || displayName);
      if (!displayName || !companyId) return;
      cleanup();
      close({ company_id: companyId, display_name: displayName });
    };

    const onBackdrop = (event) => {
      if (event.target?.dataset?.closeCompany === "true") {
        cleanup();
        close(null);
      }
    };

    const cleanup = () => {
      modal.removeEventListener("click", onBackdrop);
      document.getElementById("companyCreateCancel").removeEventListener("click", onCancel);
      document.getElementById("companyCreateSave").removeEventListener("click", onSave);
    };

    modal.addEventListener("click", onBackdrop);
    document.getElementById("companyCreateCancel").addEventListener("click", onCancel);
    document.getElementById("companyCreateSave").addEventListener("click", onSave);
  });
}

async function saveRules(replaceExisting) {
  if (!companyProfile.companyId) {
    setStatus("Choose or create a company first.");
    return;
  }
  if (!trainingItems.length) {
    setStatus("Create at least one labeled rule before saving.");
    return;
  }

  const response = await fetch(`${BACKEND_URL}/api/ai/learn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyProfile.companyId,
      display_name: companyProfile.displayName,
      items: trainingItems.map(({ id, source, ...item }) => item),
      replace_existing: replaceExisting,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(json.detail || json.error || `Failed to save rules (${response.status})`);
    return;
  }

  companyProfile.isExisting = true;
  updateCompanyBadge();
  setStatus(replaceExisting ? "Rule set replaced successfully." : "Rule set saved successfully.");
}

async function handleFile(file) {
  document.getElementById("ruleDefineFileName").textContent = file.name;
  trainingItems = [];
  undoStack = [];
  redoStack = [];
  selectedItemId = null;
  renderRuleList();
  syncUndoRedoButtons();

  try {
    await renderViewer(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    setStatus(`Unable to preview this PDF: ${error?.message || error}`);
    return;
  }

  setStatus("PDF loaded. Detecting company...");

  const detected = await detectCompany(file);
  if (detected) {
    companyProfile = {
      companyId: detected.company_id,
      displayName: detected.display_name || detected.company_id,
      isExisting: true,
    };
    updateCompanyBadge();
    setStatus(`Detected company: ${companyProfile.displayName}`);
    await loadExistingCompanyRules(companyProfile.companyId);
    return;
  }

  const created = await promptForCompany(file.name);
  if (!created) {
    companyProfile = { companyId: "", displayName: "", isExisting: false };
    updateCompanyBadge();
    setStatus("No company detected. Create a company to save rules.");
    return;
  }

  companyProfile = {
    companyId: created.company_id,
    displayName: created.display_name,
    isExisting: false,
  };
  updateCompanyBadge();
  setStatus(`Created new company profile: ${companyProfile.displayName}`);
}

function wireUpload() {
  const input = document.getElementById("ruleDefineFileInput");
  const drop = document.getElementById("ruleDefineDropzone");
  if (!input || !drop) return;

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await handleFile(file);
  });

  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", async (event) => {
    event.preventDefault();
    drop.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  });
}

function wireActions() {
  document.getElementById("ruleDefineSave")?.addEventListener("click", () => saveRules(false));
  document.getElementById("ruleDefineOverwrite")?.addEventListener("click", () => saveRules(true));
  document.getElementById("ruleDefineUndo")?.addEventListener("click", () => restoreHistory(undoStack, redoStack, "Undo."));
  document.getElementById("ruleDefineRedo")?.addEventListener("click", () => restoreHistory(redoStack, undoStack, "Redo."));
}

function wireShortcuts() {
  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const isCtrl = event.ctrlKey || event.metaKey;
    if (!isCtrl) return;

    if (!event.shiftKey && key === "z") {
      event.preventDefault();
      restoreHistory(undoStack, redoStack, "Undo.");
    }

    if (key === "y" || (event.shiftKey && key === "z")) {
      event.preventDefault();
      restoreHistory(redoStack, undoStack, "Redo.");
    }
  });
}

export function initRuleDefinePage() {
  setThemeFromStorage();
  wireUpload();
  wireActions();
  wireShortcuts();
  updateCompanyBadge();
  renderRuleList();
  syncUndoRedoButtons();
}
