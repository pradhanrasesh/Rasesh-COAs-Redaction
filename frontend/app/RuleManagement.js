// RuleManagement.js - Frontend logic for managing saved training data

import { showToast } from "./Alerts.js";

async function fetchCompanies() {
  try {
    const res = await fetch("/api/ai/rules/list");
    const data = await res.json();
    renderCompanyList(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Error fetching companies:", err);
  }
}

function wireTemplateActions() {
  const importButton = document.getElementById("btnImportTemplates");
  const exportButton = document.getElementById("btnExportTemplates");
  const importInput = document.getElementById("templateImportInput");

  importButton?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file, file.name);

    try {
      const res = await fetch("/api/ai/templates/import", {
        method: "POST",
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Import failed");
      showToast(`Imported ${data.imported || 0} template(s).`, "success");
      fetchCompanies();
    } catch (err) {
      showToast(err?.message || "Template import failed.", "error");
    } finally {
      importInput.value = "";
    }
  });

  exportButton?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/ai/templates/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "redectio-offline-templates.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Templates exported.", "success");
    } catch (err) {
      showToast(err?.message || "Template export failed.", "error");
    }
  });
}

function renderCompanyList(companies) {
  const list = document.getElementById("companyList");
  if (!list) return;

  if (companies.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-secondary">No saved rules found.</div>';
    return;
  }

  list.innerHTML = companies.map((company) => {
    const studio = company.studio_rule || {};
    const updatedAt = company.updated_at && company.updated_at !== "N/A"
      ? new Date(company.updated_at).toLocaleDateString()
      : "Unknown";

    return `
      <button class="nav-item w-full text-left p-3 rounded-lg hover:bg-black/5" data-cid="${company.id}">
        <div class="font-bold">${company.display_name}</div>
        <div class="text-xs text-secondary">
          ${company.regex_count} patterns · ${studio.learnedCoordinates || 0} zones · Updated: ${updatedAt}
        </div>
      </button>
    `;
  }).join("");

  list.querySelectorAll("button[data-cid]").forEach((btn) => {
    btn.addEventListener("click", () => selectCompany(btn.dataset.cid));
  });
}

async function selectCompany(cid) {
  document.querySelectorAll("#companyList .nav-item").forEach((button) => {
    button.classList.remove("bg-accent/10", "border-accent");
    if (button.dataset.cid === cid) button.classList.add("bg-accent/10", "border-accent");
  });

  try {
    const res = await fetch(`/api/ai/rules/${cid}`);
    const data = await res.json();
    renderRuleDetails(data);
  } catch (err) {
    console.error("Error fetching rules:", err);
  }
}

function renderRuleDetails(data) {
  const header = document.getElementById("selectedCompanyName");
  const meta = document.getElementById("selectedCompanyMeta");
  const content = document.getElementById("ruleContent");
  const actions = document.getElementById("companyActions");

  if (!header || !meta || !content || !actions) return;

  const regexRules = Array.isArray(data.regex) ? data.regex : [];
  const studioRule = data.studio_rule || {};
  const identifiers = studioRule.identifiers || data.identifiers || [];
  const sensitiveTerms = studioRule.sensitiveTerms || data.sensitive_terms || [];
  const learnedCoordinates = studioRule.learnedCoordinates || [];

  header.textContent = data.display_name || data.company_id;
  meta.textContent = `Company ID: ${data.company_id} · Version: ${data.version || 1}`;
  actions.classList.remove("hidden");

  const deleteBtn = document.getElementById("btnDeleteRules");
  if (deleteBtn) deleteBtn.onclick = () => deleteCompany(data.company_id);

  if (!regexRules.length && !sensitiveTerms.length && !learnedCoordinates.length) {
    content.innerHTML = '<div class="text-center py-20 text-secondary">No patterns saved for this company.</div>';
    return;
  }

  content.innerHTML = `
    <div class="space-y-4">
      <div class="p-4 border border-subtle rounded-lg bg-surface">
        <h3 class="text-sm font-bold text-secondary uppercase tracking-wider mb-3">Redection-studio Rule</h3>
        <div class="grid gap-2 text-sm">
          <div><strong>Name:</strong> ${studioRule.name || data.display_name || data.company_id}</div>
          <div><strong>Identifiers:</strong> ${identifiers.length ? identifiers.join(", ") : "None"}</div>
          <div><strong>Sensitive Terms:</strong> ${sensitiveTerms.length}</div>
          <div><strong>Learned Coordinates:</strong> ${learnedCoordinates.length}</div>
          <div><strong>Description:</strong> ${studioRule.description || data.description || "Imported training rule"}</div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-bold text-secondary uppercase tracking-wider">Learned Regex Patterns</h3>
        <div class="grid gap-4">
          ${regexRules.length ? regexRules.map((rule) => `
            <div class="p-4 border border-subtle rounded-lg bg-surface">
              <div class="flex justify-between items-start mb-2 gap-4">
                <div>
                  <span class="badge badge-info mb-1">${rule.label || "Pattern"}</span>
                  <div class="text-xs text-secondary mt-1">${rule.id || "unnamed-rule"}</div>
                </div>
                <div class="text-sm font-mono bg-black/5 px-2 py-1 rounded">conf: ${Number(rule.confidence ?? 1).toFixed(2)}</div>
              </div>
              <div class="font-mono text-sm bg-accent/5 p-2 rounded border border-accent/20 break-all mb-3">${rule.pattern || ""}</div>
              ${rule.examples && rule.examples.length > 0 ? `
                <div class="mt-2 pt-2 border-t border-subtle">
                  <div class="text-xs font-bold text-secondary mb-2">Examples Seen:</div>
                  <div class="flex flex-wrap gap-2">
                    ${rule.examples.slice(0, 5).map((example) => `
                      <span class="text-[10px] bg-surface-alt px-2 py-0.5 rounded border border-subtle">${example.sample_text}</span>
                    `).join("")}
                    ${rule.examples.length > 5 ? `<span class="text-[10px] text-secondary">+${rule.examples.length - 5} more</span>` : ""}
                  </div>
                </div>
              ` : ""}
            </div>
          `).join("") : '<div class="text-center py-8 text-secondary">No learned regex patterns yet.</div>'}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

async function deleteCompany(cid) {
  if (!confirm(`Are you sure you want to delete all training data for ${cid}? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/ai/rules/${cid}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Training data deleted.", "info");
      fetchCompanies();

      const header = document.getElementById("selectedCompanyName");
      const content = document.getElementById("ruleContent");
      const actions = document.getElementById("companyActions");

      if (header) header.textContent = "Select a Company";
      if (content) content.innerHTML = '<div class="text-center py-20 text-secondary">Select a company from the left.</div>';
      if (actions) actions.classList.add("hidden");
    }
  } catch (err) {
    showToast("Error deleting data.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireTemplateActions();
  fetchCompanies();
});
