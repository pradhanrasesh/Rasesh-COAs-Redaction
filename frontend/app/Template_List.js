// frontend/app/Template_List.js
import { loadTemplateForCompany } from "./Template_UI.js";
import { runAutoRedact } from "./Redaction_Auto.js";

const BACKEND_URL = "";

export async function loadCompanyList() {
  const select = document.getElementById("companySelect");
  if (!select) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/templates`);
    if (!res.ok) {
      console.warn("Failed to fetch templates list:", res.status);
      return;
    }

    const json = await res.json();
    const list = json.templates || [];

    // Clear existing and add default
    select.innerHTML = `<option value="">(none)</option>`;

    // Add companies
    for (const t of list) {
      const opt = document.createElement("option");
      opt.value = t.company_id;
      opt.textContent = t.display_name || t.company_id;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load template list:", err);
  }

  // When user selects a company, load its template and run auto-suggest
  select.addEventListener("change", async () => {
    const cid = select.value;
    if (!cid) {
      // clear sidebar if none selected
      const sidebar = document.getElementById("templateSidebar");
      if (sidebar) sidebar.innerHTML = "";
      return;
    }

    try {
      await loadTemplateForCompany(cid);

      // Immediately run template-based auto-suggest for the selected company
      // (backend will merge universal + company rules per Option D)
      await runAutoRedact(`/redact/template?company_id=${cid}`);
    } catch (err) {
      console.error("Error loading template or running auto-suggest:", err);
    }
  });
}
