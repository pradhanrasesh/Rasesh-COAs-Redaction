(function () {
  const NS = "http://www.w3.org/2000/svg";

  const ICONS = {
    home: ['<path d="M3 11.5 12 4l9 7.5"/>', '<path d="M5 10.5V20h14v-9.5"/>'],
    settings: ['<circle cx="12" cy="12" r="3.5"/>', '<path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z"/>'],
    "file-text": ['<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>', '<path d="M14 2v6h6"/>', '<path d="M8 13h8"/>', '<path d="M8 17h8"/>', '<path d="M8 9h2"/>'],
    layers: ['<path d="m12 3 9 4.5-9 4.5-9-4.5Z"/>', '<path d="m3 12 9 4.5 9-4.5"/>', '<path d="m3 16.5 9 4.5 9-4.5"/>'],
    brain: ['<path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8A3 3 0 0 0 6 12v1a3 3 0 0 0 3 3"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8A3 3 0 0 1 18 12v1a3 3 0 0 1-3 3"/><path d="M9 6h6"/><path d="M12 3v18"/><path d="M9 18h6"/>'],
    "scan-search": ['<path d="M3 7V5a2 2 0 0 1 2-2h2"/>', '<path d="M17 3h2a2 2 0 0 1 2 2v2"/>', '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/>', '<path d="M7 21H5a2 2 0 0 1-2-2v-2"/>', '<circle cx="11" cy="11" r="4"/>', '<path d="m16 16 4 4"/>'],
    search: ['<circle cx="11" cy="11" r="7"/>', '<path d="m20 20-3.5-3.5"/>'],
    eye: ['<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>', '<circle cx="12" cy="12" r="3"/>'],
    "trash-2": ['<path d="M3 6h18"/>', '<path d="M8 6V4h8v2"/>', '<path d="M6 6l1 14h10l1-14"/>', '<path d="M10 11v6"/>', '<path d="M14 11v6"/>'],
    sparkles: ['<path d="M12 2 13.8 7 19 8.8 13.8 10.6 12 16l-1.8-5.4L5 8.8 10.2 7Z"/>', '<path d="m19 14 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>', '<path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8Z"/>'],
    "arrow-left": ['<path d="m12 19-7-7 7-7"/>', '<path d="M19 12H5"/>'],
    "upload-cloud": ['<path d="M20 16.5A4.5 4.5 0 0 0 18 8a6 6 0 0 0-11.7 1.5A4 4 0 0 0 6 17h12"/><path d="M12 12v9"/><path d="m8.5 15.5 3.5-3.5 3.5 3.5"/>'],
    files: ['<path d="M9 7V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/>', '<path d="M6 6h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/>'],
    play: ['<path d="m8 5 11 7-11 7Z"/>'],
    "building-2": ['<path d="M6 22V8l6-4 6 4v14"/>', '<path d="M4 22h16"/>', '<path d="M9 12h.01"/>', '<path d="M15 12h.01"/>', '<path d="M9 16h.01"/>', '<path d="M15 16h.01"/>'],
    power: ['<path d="M12 2v10"/>', '<path d="M18.4 5.6a8 8 0 1 1-12.8 0"/>'],
    "chevron-left": ['<path d="m15 18-6-6 6-6"/>'],
    "chevron-right": ['<path d="m9 18 6-6-6-6"/>'],
    check: ['<path d="M20 6 9 17l-5-5"/>'],
    "refresh-cw": ['<path d="M21 12a9 9 0 0 1-15.5 6.4"/>', '<path d="M3 12A9 9 0 0 1 18.5 5.6"/>', '<path d="M3 16v-4h4"/>', '<path d="M21 8v4h-4"/>'],
    puzzle: ['<path d="M8 4h3a2 2 0 1 1 4 0h3v5a2 2 0 1 1 0 4v5h-5a2 2 0 1 1-4 0H4v-5a2 2 0 1 1 0-4Z"/>'],
    "chevron-up": ['<path d="m18 15-6-6-6 6"/>'],
    copy: ['<rect x="9" y="9" width="11" height="11" rx="2"/>', '<rect x="4" y="4" width="11" height="11" rx="2"/>'],
    eraser: ['<path d="m7 18 8-8 5 5-3 3H9Z"/>', '<path d="M4 21h9"/>'],
    "chevron-down": ['<path d="m6 9 6 6 6-6"/>'],
    "file-search": ['<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>', '<path d="M14 2v6h6"/>', '<circle cx="11.5" cy="14.5" r="2.5"/>', '<path d="m15 18 2 2"/>'],
    x: ['<path d="M18 6 6 18"/>', '<path d="m6 6 12 12"/>'],
    "list-checks": ['<path d="M10 6h10"/>', '<path d="M10 12h10"/>', '<path d="M10 18h10"/>', '<path d="m4 6 1.5 1.5L8 5"/>', '<path d="m4 12 1.5 1.5L8 11"/>', '<path d="m4 18 1.5 1.5L8 17"/>'],
    zap: ['<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>'],
    "alert-circle": ['<circle cx="12" cy="12" r="10"/>', '<path d="M12 8v5"/>', '<path d="M12 16h.01"/>'],
    "check-circle-2": ['<circle cx="12" cy="12" r="10"/>', '<path d="M8 12.5 10.5 15 16 9.5"/>'],
    "shield-check": ['<path d="M12 3 5 6v5c0 5 3.4 8.6 7 10 3.6-1.4 7-5 7-10V6Z"/>', '<path d="m9 12 2 2 4-4"/>'],
    moon: ['<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>'],
    sun: ['<circle cx="12" cy="12" r="4"/>', '<path d="M12 2v2"/>', '<path d="M12 20v2"/>', '<path d="m4.9 4.9 1.4 1.4"/>', '<path d="m17.7 17.7 1.4 1.4"/>', '<path d="M2 12h2"/>', '<path d="M20 12h2"/>', '<path d="m4.9 19.1 1.4-1.4"/>', '<path d="m17.7 6.3 1.4-1.4"/>'],
    "file-up": ['<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>', '<path d="M14 2v6h6"/>', '<path d="m12 18 3-3"/>', '<path d="m12 18-3-3"/>', '<path d="M12 11v7"/>'],
    monitor: ['<rect x="3" y="4" width="18" height="12" rx="2"/>', '<path d="M8 20h8"/>', '<path d="M12 16v4"/>'],
    "wand-2": ['<path d="m7 4 13 13"/>', '<path d="m5 6 2-2"/>', '<path d="m14 3 1 2"/>', '<path d="m3 14 2 1"/>', '<path d="m17 19 2-2"/>'],
    save: ['<path d="M4 4h13l3 3v13H4Z"/>', '<path d="M8 4v6h8V4"/>', '<path d="M8 20v-6h8v6"/>'],
    square: ['<rect x="4" y="4" width="16" height="16" rx="2"/>'],
    type: ['<path d="M4 7V4h16v3"/>', '<path d="M9 20h6"/>', '<path d="M12 4v16"/>'],
    plus: ['<path d="M12 5v14"/>', '<path d="M5 12h14"/>'],
    minus: ['<path d="M5 12h14"/>'],
    loader: ['<path d="M12 3a9 9 0 1 0 9 9"/>'],
    "git-merge": ['<circle cx="6" cy="6" r="3"/>', '<circle cx="18" cy="18" r="3"/>', '<circle cx="18" cy="6" r="3"/>', '<path d="M9 6h6"/><path d="M15 6v9a3 3 0 0 0 3 3"/>'],
    hand: ['<path d="M6 12V7a1 1 0 0 1 2 0v4"/><path d="M10 11V5a1 1 0 0 1 2 0v6"/><path d="M14 11V6a1 1 0 0 1 2 0v5"/><path d="M18 11v-2a1 1 0 0 1 2 0v5c0 4-2 7-6 7h-4c-3 0-6-2-6-5v-4a1 1 0 0 1 2 0"/>'],
    highlighter: ['<path d="m9 11-6 6v4h4l6-6"/>', '<path d="m16 4 4 4"/>', '<path d="m15 5 4 4"/>'],
    "zoom-in": ['<circle cx="11" cy="11" r="7"/>', '<path d="m20 20-3.5-3.5"/>', '<path d="M11 8v6"/>', '<path d="M8 11h6"/>'],
    "zoom-out": ['<circle cx="11" cy="11" r="7"/>', '<path d="m20 20-3.5-3.5"/>', '<path d="M8 11h6"/>'],
    "undo-2": ['<path d="M9 14 4 9l5-5"/>', '<path d="M20 20a8 8 0 0 0-8-8H4"/>'],
    "redo-2": ['<path d="m15 14 5-5-5-5"/>', '<path d="M4 20a8 8 0 0 1 8-8h8"/>'],
    "scan-line": ['<path d="M3 7V5a2 2 0 0 1 2-2h2"/>', '<path d="M17 3h2a2 2 0 0 1 2 2v2"/>', '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/>', '<path d="M7 21H5a2 2 0 0 1-2-2v-2"/>', '<path d="M4 12h16"/>'],
    shield: ['<path d="M12 3 5 6v5c0 5 3.4 8.6 7 10 3.6-1.4 7-5 7-10V6Z"/>'],
  };

  function svgFor(name) {
    const parts = ICONS[name] || ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 8v8"/>', '<path d="M8 12h8"/>'];
    return `<svg xmlns="${NS}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts.join("")}</svg>`;
  }

  function createIcons(root) {
    (root || document).querySelectorAll("[data-lucide]").forEach((node) => {
      const name = node.getAttribute("data-lucide");
      if (!name) return;
      node.innerHTML = svgFor(name);
      node.setAttribute("data-lucide-ready", "true");
      node.style.display = "inline-flex";
      node.style.alignItems = "center";
      node.style.justifyContent = "center";
    });
  }

  window.lucide = { createIcons };
  if (document.readyState !== "loading") createIcons(document);
  else document.addEventListener("DOMContentLoaded", () => createIcons(document));
})();
