// frontend/app/Events.js
// Clean, conflict‑free version using ONLY the floating search bar

import {
  pageViews,
  searchResults,
  searchIndex,
  highlightMode,
  redactions,
  undoStack,
  redoStack,
  autoRedactSuggestions,
  setSearchIndex,
  setHighlightMode,
  setRedactions,
  setSelectionMode,
  selectionMode,
  setStatus,
  originalPdfBytes,
  setAutoRedactSuggestions,
  currentPageVisible,
  showToast
} from "./Utils.js";

import { performSearch, updateSearchInfo, scrollToSearchResult } from "./Search.js";
import { initFileIO } from "./FileIO.js";
import { attachTextSelectionHandlers } from "./Redaction_TextSelect.js";
import { attachBoxRedactionHandlers } from "./Redaction_Box.js";
import {
  attachAutoRedactionHandlers,
  runAutoRedact,
  applyAutoRedactions,
  clearAutoRedactions,
  initAiSuggestionsUI,
  renderAiSuggestionsList
} from "./Redaction_Auto.js";
import { attachHighlightHandlers } from "./Redaction_Highlight.js";

import { detectCompanyFromBackend } from "./Template_Detect_Backend.js";
import { loadTemplateForCompany } from "./Template_UI.js";

import { toggleReviewMode, toggleShowOnlyAuto } from "./Review_Mode.js";
import { initZoomControls } from "./Zoom_Pan.js";

import { pushUndo, restoreState } from "./Redaction_Core.js";
import { renderAllPages } from "./PDF_Loader.js";
import { setAnnotationTool, AnnotationTool } from "./AnnotationEngine.js";

// ------------------------------------------------------------
// DOM references (FLOATING SEARCH ONLY)
// ------------------------------------------------------------
const floatingSearch = document.getElementById("floatingSearchBar");
const searchToggle = document.getElementById("searchToggle");
const btnCloseSearch = document.getElementById("btnCloseSearch");
const searchInput = document.getElementById("searchInput");

const btnSearchPrevFloating = document.querySelector("#floatingSearchBar #btnSearchPrev");
const btnSearchNextFloating = document.querySelector("#floatingSearchBar #btnSearchNext");
const btnSearchRedactAllFloating = document.querySelector("#floatingSearchBar #btnSearchRedactAll");

const viewerPanel = document.querySelector(".viewer-panel");

// ------------------------------------------------------------
// Attach per-page handlers
// ------------------------------------------------------------
let registeredListeners = [];
export function addListener(target, event, handler) {
  if (!target) return;
  target.addEventListener(event, handler);
  registeredListeners.push({ target, event, handler });
}
export function cleanupListeners() {
  for (const { target, event, handler } of registeredListeners) {
    target.removeEventListener(event, handler);
  }
  registeredListeners = [];
}

export function attachHandlersToPageViews() {
  cleanupListeners();
  for (const view of pageViews) {
    attachTextSelectionHandlers(view, addListener);
    attachBoxRedactionHandlers(view, addListener);
    attachHighlightHandlers(view, addListener);
    attachAutoRedactionHandlers(view, addListener);
  }
}

// ------------------------------------------------------------
// Floating Search Bar (Adobe‑style)
// ------------------------------------------------------------
function initFloatingSearchUI() {
  if (!floatingSearch || !searchToggle || !searchInput) return;

  // Open search bar
  searchToggle.addEventListener("click", () => {
    floatingSearch.classList.remove("hidden");   // ⭐ FIX
    floatingSearch.classList.add("active");
    searchInput.focus();
  });

  // Close search bar
  btnCloseSearch?.addEventListener("click", () => {
    floatingSearch.classList.remove("active");
  });

  // Sticky behavior
  viewerPanel.addEventListener("scroll", () => {
    if (window.__DISABLE_STICKY_SEARCH) return;

    if (viewerPanel.scrollTop > 40) {
      floatingSearch.style.position = "fixed";
      floatingSearch.style.top = "10px";
    } else {
      floatingSearch.style.position = "absolute";
      floatingSearch.style.top = "0px";
    }
  });

  // Live search
  searchInput.addEventListener("input", () => {
    performSearch();
  });

  // Enter → search, Esc → close
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") performSearch();
    if (e.key === "Escape") floatingSearch.classList.remove("active");
  });
}

// ------------------------------------------------------------
// Floating Search Buttons (Prev / Next / Redact All)
// ------------------------------------------------------------
function initFloatingSearchControls() {
  if (btnSearchPrevFloating) {
    btnSearchPrevFloating.addEventListener("click", () => {
      if (!searchResults.length) return;
      let idx = searchIndex - 1;
      if (idx < 0) idx = searchResults.length - 1;
      setSearchIndex(idx);
      scrollToSearchResult(searchResults[idx]);
      updateSearchInfo();
    });
  }

  if (btnSearchNextFloating) {
    btnSearchNextFloating.addEventListener("click", () => {
      if (!searchResults.length) return;
      let idx = searchIndex + 1;
      if (idx >= searchResults.length) idx = 0;
      setSearchIndex(idx);
      scrollToSearchResult(searchResults[idx]);
      updateSearchInfo();
    });
  }

  if (btnSearchRedactAllFloating) {
    btnSearchRedactAllFloating.addEventListener("click", () => {
      if (!searchResults.length) return;

      pushUndo();
      const map = structuredClone(redactions || {});

      for (const r of searchResults) {
        const page = r.page;
        if (!map[page]) map[page] = [];
        map[page].push({
          page,
          type: "search",
          rects: r.rects,
          color: "#000000"
        });
      }

      setRedactions(map);
      renderAllPages();
      setStatus("Search matches redacted.");
      showToast("Search matches redacted");
    });
  }
}

// ------------------------------------------------------------
// Highlight toggle
// ------------------------------------------------------------
function initHighlightToggle() {
  const btn = document.getElementById("btnToggleHighlight");
  if (!btn) return;

  btn.addEventListener("click", () => {
    setSelectionMode("highlight");

    // UI state
    btn.classList.add("btn-toggle-active");

    // Turn off other modes
    document.getElementById("btnModeDrawBox")?.classList.remove("btn-toggle-active");
    document.getElementById("btnModeSelectText")?.classList.remove("btn-toggle-active");

    setStatus("Highlight mode enabled");
  });
}

// ------------------------------------------------------------
// Mode buttons (text vs box)
// ------------------------------------------------------------
function initModeButtons() {
  const btnText = document.getElementById("btnModeSelectText");
  const btnBox = document.getElementById("btnModeDrawBox");

  if (btnText) {
    btnText.addEventListener("click", () => {
      setSelectionMode("text");
      btnText.classList.add("btn-toggle-active");
      btnBox?.classList.remove("btn-toggle-active");
    });
  }

  if (btnBox) {
    btnBox.addEventListener("click", () => {
      setSelectionMode("box");
      btnBox.classList.add("btn-toggle-active");
      btnText?.classList.remove("btn-toggle-active");
    });
  }
}

// ------------------------------------------------------------
// Auto‑redaction buttons
// ------------------------------------------------------------
function initAutoButtons() {
  const btnAutoSuggest = document.getElementById("btnAutoSuggest");
  const btnAutoBarcodes = document.getElementById("btnAutoBarcodes");
  const btnAutoApply = document.getElementById("btnAutoApply");
  const btnAutoClear = document.getElementById("btnAutoClear");

  // Initialize AI suggestions UI
  initAiSuggestionsUI();

  if (btnAutoSuggest) {
    btnAutoSuggest.addEventListener("click", async () => {
      if (!originalPdfBytes?.length) {
        showToast("Upload a PDF first.");
        return;
      }
      const companyId = document.getElementById("companySelect")?.value;
      const endpoint = companyId
        ? `/redact/template?company_id=${encodeURIComponent(companyId)}`
        : "/redact/template";
      setStatus("Running template-based auto-suggest...");
      await runAutoRedact(endpoint);
    });
  }

  if (btnAutoBarcodes) {
    btnAutoBarcodes.addEventListener("click", async () => {
      if (!originalPdfBytes?.length) {
        showToast("Upload a PDF first.");
        return;
      }
      setStatus("Detecting barcodes...");
      await runAutoRedact("/api/redact/auto-suggest-barcodes");
    });
  }

  if (btnAutoApply) {
    btnAutoApply.addEventListener("click", async () => {
      await applyAutoRedactions();
    });
  }

  if (btnAutoClear) {
    btnAutoClear.addEventListener("click", async () => {
      await clearAutoRedactions();
    });
  }
}

// ------------------------------------------------------------
// Undo / Redo
// ------------------------------------------------------------
function initUndoRedo() {
  const btnUndo = document.getElementById("btnUndo");
  const btnRedo = document.getElementById("btnRedo");

  if (btnUndo) {
    btnUndo.addEventListener("click", () => {
      if (!undoStack.length) return;
      restoreState(undoStack, redoStack);
      setStatus("Undo.");
    });
  }

  if (btnRedo) {
    btnRedo.addEventListener("click", () => {
      if (!redoStack.length) return;
      restoreState(redoStack, undoStack);
      setStatus("Redo.");
    });
  }
}

// ------------------------------------------------------------
// Company detection
// ------------------------------------------------------------
function initCompanyDetection() {
  const btn = document.getElementById("btnDetectCompany");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!originalPdfBytes?.length) {
      showToast("Upload a PDF first.");
      return;
    }
    setStatus("Detecting company...");
    const cid = await detectCompanyFromBackend();
    if (cid) {
      await loadTemplateForCompany(cid);
      showToast(`Loaded template for ${cid}`);
    }
  });
}

// ------------------------------------------------------------
// Tools / Plugins switcher (right panel)
// ------------------------------------------------------------
function initToolsPluginsTabs() {
  const btnToolsTab = document.getElementById("btnToolsTab");
  const btnPluginsTab = document.getElementById("btnPluginsTab");
  const toolsPanel = document.getElementById("toolsModePanel");
  const pluginsPanel = document.getElementById("pluginsModePanel");

  if (!btnToolsTab || !btnPluginsTab || !toolsPanel || !pluginsPanel) return;

  const setMode = mode => {
    const isTools = mode === "tools";
    toolsPanel.classList.toggle("hidden", !isTools);
    pluginsPanel.classList.toggle("hidden", isTools);

    btnToolsTab.classList.toggle("btn-toggle-active", isTools);
    btnPluginsTab.classList.toggle("btn-toggle-active", !isTools);

    btnToolsTab.setAttribute("aria-selected", String(isTools));
    btnPluginsTab.setAttribute("aria-selected", String(!isTools));
  };

  btnToolsTab.addEventListener("click", () => setMode("tools"));
  btnPluginsTab.addEventListener("click", () => setMode("plugins"));

  // Ensure consistent initial state
  const initialToolsActive = !pluginsPanel.classList.contains("hidden");
  setMode(initialToolsActive ? "plugins" : "tools");
}

// ------------------------------------------------------------
// Keyboard shortcuts (Stirling-PDF style core subset)
// ------------------------------------------------------------
function initKeyboardShortcuts() {
  window.addEventListener("keydown", e => {
    const key = (e.key || "").toLowerCase();
    const activeTag = (document.activeElement?.tagName || "").toUpperCase();
    const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT" || document.activeElement?.isContentEditable;

    // Undo/redo + Ctrl+F should work even while typing in most cases.
    const isCtrlCombo = e.ctrlKey || e.metaKey;

    // Ctrl+Z → Undo
    if (isCtrlCombo && !e.shiftKey && key === "z") {
      e.preventDefault();
      restoreState(undoStack, redoStack);
      return;
    }

    // Ctrl+Y OR Ctrl+Shift+Z → Redo
    if (isCtrlCombo && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      restoreState(redoStack, undoStack);
      return;
    }

    // Ctrl+F → Focus search
    if (isCtrlCombo && key === "f") {
      e.preventDefault();
      floatingSearch?.classList?.remove("hidden");
      floatingSearch?.classList?.add("active");
      searchInput?.focus();
      return;
    }

    // Tool shortcuts (T/B/H) only when not typing
    if (isTyping || isCtrlCombo) return;

    if (key === "t") {
      setSelectionMode("text");
      document.getElementById("btnModeSelectText")?.classList.add("btn-toggle-active");
      document.getElementById("btnModeDrawBox")?.classList.remove("btn-toggle-active");
      document.getElementById("btnToggleHighlight")?.classList.remove("btn-toggle-active");
      setStatus("Text redaction tool.");
      return;
    }

    if (key === "b") {
      setSelectionMode("box");
      document.getElementById("btnModeDrawBox")?.classList.add("btn-toggle-active");
      document.getElementById("btnModeSelectText")?.classList.remove("btn-toggle-active");
      document.getElementById("btnToggleHighlight")?.classList.remove("btn-toggle-active");
      setStatus("Box redaction tool.");
      return;
    }

    if (key === "h") {
      // Toggle highlight tool
      const next = selectionMode === "highlight" ? "box" : "highlight";
      setSelectionMode(next);

      if (next === "highlight") {
        document.getElementById("btnToggleHighlight")?.classList.add("btn-toggle-active");
        document.getElementById("btnModeDrawBox")?.classList.remove("btn-toggle-active");
        document.getElementById("btnModeSelectText")?.classList.remove("btn-toggle-active");
        setStatus("Highlight mode enabled.");
      } else {
        document.getElementById("btnToggleHighlight")?.classList.remove("btn-toggle-active");
        document.getElementById("btnModeDrawBox")?.classList.add("btn-toggle-active");
        setStatus("Box redaction tool enabled.");
      }
      return;
    }
  });
}

// ------------------------------------------------------------
// initApp — called from app.js
// ------------------------------------------------------------
export function initApp() {
  initFileIO();

  initFloatingSearchUI();
  initFloatingSearchControls();
  initHighlightToggle();
  initModeButtons();
  initAutoButtons();
  initUndoRedo();
  initCompanyDetection();
  initToolsPluginsTabs();
  initKeyboardShortcuts();

  initZoomControls();

  window.attachHandlersToPageViews = attachHandlersToPageViews;

  document.addEventListener("pages-rendered", () => {
    attachHandlersToPageViews();
  });

  setStatus("Ready.");
}
