// ------------------------------------------------------------
// app.js — Main entry point for Redectio
// ------------------------------------------------------------

// Load PDF.js worker config
import "./pdfjs/pdf-init.js";

// Central event wiring
import { initApp } from "./app/Events.js";
import { initRuleDefinePage } from "./app/RuleDefine.js";

// Export loadPDF for FileIO.js
export { loadPDF } from "./app/PDF_Loader.js";

// Alerts
import { showAlert } from "./app/alert.js";
window.showAlert = showAlert;

// Optional: expose SaveRule globally
import { saveSelectedAsRule } from "./app/SaveRule.js";
window.saveSelectedAsRule = saveSelectedAsRule;

// UI tabs
import "./app/tabs.js";

// Search suggestions
import { initSearchSuggestions } from "./app/search_suggestions.js";

// Template list loader
import { loadCompanyList } from "./app/Template_List.js";

// Plugin system
import { loadPluginsIntoUI, runPlugin } from "./app/plugin.js";
window.runPlugin = runPlugin; // optional: expose globally if needed

// Performance optimizations
import { initPerformanceOptimizations } from "./app/performance.js";

// ------------------------------------------------------------
// Apply settings (color, highlight, sticky search, theme, density)
// ------------------------------------------------------------
function applySettings() {
  const settings = JSON.parse(localStorage.getItem("coaSettings") || "{}");

  // Theme + density (so home page matches Settings)
  if (settings.theme) {
    document.body.dataset.theme = settings.theme;
  }
  if (settings.density) {
    document.body.dataset.density = settings.density;
  }

  // Default redaction color
  if (settings.defaultColor) {
    const colorInput = document.getElementById("redactionColor");
    if (colorInput) colorInput.value = settings.defaultColor;
  }

  // Auto highlight toggle
  if (settings.autoHighlight === false) {
    const btn = document.getElementById("btnToggleHighlight");
    if (btn) btn.classList.remove("btn-toggle-active");
  }

  // Sticky search toggle (if user disables it)
  if (settings.stickySearch === false) {
    window.__DISABLE_STICKY_SEARCH = true;
  }
}

// Update settings when redaction color is changed in tools panel
function setupRedactionColorSync() {
  const redactionColorInput = document.getElementById("redactionColor");
  if (!redactionColorInput) return;

  redactionColorInput.addEventListener("input", () => {
    const settings = JSON.parse(localStorage.getItem("coaSettings") || "{}");
    settings.defaultColor = redactionColorInput.value;
    localStorage.setItem("coaSettings", JSON.stringify(settings));
    
    // Also update the settings panel color picker if it's visible
    const settingsColorInput = document.getElementById("settingDefaultColor");
    if (settingsColorInput) {
      settingsColorInput.value = redactionColorInput.value;
    }
  });
}

// ------------------------------------------------------------
// Public init called AFTER layout/partials are loaded
// ------------------------------------------------------------
export function initFrontend() {
  console.log("Rasesh COAs PDF Redaction App Loaded");

  // Initialize performance optimizations
  initPerformanceOptimizations();

  // Apply user settings FIRST
  applySettings();

  const page = document.body?.dataset?.page || "redaction";

  if (page === "rule-define") {
    initRuleDefinePage();
    return;
  }

  if (page === "settings") {
    return;
  }

  // Initialize full application
  initApp();

  // Build search suggestions index
  initSearchSuggestions();

  // Populate company dropdown
  loadCompanyList();

  // Load plugin buttons into Tools panel
  loadPluginsIntoUI();

  // Sync redaction color between tools panel and settings
  setupRedactionColorSync();
}
