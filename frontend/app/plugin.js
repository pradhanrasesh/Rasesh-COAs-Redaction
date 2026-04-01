// ------------------------------------------------------------
// plugin.js — Full Plugin System for Redectio (Lucide Version)
// ------------------------------------------------------------

const BACKEND_URL = "";

// -------------------------------
// Job Queue for long-running tasks
// -------------------------------
const jobQueue = [];
let jobRunning = false;

export function enqueuePluginJob(toolId, options) {
  jobQueue.push({ toolId, options });
  processQueue();
}

async function processQueue() {
  if (jobRunning || jobQueue.length === 0) return;

  jobRunning = true;
  const job = jobQueue.shift();

  window.showAlert(`Running plugin: ${job.toolId}...`);

  await runPlugin(job.toolId, job.options);

  jobRunning = false;
  processQueue();
}

// -------------------------------
// Load plugin list into Tools panel
// -------------------------------
export async function loadPluginsIntoUI() {
  const container = document.getElementById("pluginToolsContainer");
  if (!container) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/tools`);
    const tools = await res.json();

    const categories = {
      convert: [],
      optimize: [],
      redaction: [],
      debug: []
    };

    tools.forEach(t => {
      if (categories[t.category]) categories[t.category].push(t);
    });

    container.innerHTML = "";

    Object.entries(categories).forEach(([cat, items]) => {
      if (items.length === 0) return;

      const header = document.createElement("div");
      header.className = "plugin-category-header";
      header.textContent = cat.toUpperCase();
      container.appendChild(header);

      items.forEach(tool => {
        const wrapper = document.createElement("div");
        wrapper.className = "plugin-entry";

        wrapper.innerHTML = `
          <div class="plugin-entry-main">
            <button class="plugin-btn" ${tool.enabled ? "" : "disabled"}>
              <i data-lucide="${tool.icon}" class="plugin-icon"></i>
              <span class="btn-text plugin-name">${tool.name}</span>
            </button>
            <span class="plugin-version">v${tool.version}</span>
          </div>

          <div class="plugin-description">${tool.description}</div>

          <button class="plugin-toggle ${tool.enabled ? "enabled" : "disabled"}">
            <i data-lucide="power" class="plugin-toggle-icon"></i>
            <span class="btn-text">${tool.enabled ? "Disable" : "Enable"}</span>
          </button>
        `;

        wrapper.querySelector(".plugin-btn").addEventListener("click", () => {
          if (tool.enabled) openPluginModal(tool);
        });

        wrapper.querySelector(".plugin-toggle").addEventListener("click", async () => {
          await togglePlugin(tool.id);
          loadPluginsIntoUI();
        });

        container.appendChild(wrapper);
      });
    });

    // ⭐ Re-render Lucide icons after dynamic DOM updates
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error("[plugins] Error loading tools:", err);
  }
}

// -------------------------------
// Toggle plugin enable/disable
// -------------------------------
async function togglePlugin(toolId) {
  await fetch(`${BACKEND_URL}/api/tools/toggle/${toolId}`, {
    method: "POST"
  });
}

// -------------------------------
// Plugin Settings Modal
// -------------------------------
function openPluginModal(tool) {
  const modal = document.getElementById("pluginModal");
  const title = document.getElementById("pluginModalTitle");
  const settings = document.getElementById("pluginSettingsContainer");

  title.textContent = `${tool.name} (v${tool.version})`;

  if (tool.id === "compress") {
    settings.innerHTML = `
      <label>Compression Level</label>
      <select id="pluginOptionLevel">
        <option value="ebook">Ebook (default)</option>
        <option value="screen">Screen</option>
        <option value="printer">Printer</option>
      </select>
    `;
  } else if (tool.id === "pdf_to_images") {
    settings.innerHTML = `
      <label>DPI</label>
      <input id="pluginOptionDpi" type="number" value="200" min="50" max="600">
    `;
  } else {
    settings.innerHTML = `<p>${tool.description}</p>`;
  }

  modal.classList.remove("hidden");

  document.getElementById("pluginRunBtn").onclick = () => {
    const options = {};

    if (tool.id === "compress") {
      options.level = document.getElementById("pluginOptionLevel").value;
    }
    if (tool.id === "pdf_to_images") {
      options.dpi = parseInt(document.getElementById("pluginOptionDpi").value);
    }

    enqueuePluginJob(tool.id, options);
    modal.classList.add("hidden");
  };

  document.getElementById("pluginCancelBtn").onclick = () => {
    modal.classList.add("hidden");
  };
}

// -------------------------------
// Run plugin (backend call)
// -------------------------------
export async function runPlugin(toolId, options = {}) {
  if (!window.currentPdfFile) {
    alert("Please load a PDF first.");
    return;
  }

  const form = new FormData();
  form.append("file", window.currentPdfFile);
  form.append("options", JSON.stringify(options));

  const res = await fetch(`${BACKEND_URL}/api/tools/run/${toolId}`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    alert("Plugin failed: " + res.status);
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${toolId}_output.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}

// -------------------------------
// Marketplace UI
// -------------------------------
export async function loadPluginMarketplace() {
  const container = document.getElementById("pluginMarketplace");
  if (!container) return;

  const res = await fetch(`${BACKEND_URL}/api/tools`);
  const tools = await res.json();

  container.innerHTML = tools.map(t => `
    <div class="plugin-card">
      <i data-lucide="${t.icon}" class="plugin-icon"></i>
      <h3>${t.name}</h3>
      <p>${t.description}</p>
      <span class="plugin-version">v${t.version}</span>
      <button onclick="runPlugin('${t.id}')">
        <i data-lucide="play"></i>
        Run
      </button>
    </div>
  `).join("");

  // ⭐ Re-render Lucide icons
  if (window.lucide) window.lucide.createIcons();
}
