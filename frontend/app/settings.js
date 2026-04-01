// frontend/app/settings.js

const defaultSettings = {
  theme: "light",
  density: "comfortable",
  defaultColor: "#000000",
  aiSensitivity: 50,
  stickySearch: true,
  autoHighlight: true,
  outputPattern: "{name}_redacted",
  toolbarVisibility: {
    selection: true,
    undoRedo: true,
    zoomNav: true,
    aiDetection: true,
    applySave: true
  }
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("coaSettings") || "{}");
  return {
    ...defaultSettings,
    ...saved,
    toolbarVisibility: {
      ...defaultSettings.toolbarVisibility,
      ...(saved.toolbarVisibility || {})
    }
  };
}

function saveSettings(settings) {
  localStorage.setItem("coaSettings", JSON.stringify(settings));
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
}

function applyDensity(density) {
  document.body.dataset.density = density;
}

function buildPreview(pattern) {
  const name = "document";
  const date = "2025-01-01";
  const time = "12-00";
  const redacted = "_redacted";
  const rejected = "_rejected";

  let out = pattern;
  out = out.replaceAll("{name}", name);
  out = out.replaceAll("{date}", date);
  out = out.replaceAll("{time}", time);
  out = out.replaceAll("{redacted}", redacted);
  out = out.replaceAll("{rejected}", rejected);

  if (!out.endsWith(".pdf")) out += ".pdf";
  return out;
}

document.addEventListener("DOMContentLoaded", () => {
  const settings = loadSettings();

  // DOM refs
  const themeBtns = document.querySelectorAll(".theme-option");
  const densityBtns = document.querySelectorAll(".density-option");
  const colorInput = document.getElementById("settingDefaultColor");
  const aiSensitivity = document.getElementById("settingAISensitivity");
  const aiSensitivityValue = document.getElementById("settingAISensitivityValue");
  const stickySearch = document.getElementById("settingStickySearch");
  const autoHighlight = document.getElementById("settingAutoHighlight");
  const patternInput = document.getElementById("settingOutputPattern");
  const patternBtns = document.querySelectorAll(".pattern-buttons button");
  const preview = document.getElementById("settingOutputPreview");
  const toolbarItems = document.querySelectorAll(".toolbar-item");
  const tabs = document.querySelectorAll(".settings-tab");
  const panels = document.querySelectorAll(".settings-panel");
  const resetBtn = document.getElementById("btnResetDefaults");

  // Apply theme + density immediately
  applyTheme(settings.theme);
  applyDensity(settings.density);

  // Auto-save helper
  function commit() {
    saveSettings(settings);
  }

  // Theme buttons
  themeBtns.forEach(btn => {
    const t = btn.dataset.theme;
    if (t === settings.theme) btn.classList.add("active");

    btn.addEventListener("click", () => {
      themeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      settings.theme = t;
      applyTheme(t);
      commit();
    });
  });

  // Density buttons
  densityBtns.forEach(btn => {
    const d = btn.dataset.density;
    if (d === settings.density) btn.classList.add("active");

    btn.addEventListener("click", () => {
      densityBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      settings.density = d;
      applyDensity(d);
      commit();
    });
  });

  // Basic toggles
  colorInput.value = settings.defaultColor;
  if (aiSensitivity) aiSensitivity.value = String(settings.aiSensitivity ?? defaultSettings.aiSensitivity);
  stickySearch.checked = settings.stickySearch;
  autoHighlight.checked = settings.autoHighlight;
  if (aiSensitivityValue) aiSensitivityValue.textContent = String(settings.aiSensitivity ?? defaultSettings.aiSensitivity);

  colorInput.addEventListener("input", () => {
    settings.defaultColor = colorInput.value;
    commit();
  });

  aiSensitivity?.addEventListener("input", () => {
    const v = parseInt(aiSensitivity.value, 10);
    settings.aiSensitivity = Number.isFinite(v) ? v : defaultSettings.aiSensitivity;
    if (aiSensitivityValue) aiSensitivityValue.textContent = String(settings.aiSensitivity);
    commit();
  });

  stickySearch.addEventListener("change", () => {
    settings.stickySearch = stickySearch.checked;
    commit();
  });

  autoHighlight.addEventListener("change", () => {
    settings.autoHighlight = autoHighlight.checked;
    commit();
  });

  // Output pattern
  patternInput.value = settings.outputPattern;
  preview.textContent = buildPreview(settings.outputPattern);

  patternInput.addEventListener("input", () => {
    settings.outputPattern = patternInput.value;
    preview.textContent = buildPreview(settings.outputPattern);
    commit();
  });

  patternBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const token = btn.dataset.token;
      const start = patternInput.selectionStart;
      const end = patternInput.selectionEnd;
      const before = patternInput.value.slice(0, start);
      const after = patternInput.value.slice(end);

      patternInput.value = before + token + after;
      settings.outputPattern = patternInput.value;
      preview.textContent = buildPreview(settings.outputPattern);

      patternInput.focus();
      patternInput.selectionStart = patternInput.selectionEnd = start + token.length;

      commit();
    });
  });

  // Toolbar visibility
  toolbarItems.forEach(item => {
    const key = item.dataset.tool;
    const eye = item.querySelector(".btn-eye");

    const visible = settings.toolbarVisibility[key] !== false;
    eye.dataset.visible = visible ? "true" : "false";
    eye.innerHTML = visible
      ? '<i class="fa-solid fa-eye"></i>'
      : '<i class="fa-solid fa-eye-slash"></i>';

    eye.addEventListener("click", () => {
      const now = eye.dataset.visible !== "true";
      eye.dataset.visible = now ? "true" : "false";
      eye.innerHTML = now
        ? '<i class="fa-solid fa-eye"></i>'
        : '<i class="fa-solid fa-eye-slash"></i>';

      settings.toolbarVisibility[key] = now;
      commit();
    });
  });

  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove("settings-tab-active"));
      panels.forEach(p => p.classList.add("hidden"));

      tab.classList.add("settings-tab-active");
      document.querySelector(`[data-tab-panel="${target}"]`).classList.remove("hidden");
      
      // If redaction list tab is opened, refresh the list
      if (target === "redaction-list") {
        refreshRedactionWordList();
      }
    });
  });

  // Reset to defaults button
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to reset all settings to default values? This will clear your current settings.")) {
        localStorage.removeItem("coaSettings");
        // Reload the page to apply defaults
        window.location.reload();
      }
    });
  }

  // ------------------------------------------------------------
  // Redaction Word List Functionality
  // ------------------------------------------------------------
  function refreshRedactionWordList() {
    import("./RedactionWordList.js").then(({ getRedactionWordList, redactionWordList }) => {
      const listContainer = document.getElementById("redactionWordList");
      const countElement = document.getElementById("wordListCount");
      
      if (!listContainer) return;
      
      const words = getRedactionWordList();
      
      if (words.length === 0) {
        listContainer.innerHTML = '<div class="word-list-empty">No words in redaction list. Add some using the buttons above or from search suggestions.</div>';
        if (countElement) countElement.textContent = "0";
        return;
      }
      
      listContainer.innerHTML = "";
      
      words.forEach((word, index) => {
        const wordElement = document.createElement("div");
        wordElement.className = "word-list-item";
        wordElement.style.display = "flex";
        wordElement.style.justifyContent = "space-between";
        wordElement.style.alignItems = "center";
        wordElement.style.padding = "8px 12px";
        wordElement.style.borderBottom = "1px solid var(--border)";
        wordElement.style.transition = "background-color 0.15s ease";
        
        if (index === words.length - 1) {
          wordElement.style.borderBottom = "none";
        }
        
        wordElement.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="hash" style="width: 12px; height: 12px; color: var(--text-secondary);"></i>
            <span style="font-family: monospace; font-weight: 500;">${word}</span>
          </div>
          <button class="btn btn-small btn-danger remove-word-btn" data-word="${word}" style="padding: 2px 8px; font-size: 11px;">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
          </button>
        `;
        
        listContainer.appendChild(wordElement);
      });
      
      // Recreate lucide icons
      if (window.lucide) window.lucide.createIcons();
      
      // Attach remove event listeners
      document.querySelectorAll(".remove-word-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const word = btn.dataset.word;
          import("./RedactionWordList.js").then(({ removeWordFromRedactionList, showAlert }) => {
            if (removeWordFromRedactionList(word)) {
              refreshRedactionWordList();
              // Show alert
              import("./alert.js").then(({ showAlert }) => {
                showAlert("success", `Removed "${word}" from redaction list`);
              });
            }
          });
        });
      });
      
      if (countElement) countElement.textContent = words.length.toString();
    });
  }

  // Initialize redaction word list functionality
  function initRedactionWordList() {
    const btnAddWord = document.getElementById("btnAddWord");
    const btnApplyWordList = document.getElementById("btnApplyWordList");
    const btnExportWordList = document.getElementById("btnExportWordList");
    const btnImportWordList = document.getElementById("btnImportWordList");
    const btnClearWordList = document.getElementById("btnClearWordList");
    const commonWordBtns = document.querySelectorAll(".common-word-btn");
    
    if (btnAddWord) {
      btnAddWord.addEventListener("click", () => {
        const word = prompt("Enter a word to add to the redaction list:");
        if (word && word.trim()) {
          import("./RedactionWordList.js").then(({ addWordToRedactionList }) => {
            if (addWordToRedactionList(word.trim())) {
              refreshRedactionWordList();
              import("./alert.js").then(({ showAlert }) => {
                showAlert("success", `Added "${word}" to redaction list`);
              });
            } else {
              import("./alert.js").then(({ showAlert }) => {
                showAlert("info", `"${word}" is already in redaction list`);
              });
            }
          });
        }
      });
    }
    
    if (btnApplyWordList) {
      btnApplyWordList.addEventListener("click", () => {
        import("./RedactionWordList.js").then(({ applyRedactionWordList }) => {
          applyRedactionWordList();
        });
      });
    }
    
    if (btnExportWordList) {
      btnExportWordList.addEventListener("click", () => {
        import("./RedactionWordList.js").then(({ exportRedactionWordList }) => {
          exportRedactionWordList();
          import("./alert.js").then(({ showAlert }) => {
            showAlert("success", "Redaction word list exported");
          });
        });
      });
    }
    
    if (btnImportWordList) {
      btnImportWordList.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        
        input.addEventListener("change", (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          import("./RedactionWordList.js").then(({ importRedactionWordList }) => {
            importRedactionWordList(file).then((result) => {
              refreshRedactionWordList();
              import("./alert.js").then(({ showAlert }) => {
                showAlert("success", `Imported ${result.added} words. Total: ${result.total}`);
              });
            }).catch(err => {
              import("./alert.js").then(({ showAlert }) => {
                showAlert("error", `Import failed: ${err.message}`);
              });
            });
          });
        });
        
        input.click();
      });
    }
    
    if (btnClearWordList) {
      btnClearWordList.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire redaction word list? This cannot be undone.")) {
          import("./RedactionWordList.js").then(({ clearRedactionWordList }) => {
            clearRedactionWordList();
            refreshRedactionWordList();
            import("./alert.js").then(({ showAlert }) => {
              showAlert("success", "Redaction word list cleared");
            });
          });
        }
      });
    }
    
    // Common word buttons
    commonWordBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const word = btn.dataset.word;
        import("./RedactionWordList.js").then(({ addWordToRedactionList }) => {
          if (addWordToRedactionList(word)) {
            refreshRedactionWordList();
            import("./alert.js").then(({ showAlert }) => {
              showAlert("success", `Added "${word}" to redaction list`);
            });
          } else {
            import("./alert.js").then(({ showAlert }) => {
              showAlert("info", `"${word}" is already in redaction list`);
            });
          }
        });
      });
    });
    
    // Initial refresh if on redaction list tab
    const activeTab = document.querySelector(".settings-tab-active");
    if (activeTab && activeTab.dataset.tab === "redaction-list") {
      refreshRedactionWordList();
    }
  }
  
  // Initialize redaction word list
  initRedactionWordList();
});
