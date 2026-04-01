// app/layout.js

import { initFrontend } from "../app.js";
import { initThumbnailSidebar } from "./ThumbnailSidebar.js";

async function loadPartial(id, path) {
  const container = document.getElementById(id);
  if (!container) return;

  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.error("[layout] FAILED to load:", path, res.status);
      return;
    }
    container.innerHTML = await res.text();
    console.log("[layout] loaded:", path);
  } catch (err) {
    console.error("[layout] error fetching", path, err);
  }
}

async function initLayout() {
  const currentPage = document.body?.dataset?.page || "";
  const isSettings = currentPage === "settings" || window.location.pathname.includes("settings.html");
  const isRuleDefine = currentPage === "rule-define" || window.location.pathname.includes("rule-define.html");
  const isRedaction = currentPage === "redaction" || window.location.pathname.includes("redaction.html");
  const useStudioLayout = isRuleDefine || isRedaction;
  const inHtmlFolder = window.location.pathname.includes("/html/");
  const partialPrefix = inHtmlFolder ? "../" : "";
  const homeHref = inHtmlFolder ? "../index.html" : "index.html";
  const redactionHref = inHtmlFolder ? "./redaction.html" : "html/redaction.html";
  const batchHref = inHtmlFolder ? "./batch-redaction.html" : "html/batch-redaction.html";
  const aiTrainingHref = inHtmlFolder ? "./training.html" : "html/training.html";
  const ruleDefineHref = inHtmlFolder ? "./rule-define.html" : "html/rule-define.html";
  const settingsHref = inHtmlFolder ? "settings.html" : "html/settings.html";

  // HEADER - load for all pages
  await loadPartial("base-header", `${partialPrefix}html/base/header.html`);

  // SIDEBAR + TOOLS
  if (isSettings) {
    await loadPartial("base-sidebar", `${partialPrefix}html/base/sidebar-nav.html`);
  } else if (useStudioLayout) {
    // For studio layout pages (rule-define, redaction)
    if (isRedaction) {
      // Redaction needs full sidebar with upload and tools panel
      await loadPartial("base-sidebar", `${partialPrefix}html/base/sidebar-full.html`);
      await loadPartial("base-tools", `${partialPrefix}html/base/tools.html`);
    } else {
      // Rule-define uses simplified sidebar
      await loadPartial("base-sidebar", `${partialPrefix}html/base/sidebar-nav.html`);
    }
  } else {
    await loadPartial("base-sidebar", `${partialPrefix}html/base/sidebar-full.html`);
    await loadPartial("base-tools", `${partialPrefix}html/base/tools.html`);
  }

  // FOOTER - only load for non-studio layout pages
  if (!useStudioLayout) {
    await loadPartial("base-footer", `${partialPrefix}html/base/footer.html`);
  }

  // Sidebar collapse
  document.addEventListener("click", e => {
    if (e.target.closest("#btnCollapseSidebar")) {
      document.body.classList.toggle("sidebar-collapsed");
    }
  });

  // Home button (logo)
  document.getElementById("btnHome")?.addEventListener("click", () => {
    window.location.href = homeHref;
  });

  // Floating sidebar mode
  document.addEventListener("keydown", e => {
    if (e.key === "`") {
      document.body.classList.toggle("sidebar-floating");
    }
  });

  // Initialize app AFTER layout is ready
  // Ensure Lucide icons render for any dynamically-loaded partials.
  if (window.lucide) window.lucide.createIcons();
  initFrontend();
  
  // Initialize thumbnail sidebar for redaction page
  if (isRedaction) {
    initThumbnailSidebar();
  }

  // Navigation highlight + routing
  const navButtons = document.querySelectorAll(".nav-item[data-nav], .training-nav-link[data-nav], .footer-link");
  navButtons.forEach(btn => {
    const target = btn.dataset.nav || btn.textContent.toLowerCase().replace(" ", "-");
    btn.classList.remove("nav-item-active");
    btn.classList.remove("active");
    const activeMap = {
      "home": currentPage === "home",
      "redaction": currentPage === "redaction",
      "batch-redaction": currentPage === "batch-redaction",
      "ai-training": currentPage === "training",
      "rule-define": currentPage === "rule-define",
      "pdf-tools": currentPage === "pdf-tools",
      "settings": currentPage === "settings",
    };

    if (activeMap[target]) {
      btn.classList.add("nav-item-active");
      btn.classList.add("active");
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (target === "redaction") {
        window.location.href = redactionHref;
      } else if (target === "settings") {
        window.location.href = settingsHref;
      } else if (target === "home") {
        window.location.href = homeHref;
      } else if (target === "batch-redaction") {
        window.location.href = batchHref;
      } else if (target === "ai-training") {
        window.location.href = aiTrainingHref;
      } else if (target === "rule-define") {
        window.location.href = ruleDefineHref;
      } else if (target === "pdf-tools") {
        window.location.href = inHtmlFolder ? "./pdf-tools.html" : "html/pdf-tools.html";
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", initLayout);
