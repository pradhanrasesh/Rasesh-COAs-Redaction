// ------------------------------------------------------------
// Template_Detect_Backend.js — Backend company detection + template loading
// ------------------------------------------------------------

import {
  originalPdfBytes,
  setStatus
} from "./Utils.js";

import { loadTemplateForCompany } from "./Template_UI.js";
import { runAutoRedact } from "./Redaction_Auto.js";

const BACKEND_URL = "";

// ------------------------------------------------------------
// detectCompanyFromBackend()
// ------------------------------------------------------------
export async function detectCompanyFromBackend() {
  if (!originalPdfBytes || !originalPdfBytes.length) {
    setStatus("Upload a PDF first before detecting company.");
    return null;
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([originalPdfBytes], { type: "application/pdf" }),
    "file.pdf"
  );

  try {
    // ⭐ FIXED: new unified endpoint
    const res = await fetch(`${BACKEND_URL}/detect-company`, {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      setStatus("Company detection failed.");
      return null;
    }

    const json = await res.json();
    console.log("Company detection response:", json);

    if (!json.company_id) {
      setStatus("No matching company template found.");
      return null;
    }

    const id = json.company_id;
    const name = json.display_name || id;

    setStatus(`Detected company: ${name}`);

    // Update dropdown
    const select = document.getElementById("companySelect");
    if (select) {
      select.value = id;
    }

    return id;

  } catch (err) {
    console.error("detectCompanyFromBackend error:", err);
    setStatus("Company detection failed (backend not reachable).");
    return null;
  }
}

// ------------------------------------------------------------
// detectAndLoadTemplateFromBackend()
// ------------------------------------------------------------
export async function detectAndLoadTemplateFromBackend() {
  const companyId = await detectCompanyFromBackend();
  if (!companyId) return;

  await loadTemplateForCompany(companyId);

  // Correct endpoint path
  await runAutoRedact(`/redact/template?company_id=${companyId}`);

  setStatus(`Auto-suggestions ready for company: ${companyId}`);
}
