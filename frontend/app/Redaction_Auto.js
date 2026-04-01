// frontend/app/Redaction_Auto.js
// Unified auto-redaction engine (backend + EXTENDED PII fallback)
// Option B: Preview stays RED, applied redactions ALWAYS BLACK
// Layout zones are NOT auto-selected; require explicit previewZonesEnabled flag.

import {
  autoRedactSuggestions,
  hoveredSuggestionId,
  redactions,
  originalPdfBytes,
  setAutoRedactSuggestions,
  setHoveredSuggestionId,
  setRedactions,
  setStatus
} from "./Utils.js";

import { renderPageView, renderAllPages } from "./PDF_Loader.js";
import { pushUndo } from "./Redaction_Core.js";
import { textStore } from "./TextLayer.js";
import { getCurrentTemplate } from "./Template_UI.js";

const BACKEND_URL = "";
const USE_BACKEND = true;

// Option B — EXTENDED PII: keep strict filter ON, but broaden patterns
const STRICT_PII_ONLY = true;
const ATTEMPT_BARCODE = true;

// Toggle controlled by UI (default false). When true, layout zones are shown as suggestions.
window.previewZonesEnabled = false;

// ------------------------------------------------------------
// PREVIEW (always RED)
// ------------------------------------------------------------
export function drawAutoRedactPreviewOnView(view) {
  const ctx = view.overlay.getContext("2d");
  ctx.save();

  const suggestions = (autoRedactSuggestions || []).filter(s => s.page === view.pageNumber);

  for (const s of suggestions) {
    const hovered = s.id === hoveredSuggestionId;
    const selected = s.selected !== false;

    ctx.lineWidth = hovered ? 3 : 2;
    ctx.strokeStyle = selected
      ? (hovered ? "rgba(255,0,0,1)" : "rgba(255,0,0,0.9)")
      : "rgba(255,0,0,0.4)";

    ctx.fillStyle = selected
      ? "rgba(255,0,0,0.15)"
      : "rgba(255,0,0,0.05)";

    for (const r of s.rects || []) {
      const x = r.x0 * view.overlay.width;
      const y = r.y0 * view.overlay.height;
      const w = (r.x1 - r.x0) * view.overlay.width;
      const h = (r.y1 - r.y0) * view.overlay.height;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }

  ctx.restore();
}

// ------------------------------------------------------------
// HIT TEST
// ------------------------------------------------------------
function hitTest(view, x, y) {
  let best = null;
  let bestArea = Infinity;

  for (const s of (autoRedactSuggestions || []).filter(s => s.page === view.pageNumber)) {
    for (const r of s.rects || []) {
      const rx = r.x0 * view.overlay.width;
      const ry = r.y0 * view.overlay.height;
      const rw = (r.x1 - r.x0) * view.overlay.width;
      const rh = (r.y1 - r.y0) * view.overlay.height;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
        const area = rw * rh;
        if (area < bestArea) {
          best = s.id;
          bestArea = area;
        }
      }
    }
  }

  return best;
}

// ------------------------------------------------------------
// ATTACH HANDLERS
// ------------------------------------------------------------
export function attachAutoRedactionHandlers(view, addListener) {
  const overlay = view.overlay;

  addListener(overlay, "mousemove", e => {
    if (!autoRedactSuggestions || !autoRedactSuggestions.length) return;
    const rect = overlay.getBoundingClientRect();
    const id = hitTest(view, e.clientX - rect.left, e.clientY - rect.top);
    if (id !== hoveredSuggestionId) {
      setHoveredSuggestionId(id);
      renderPageView(view);
    }
  });

  addListener(overlay, "click", e => {
    if (!autoRedactSuggestions || !autoRedactSuggestions.length) return;
    const rect = overlay.getBoundingClientRect();
    const id = hitTest(view, e.clientX - rect.left, e.clientY - rect.top);
    if (id == null) return;

    const color = document.getElementById("redactionColor")?.value || "#000000";

    const updated = (autoRedactSuggestions || []).map(s =>
      s.id === id
        ? { ...s, selected: s.selected === false ? true : false, color }
        : s
    );

    setAutoRedactSuggestions(updated);
    renderPageView(view);

    e.stopPropagation();
    e.preventDefault();
  });
}

// ------------------------------------------------------------
// EXTENDED PII PATTERNS (frontend fallback)
// ------------------------------------------------------------
function generateStrictPII() {
  const out = [];
  let id = 0;

  // Option B — more aggressive, but still anchored around labels
  const patterns = [
    // REPORT NO (A&L style)
    { label: "REPORT_NO", regex: /\bC[0-9A-Z]{4,6}-[0-9A-Z]{4,6}\b/gi, group: "report" },

    // ACCOUNT NUMBER (3–10 digits)
    { label: "ACCOUNT_NO", regex: /ACCOUNT NUMBER[:\s]*([0-9]{3,10})/gi, group: "account" },

    // TO / CLIENT NAME (line after TO: or same line)
    { label: "CLIENT_NAME", regex: /\bTO[:\s]+([A-Z][A-Za-z0-9'’\-. ]{2,80})/g, group: "name" },

    // PHONE (client + lab)
    { label: "CLIENT_PHONE", regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, group: "phone" },

    // EMAIL
    { label: "CLIENT_EMAIL", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, group: "email" },

    // ADDRESS (looser, but still starts with number + street)
    { label: "CLIENT_ADDRESS", regex: /\b\d{1,6}\s+[A-Z][A-Za-z0-9\s,'\-.]{6,160}\b/g, group: "address" },

    // PO#
    { label: "PO_NUMBER", regex: /PO#[:\s]*([A-Za-z0-9\- ]{2,60})/gi, group: "po" },

    // CATEGORY
    { label: "CATEGORY", regex: /CATEGORY[:\s]*([A-Za-z0-9 &\/\-\(\)]{3,60})/gi, group: "category" },

    // LAB NUMBER
    { label: "LAB_NUMBER", regex: /LAB NUMBER[:\s]*([0-9A-Za-z\-]{4,20})/gi, group: "lab" },

    // SAMPLE ID
    { label: "SAMPLE_ID", regex: /SAMPLE ID[:\s]*([A-Za-z0-9\-]{3,60})/gi, group: "sample" }
  ];

  for (const page in textStore) {
    const spans = textStore[page]?.spans || [];
    for (const span of spans) {
      const text = span.text || "";
      const trimmed = text.trim();

      // ignore pure date-like spans to avoid false positives
      if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(trimmed)) continue;

      for (const p of patterns) {
        try {
          const matches = [...(text.matchAll(p.regex) || [])];
          for (const m of matches) {
            const value = m[1] || m[0];
            out.push({
              id: id++,
              page: Number(page),
              rects: [{ x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1 }],
              text: value,
              label: p.label,
              group: p.group,
              selected: true,
              color: "#000000"
            });
          }
        } catch {
          continue;
        }
      }
    }
  }

  // dedupe
  const seen = new Set();
  const dedup = [];
  for (const s of out) {
    const key = `${s.page}|${s.rects[0].x0.toFixed(4)}|${s.rects[0].y0.toFixed(4)}|${s.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(s);
    }
  }

  return dedup;
}

// ------------------------------------------------------------
// NORMALIZE BACKEND SUGGESTION
// ------------------------------------------------------------
function normalizeBackend(raw, idx) {
  const rects = (raw.rects || raw.box ? (raw.rects || [raw.box]) : []).map(r => ({
    x0: r.x0 ?? r.left ?? 0,
    y0: r.y0 ?? r.top ?? 0,
    x1: r.x1 ?? r.right ?? 0,
    y1: r.y1 ?? r.bottom ?? 0
  }));

  // Do NOT filter barcode boxes — they are often thin
  const filtered = rects;

  const group = (raw.group || raw.type || "").toString().toLowerCase();
  const isBarcodeLike =
    group.includes("barcode") ||
    group.includes("qr") ||
    (raw.type || "").toString().toLowerCase() === "barcode";

  return {
    id: idx,
    page: raw.page || raw.p || 1,
    rects: filtered,
    text: raw.text || raw.reason || raw.label || raw.value || "",
    // Ensure barcode suggestions get a label
    label: raw.rule_id ||
      raw.label ||
      (isBarcodeLike ? "BARCODE" : ""),
    group,
    selected: raw.selected !== false,
    color: raw.color || "#000000",
    type: raw.type || ""
  };
}

function isLikelyFieldLabelOnly(suggestion) {
  const text = String(suggestion?.text || "").trim();
  const label = String(suggestion?.label || "").trim();
  const candidate = text || label;
  if (!candidate) return false;
  if (/[0-9@]/.test(candidate)) return false;
  if (candidate.length > 48) return false;

  const normalized = candidate.replace(/\s+/g, " ").replace(/[:.]+$/g, "").trim().toUpperCase();
  const knownLabels = new Set([
    "REPORT NO",
    "ACCOUNT NUMBER",
    "LICENSE NUMBER",
    "TO",
    "PHONE",
    "PO#",
    "PO",
    "LAB NUMBER",
    "SAMPLE ID",
    "LOT NUMBER",
    "CLIENT NAME",
    "CLIENT PHONE",
    "CLIENT EMAIL",
    "CLIENT ADDRESS",
    "COA NUMBER",
  ]);

  return knownLabels.has(normalized);
}

function escapeRegexLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStudioRuleSuggestions(startId = 0) {
  const template = getCurrentTemplate?.();
  const studioRule = template?.studio_rule || null;
  if (!studioRule) return [];

  const suggestions = [];
  let nextId = startId;

  const learnedCoordinates = Array.isArray(studioRule.learnedCoordinates)
    ? studioRule.learnedCoordinates
    : [];

  for (const coord of learnedCoordinates) {
    const page = Number(coord.pageIndex ?? 0) + 1;
    const x = Number(coord.x ?? 0) / 100;
    const y = Number(coord.y ?? 0) / 100;
    const width = Number(coord.width ?? 0) / 100;
    const height = Number(coord.height ?? 0) / 100;

    if (width <= 0 || height <= 0) continue;

    suggestions.push({
      id: nextId++,
      page,
      rects: [{
        x0: x,
        y0: y,
        x1: x + width,
        y1: y + height
      }],
      text: coord.label || "Learned Area",
      label: coord.label || "Learned Area",
      group: "layout_zone",
      selected: true,
      color: "#000000",
      type: "layout"
    });
  }

  const patternEntries = [];
  const sensitiveTerms = Array.isArray(studioRule.sensitiveTerms) ? studioRule.sensitiveTerms : [];
  const patterns = Array.isArray(studioRule.patterns) ? studioRule.patterns : [];

  sensitiveTerms.forEach((term) => {
    const text = String(term || "").trim();
    if (!text) return;
    patternEntries.push({
      regex: new RegExp(escapeRegexLiteral(text), "i"),
      label: "SENSITIVE TERM",
      group: "client_info",
      sourceText: text
    });
  });

  patterns.forEach((pattern) => {
    const text = String(pattern || "").trim();
    if (!text) return;
    try {
      patternEntries.push({
        regex: new RegExp(text, "i"),
        label: "TRAINED PATTERN",
        group: "document_id",
        sourceText: text
      });
    } catch {
      // ignore invalid stored regex
    }
  });

  for (const page of Object.keys(textStore)) {
    const pageNumber = Number(page);
    const spans = textStore[page]?.spans || [];

    for (const span of spans) {
      const spanText = String(span.text || "").trim();
      if (!spanText) continue;

      for (const entry of patternEntries) {
        if (!entry.regex.test(spanText)) continue;
        suggestions.push({
          id: nextId++,
          page: pageNumber,
          rects: [{ x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1 }],
          text: spanText,
          label: entry.label,
          group: entry.group,
          selected: true,
          color: "#000000",
          type: "studio_rule"
        });
      }
    }
  }

  return suggestions;
}

function mergeSuggestions(base, extra) {
  const merged = [...base];
  let nextId = merged.length;

  for (const suggestion of extra) {
    const firstRect = suggestion.rects?.[0];
    if (!firstRect) continue;

    const duplicate = merged.find((existing) => {
      const existingRect = existing.rects?.[0];
      if (!existingRect) return false;
      return (
        existing.page === suggestion.page &&
        Math.abs(existingRect.x0 - firstRect.x0) < 0.002 &&
        Math.abs(existingRect.y0 - firstRect.y0) < 0.002 &&
        Math.abs(existingRect.x1 - firstRect.x1) < 0.002 &&
        Math.abs(existingRect.y1 - firstRect.y1) < 0.002
      );
    });

    if (!duplicate) {
      merged.push({ ...suggestion, id: nextId++ });
    }
  }

  return merged;
}

// ------------------------------------------------------------
// RUN AUTO REDACT
// ------------------------------------------------------------
export async function runAutoRedact(endpoint) {
  if (!originalPdfBytes || !originalPdfBytes.length) {
    setStatus("Upload a PDF first.");
    return;
  }

  const isBarcodeOnly = endpoint && endpoint.includes("auto-suggest-barcodes");
  // AI sensitivity affects how aggressive text-rule suggestions are.
  let sensitivity = 50;
  try {
    const settings = JSON.parse(localStorage.getItem("coaSettings") || "{}");
    const v = parseInt(settings.aiSensitivity ?? 50, 10);
    if (Number.isFinite(v)) sensitivity = v;
  } catch {
    // ignore
  }

  const appendSensitivity = (ep) => {
    if (!ep || typeof ep !== "string") return ep;
    if (ep.includes("sensitivity=")) return ep;
    const sep = ep.includes("?") ? "&" : "?";
    return `${ep}${sep}sensitivity=${encodeURIComponent(sensitivity)}`;
  };

  // Only apply sensitivity to text-based template suggestions.
  if (!isBarcodeOnly && endpoint && endpoint.includes("/redact/template")) {
    endpoint = appendSensitivity(endpoint);
  }

  if (isBarcodeOnly) {
    setStatus("Detecting barcodes...");
  } else {
    setStatus("Running Auto Suggest...");
  }

  const form = new FormData();
  form.append("file", new Blob([originalPdfBytes], { type: "application/pdf" }), "file.pdf");

  let raw = [];

  if (USE_BACKEND) {
    try {
      const res = await fetch(
        `${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`,
        { method: "POST", body: form }
      );
      if (res && res.ok) {
        const json = await res.json();
        raw = json.candidates || json.suggestions || json.results || [];
        if (json && json.ok && Array.isArray(json.suggestions)) {
          raw = json.suggestions;
        }
      } else {
        console.warn("Primary auto-suggest failed:", res && res.status);
      }
    } catch (e) {
      console.warn("Primary auto-suggest error:", e);
    }

    // Extra barcode call ONLY when not already in barcode-only mode
    if (ATTEMPT_BARCODE && !isBarcodeOnly) {
      try {
        const br = await fetch(
          `${BACKEND_URL}/api/redact/auto-suggest-barcodes`,
          { method: "POST", body: form }
        ).catch(() => null);
        if (br && br.ok) {
          const j = await br.json();
          const more = j.candidates || j.suggestions || j.results || [];
          raw = raw.concat(more);
        }
      } catch (e) {
        console.warn("Barcode endpoint error:", e);
      }
    }

    // OCR fallback for report number (skip for barcode-only)
    if (!isBarcodeOnly) {
      try {
        const ocrRes = await fetch(
          `${BACKEND_URL}/api/redact/ocr-report`,
          { method: "POST", body: form }
        ).catch(() => null);
        if (ocrRes && ocrRes.ok) {
          const j = await ocrRes.json();
          if (j && j.candidate) raw.push(j.candidate);
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // normalize
  let backend = (raw || [])
    .map((c, i) => normalizeBackend(c, i))
    .filter(s => (s.rects || []).length);

  // remove layout zones unless previewZonesEnabled is true
  // BUT: in barcode-only mode, keep barcode/QR zones even if previewZonesEnabled is false
  backend = backend.filter(s => {
    const label = (s.label || "").toString().toLowerCase();
    const ruleId = (s.rule_id || "").toString().toLowerCase();
    const isZone = label.includes("zone") || ruleId.includes("zone");
    const isBarcodeGroup =
      (s.group || "").includes("barcode") ||
      (s.group || "").includes("qr") ||
      (s.type || "").toLowerCase() === "barcode";

    if (isZone) {
      if (isBarcodeOnly && isBarcodeGroup) {
        return true;
      }
      if (!window.previewZonesEnabled) {
        return false;
      }
    }
    return true;
  });

  // STRICT PII filter
  if (isBarcodeOnly) {
    // Barcode mode → allow ONLY barcode/QR suggestions
    backend = backend.filter(s => {
      const g = (s.group || "").toString().toLowerCase();
      const t = (s.type || "").toString().toLowerCase();
      const l = (s.label || "").toString().toLowerCase();
      return g.includes("barcode") || g.includes("qr") || t === "barcode" || l.includes("barcode") || l.includes("qr");
    });
  } else if (STRICT_PII_ONLY) {
    // Extended PII: allow all key client identifiers + barcode
    const allowed = /report|account|license|name|phone|email|address|batch|lot|sample|coa|barcode|lab|client|po|category/;
    backend = backend.filter(s =>
      allowed.test((s.group || "") + " " + (s.label || ""))
    );
  }

  const currentTemplate = getCurrentTemplate?.();
  if (!isBarcodeOnly && currentTemplate?.studio_rule) {
    backend = backend.filter((suggestion) => !isLikelyFieldLabelOnly(suggestion));
  }

  // supplement with frontend EXTENDED PII when missing
  // NEVER add PII suggestions in barcode-only mode
  const frontend = (STRICT_PII_ONLY && !isBarcodeOnly) ? generateStrictPII() : [];
  let merged = [...backend];
  let nextId = merged.length;

  for (const f of frontend) {
    const dup = merged.find(
      m =>
        m.page === f.page &&
        m.text === f.text &&
        (m.rects || []).some(
          r =>
            Math.abs(r.x0 - f.rects[0].x0) < 0.001 &&
            Math.abs(r.y0 - f.rects[0].y0) < 0.001
        )
    );
    if (!dup) {
      f.id = nextId++;
      merged.push(f);
    }
  }

  if (!isBarcodeOnly) {
    const studioSuggestions = buildStudioRuleSuggestions(nextId);
    merged = mergeSuggestions(merged, studioSuggestions);
  }

  setAutoRedactSuggestions(merged);
  const btnApply = document.getElementById("btnAutoApply");
  const btnClear = document.getElementById("btnAutoClear");
  if (btnApply) btnApply.disabled = merged.length === 0;
  if (btnClear) btnClear.disabled = merged.length === 0;

  // Render AI suggestions list
  renderAiSuggestionsList();

  await renderAllPages();
  setStatus(isBarcodeOnly ? "Barcode detection complete." : "Auto-suggestions ready.");
}

// ------------------------------------------------------------
// APPLY (always BLACK)
// ------------------------------------------------------------
export async function applyAutoRedactions() {
  const selected = (autoRedactSuggestions || []).filter(s => s.selected !== false);
  if (!selected.length) {
    setStatus("No auto-redaction suggestions selected.");
    return;
  }

  // Continuous offline learning:
  // When user confirms/apply selected auto-suggestions, we store examples locally per company.
  try {
    const companySelect = document.getElementById("companySelect");
    const companyId = companySelect?.value;
    if (companyId) {
      const displayName = companySelect?.selectedOptions?.[0]?.text || companyId;
      const items = selected.slice(0, 60).map(s => ({
        label: s.label || s.group || "UNKNOWN",
        group: s.group || "",
        sample_text: s.text || s.label || "",
        rects: s.rects || [],
        page: s.page || 1
      }));

      // Fire-and-forget (don't block redaction apply).
      void fetch(`${BACKEND_URL}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          display_name: displayName,
          items
        })
      }).then(() => {
        // optional: keep silent to avoid noisy UI
      }).catch(() => {
        // ignore training errors (redaction still proceeds)
      });
    }
  } catch {
    // ignore training errors (redaction still proceeds)
  }

  pushUndo();
  const newMap = structuredClone(redactions || {});

  for (const s of selected) {
    const page = s.page;
    if (!newMap[page]) newMap[page] = [];
    newMap[page].push({
      page,
      type: "auto",
      rects: s.rects,
      color: s.color || document.getElementById("redactionColor")?.value || "#000000"
    });
  }

  setRedactions(newMap);
  setAutoRedactSuggestions([]);
  setHoveredSuggestionId(null);

  const btnApply = document.getElementById("btnAutoApply");
  const btnClear = document.getElementById("btnAutoClear");
  if (btnApply) btnApply.disabled = true;
  if (btnClear) btnClear.disabled = true;

  // Update AI suggestions list
  renderAiSuggestionsList();

  await renderAllPages();
  setStatus("Auto-redaction suggestions applied.");
}

// ------------------------------------------------------------
// CLEAR
// ------------------------------------------------------------
export async function clearAutoRedactions() {
  setAutoRedactSuggestions([]);
  setHoveredSuggestionId(null);
  const btnApply = document.getElementById("btnAutoApply");
  const btnClear = document.getElementById("btnAutoClear");
  if (btnApply) btnApply.disabled = true;
  if (btnClear) btnClear.disabled = true;
  
  // Hide suggestions container
  const container = document.getElementById("aiSuggestionsContainer");
  if (container) container.classList.add("hidden");
  
  // Clear suggestions list
  const list = document.getElementById("aiSuggestionsList");
  if (list) list.innerHTML = "";
  
  await renderAllPages();
  setStatus("Auto-redaction suggestions cleared.");
}

// ------------------------------------------------------------
// RENDER AI SUGGESTIONS LIST
// ------------------------------------------------------------
export function renderAiSuggestionsList() {
  const container = document.getElementById("aiSuggestionsContainer");
  const list = document.getElementById("aiSuggestionsList");
  const btnApplyAll = document.getElementById("btnApplyAllSuggestions");
  const btnClearAll = document.getElementById("btnClearAllSuggestions");
  
  if (!container || !list) return;
  
  const suggestions = autoRedactSuggestions || [];
  
  if (suggestions.length === 0) {
    container.classList.add("hidden");
    list.innerHTML = "";
    if (btnApplyAll) btnApplyAll.disabled = true;
    if (btnClearAll) btnClearAll.disabled = true;
    return;
  }
  
  // Show container
  container.classList.remove("hidden");
  
  // Render suggestions
  list.innerHTML = suggestions.map(s => `
    <div class="ai-suggestion-item ${s.selected !== false ? 'selected' : ''}" data-id="${s.id}">
      <div class="ai-suggestion-header">
        <span class="ai-suggestion-label">${s.label || s.group || 'Unknown'}</span>
        <span class="ai-suggestion-page">Page ${s.page}</span>
      </div>
      <div class="ai-suggestion-text" title="${s.text || ''}">${s.text || 'No text'}</div>
      <div class="ai-suggestion-actions">
        <button class="btn btn-ghost btn-small btn-toggle-suggestion" data-id="${s.id}" data-tooltip="Toggle selection">
          <i data-lucide="${s.selected !== false ? 'check-square' : 'square'}" class="icon-14"></i>
          ${s.selected !== false ? 'Selected' : 'Select'}
        </button>
        <button class="btn btn-primary btn-small btn-apply-suggestion" data-id="${s.id}" data-tooltip="Apply this redaction">
          <i data-lucide="check" class="icon-14"></i>
          Apply
        </button>
      </div>
    </div>
  `).join('');
  
  // Update buttons state
  const selectedCount = suggestions.filter(s => s.selected !== false).length;
  if (btnApplyAll) btnApplyAll.disabled = selectedCount === 0;
  if (btnClearAll) btnClearAll.disabled = suggestions.length === 0;
  
  // Re-initialize lucide icons
  if (window.lucide) window.lucide.createIcons();
}

// ------------------------------------------------------------
// APPLY SINGLE SUGGESTION
// ------------------------------------------------------------
export async function applySingleSuggestion(suggestionId) {
  const suggestions = autoRedactSuggestions || [];
  const suggestion = suggestions.find(s => s.id === suggestionId);
  if (!suggestion) return;
  
  // Create redaction for this suggestion
  pushUndo();
  const newMap = structuredClone(redactions || {});
  const page = suggestion.page;
  if (!newMap[page]) newMap[page] = [];
  
  newMap[page].push({
    page,
    type: "auto",
    rects: suggestion.rects,
    color: suggestion.color || document.getElementById("redactionColor")?.value || "#000000"
  });
  
  setRedactions(newMap);
  
  // Remove the suggestion from the list
  const updatedSuggestions = suggestions.filter(s => s.id !== suggestionId);
  setAutoRedactSuggestions(updatedSuggestions);
  setHoveredSuggestionId(null);
  
  // Update UI
  await renderAllPages();
  renderAiSuggestionsList();
  
  // Update main buttons
  const btnApply = document.getElementById("btnAutoApply");
  const btnClear = document.getElementById("btnAutoClear");
  if (btnApply) btnApply.disabled = updatedSuggestions.length === 0;
  if (btnClear) btnClear.disabled = updatedSuggestions.length === 0;
  
  setStatus("Suggestion applied.");
}

// ------------------------------------------------------------
// TOGGLE SUGGESTION SELECTION
// ------------------------------------------------------------
export function toggleSuggestionSelection(suggestionId) {
  const suggestions = autoRedactSuggestions || [];
  const updated = suggestions.map(s =>
    s.id === suggestionId
      ? { ...s, selected: s.selected === false ? true : false }
      : s
  );
  
  setAutoRedactSuggestions(updated);
  renderAiSuggestionsList();
  
  // Update main buttons
  const btnApply = document.getElementById("btnAutoApply");
  const btnClear = document.getElementById("btnAutoClear");
  const selectedCount = updated.filter(s => s.selected !== false).length;
  if (btnApply) btnApply.disabled = selectedCount === 0;
  if (btnClear) btnClear.disabled = updated.length === 0;
  
  // Re-render pages to update selection visuals
  renderAllPages();
}

// ------------------------------------------------------------
// INITIALIZE AI SUGGESTIONS UI
// ------------------------------------------------------------
export function initAiSuggestionsUI() {
  // Event delegation for suggestion buttons
  document.addEventListener("click", async (e) => {
    // Apply single suggestion
    if (e.target.closest(".btn-apply-suggestion")) {
      const button = e.target.closest(".btn-apply-suggestion");
      const suggestionId = parseInt(button.dataset.id);
      if (!isNaN(suggestionId)) {
        await applySingleSuggestion(suggestionId);
      }
    }
    
    // Toggle suggestion selection
    if (e.target.closest(".btn-toggle-suggestion")) {
      const button = e.target.closest(".btn-toggle-suggestion");
      const suggestionId = parseInt(button.dataset.id);
      if (!isNaN(suggestionId)) {
        toggleSuggestionSelection(suggestionId);
      }
    }
    
    // Apply all selected suggestions
    if (e.target.closest("#btnApplyAllSuggestions")) {
      await applyAutoRedactions();
    }
    
    // Clear all suggestions
    if (e.target.closest("#btnClearAllSuggestions")) {
      await clearAutoRedactions();
    }
    
    // Close suggestions container
    if (e.target.closest("#btnCloseSuggestions")) {
      const container = document.getElementById("aiSuggestionsContainer");
      if (container) container.classList.add("hidden");
    }
  });
  
  // Show suggestions container when auto-suggest button is clicked
  const btnAutoSuggest = document.getElementById("btnAutoSuggest");
  if (btnAutoSuggest) {
    btnAutoSuggest.addEventListener("click", () => {
      // Container will be shown when suggestions are generated
      // via runAutoRedact -> renderAiSuggestionsList
    });
  }
}
