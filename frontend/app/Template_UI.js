import {
  setStatus,
  pageViews,
  setCurrentCompany,
  autoRedactSuggestions,
  showToast
} from "./Utils.js";

import { saveSelectedAsRule } from "./SaveRule.js";

const BACKEND_URL = "";

let currentTemplate = null;

export function getCurrentTemplate() {
  return currentTemplate;
}

export async function loadTemplateForCompany(companyId) {
  if (!companyId) {
    setStatus("No company selected.");
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/templates/${companyId}`);
    if (!res.ok) {
      setStatus("Failed to fetch template from server.");
      console.error("Template fetch failed:", res.status, await res.text());
      return;
    }

    const data = await res.json();
    data.rules = Array.isArray(data.rules) ? data.rules : [];
    data.zones = Array.isArray(data.zones) ? data.zones : [];
    data.manual_presets = data.manual_presets || {};
    data.studio_rule = data.studio_rule || {};

    currentTemplate = data;
    renderTemplateSidebar(data);
    applyManualPresets(data);

    setCurrentCompany(data.company_id, data.display_name || data.company_id);
    setStatus(`Loaded template for ${data.display_name || data.company_id}.`);
    showToast(`Loaded template for ${data.display_name || data.company_id}`);
  } catch (err) {
    console.error("Template load failed:", err);
    setStatus("Failed to load template.");
  }
}

function applyManualPresets(template) {
  const presets = template.manual_presets || {};

  if (presets.default_color) {
    const colorInput = document.getElementById("redactionColor");
    if (colorInput) colorInput.value = presets.default_color;
  }

  if (presets.default_mode) {
    window.__DEFAULT_REDACTION_MODE = presets.default_mode;
  }

  if (presets.default_annotation) {
    window.__DEFAULT_ANNOTATION_TOOL = presets.default_annotation;
  }
}

export function renderTemplateSidebar(template) {
  const sidebar = document.getElementById("templateSidebar");
  if (!sidebar) return;

  const rules = Array.isArray(template.rules) ? template.rules : [];
  const zones = Array.isArray(template.zones) ? template.zones : [];
  const studioRule = template.studio_rule || {};
  const sensitiveTerms = Array.isArray(studioRule.sensitiveTerms)
    ? studioRule.sensitiveTerms
    : (Array.isArray(template.sensitive_terms) ? template.sensitive_terms : []);
  const learnedCoordinates = Array.isArray(studioRule.learnedCoordinates)
    ? studioRule.learnedCoordinates
    : [];

  sidebar.innerHTML = `
    <h3>${template.display_name || "Template"}</h3>

    ${
      studioRule.name || sensitiveTerms.length || learnedCoordinates.length
        ? `
      <h4>Studio Rule</h4>
      <div class="empty-note">${studioRule.description || "Imported Redection-studio rule structure."}</div>
      <div class="empty-note">Sensitive Terms: ${sensitiveTerms.length}</div>
      <div class="empty-note">Learned Coordinates: ${learnedCoordinates.length}</div>
      `
        : ``
    }

    <h4>Auto-Redaction Rules</h4>
    <div id="ruleList">
      ${
        rules.length
          ? rules.map(
              (r) => `
          <div class="rule-item">
            <input type="checkbox" class="rule-toggle" data-rule="${r.id}" checked />
            <span>${r.id}</span>
          </div>
        `
            ).join("")
          : `<div class="empty-note">No rules defined.</div>`
      }
    </div>

    <h4>Zones</h4>
    <div id="zoneList">
      ${
        zones.length
          ? zones.map(
              (z) => `
          <div class="zone-item">
            <button class="zone-preview-btn" data-zone="${z.id}">
              Preview Zone: ${z.id}
            </button>
          </div>
        `
            ).join("")
          : `<div class="empty-note">No zones defined.</div>`
      }
    </div>
  `;

  attachRuleToggleHandlers();
  attachZonePreviewHandlers(template);
  attachSaveRuleHandler();
}

function attachRuleToggleHandlers() {
  const toggles = document.querySelectorAll(".rule-toggle");
  if (!toggles) return;

  toggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      if (!currentTemplate || !Array.isArray(currentTemplate.rules)) return;

      const ruleId = toggle.dataset.rule;
      const enabled = toggle.checked;
      const rule = currentTemplate.rules.find((r) => r.id === ruleId);
      if (rule) rule.enabled = enabled;

      setStatus(`Rule ${ruleId} ${enabled ? "enabled" : "disabled"}.`);
    });
  });
}

function attachZonePreviewHandlers(template) {
  const buttons = document.querySelectorAll(".zone-preview-btn");
  if (!buttons) return;

  const zones = Array.isArray(template.zones) ? template.zones : [];
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const zoneId = btn.dataset.zone;
      const zone = zones.find((z) => z.id === zoneId);
      if (!zone) return;
      previewZone(zone);
    });
  });
}

function previewZone(zone) {
  if (!zone || !zone.rect) return;

  const view = pageViews.find((v) => v.pageNumber === zone.page);
  if (!view || !view.overlay || !view.viewport) return;

  const ctx = view.overlay.getContext("2d");
  if (!ctx) return;

  const { viewport } = view;
  const { x0, y0, x1, y1 } = zone.rect;

  ctx.save();
  ctx.strokeStyle = "rgba(0, 150, 255, 0.9)";
  ctx.lineWidth = 3;

  const x = x0 * viewport.width;
  const y = y0 * viewport.height;
  const w = (x1 - x0) * viewport.width;
  const h = (y1 - y0) * viewport.height;

  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  setStatus(`Previewed zone: ${zone.id}`);
}

function attachSaveRuleHandler() {
  const btn = document.getElementById("btnSaveRule");
  if (!btn || btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";

  btn.addEventListener("click", async () => {
    const suggestions = autoRedactSuggestions || [];
    const selected = suggestions.filter((s) => s.selected !== false);

    if (!selected.length) {
      setStatus("No suggestions selected to save as rule.");
      showToast("No suggestions selected to save as rule.");
      return;
    }

    try {
      setStatus("Saving selected suggestions as rule...");
      showToast("Saving selected suggestions as rule...");
      await saveSelectedAsRule({
        companyId: document.getElementById("companySelect")?.value || null,
        displayName: document.getElementById("companySelect")?.selectedOptions?.[0]?.text || null,
        suggestions: selected
      });
      setStatus("Saved rule to server.");
      showToast("Saved rule to server.");
    } catch (err) {
      console.error("Save rule failed:", err);
      setStatus("Failed to save rule.");
      showToast("Failed to save rule.");
    }
  });
}
