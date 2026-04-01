import { textStore } from "./TextLayer.js";
import { setStatus, showToast } from "./Utils.js";
import { loadTemplateForCompany } from "./Template_UI.js";

const BACKEND_URL = "";

const COMMON_LABELS = [
  "REPORT NO.",
  "ACCOUNT NUMBER",
  "LICENSE NUMBER",
  "CLIENT NAME",
  "CLIENT PHONE",
  "CLIENT EMAIL",
  "CLIENT ADDRESS",
  "LOT NUMBER",
  "SAMPLE ID",
  "COA NUMBER",
  "PO#",
  "LAB NUMBER",
  "BARCODE",
  "QR CODE",
];

function inferGroup(label) {
  const value = String(label || "").toUpperCase();
  if (value.includes("REPORT")) return "report";
  if (value.includes("ACCOUNT")) return "account";
  if (value.includes("LICENSE")) return "license";
  if (value.includes("PHONE")) return "phone";
  if (value.includes("EMAIL")) return "email";
  if (value.includes("ADDRESS")) return "address";
  if (value.includes("CLIENT") || value.includes("NAME")) return "name";
  if (value.includes("LOT")) return "lot";
  if (value.includes("SAMPLE")) return "sample";
  if (value.includes("COA")) return "coa";
  if (value.includes("PO#") || value === "PO") return "po";
  if (value.includes("LAB")) return "lab";
  if (value.includes("BARCODE")) return "barcode";
  if (value.includes("QR")) return "qr";
  return "manual";
}

function rectsIntersect(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function extractTextFromRect(page, rect) {
  const spans = textStore?.[page]?.spans || [];
  const matched = spans
    .filter((span) => rectsIntersect(rect, span))
    .sort((left, right) => {
      const yDiff = Math.abs((left.y0 || 0) - (right.y0 || 0));
      if (yDiff > 0.012) return (left.y0 || 0) - (right.y0 || 0);
      return (left.x0 || 0) - (right.x0 || 0);
    });

  if (!matched.length) return "";

  let output = "";
  let previousY = null;
  for (const span of matched) {
    const text = String(span.text || "").trim();
    if (!text) continue;

    if (previousY !== null && Math.abs(span.y0 - previousY) > 0.012) output += "\n";
    else if (output) output += " ";

    output += text;
    previousY = span.y0;
  }

  return output.trim();
}

function ensureManualTrainingModal() {
  let modal = document.getElementById("manualTrainingModal");
  if (modal && modal.dataset.ready === "true") return modal;

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "manualTrainingModal";
    modal.className = "manual-training-modal hidden";
    document.body.appendChild(modal);
  }

  modal.dataset.ready = "true";
  modal.innerHTML = `
    <div class="manual-training-backdrop" data-close-modal="true"></div>
    <div class="manual-training-dialog" role="dialog" aria-modal="true" aria-labelledby="manualTrainingTitle">
      <div class="manual-training-head">
        <div>
          <div class="manual-training-kicker">Manual Company Training</div>
          <h3 id="manualTrainingTitle">Label This Redaction</h3>
        </div>
        <button type="button" class="manual-training-close" data-close-modal="true" aria-label="Close">x</button>
      </div>
      <div class="manual-training-body">
        <div class="manual-training-company-row">
          <span class="manual-training-pill" id="manualTrainingCompany">No company selected</span>
          <span class="manual-training-pill subtle" id="manualTrainingPage">Page 1</span>
        </div>
        <label class="manual-training-label" for="manualTrainingName">Redaction label</label>
        <input id="manualTrainingName" class="manual-training-input" type="text" placeholder="e.g. REPORT NO." />
        <div id="manualTrainingSuggestions" class="manual-training-suggestions"></div>
        <div class="manual-training-preview">
          <div class="manual-training-preview-label">Detected value inside selection</div>
          <div id="manualTrainingExtracted" class="manual-training-preview-text"></div>
        </div>
      </div>
      <div class="manual-training-actions">
        <button type="button" id="manualTrainingCancel" class="btn btn-ghost">Cancel Box</button>
        <button type="button" id="manualTrainingRedactOnly" class="btn btn-ghost">Redact Only</button>
        <button type="button" id="manualTrainingSave" class="btn btn-primary">Save Training</button>
      </div>
    </div>
  `;

  return modal;
}

export function promptManualTrainingLabel({ page, rect }) {
  const modal = ensureManualTrainingModal();
  const select = document.getElementById("companySelect");
  const ruleDefineCompany = document.getElementById("ruleDefineCompany")?.textContent?.trim();
  const companyName = select?.selectedOptions?.[0]?.text || ruleDefineCompany || "No company selected";
  const labelInput = document.getElementById("manualTrainingName");
  const extractedEl = document.getElementById("manualTrainingExtracted");
  const companyEl = document.getElementById("manualTrainingCompany");
  const pageEl = document.getElementById("manualTrainingPage");
  const suggestionsEl = document.getElementById("manualTrainingSuggestions");
  const btnCancel = document.getElementById("manualTrainingCancel");
  const btnRedactOnly = document.getElementById("manualTrainingRedactOnly");
  const btnSave = document.getElementById("manualTrainingSave");
  const extractedText = extractTextFromRect(page, rect);

  companyEl.textContent = companyName;
  pageEl.textContent = `Page ${page}`;
  extractedEl.textContent = extractedText || "No text was detected inside this selection. You can still save a position-based training rule.";
  labelInput.value = "";
  labelInput.classList.remove("manual-training-input-error");
  suggestionsEl.innerHTML = COMMON_LABELS.map((label) => `<button type="button" class="manual-training-chip" data-label="${label}">${label}</button>`).join("");

  suggestionsEl.querySelectorAll("[data-label]").forEach((button) => {
    button.addEventListener("click", () => {
      labelInput.value = button.dataset.label || "";
      labelInput.focus();
    });
  });

  modal.classList.remove("hidden");
  setTimeout(() => labelInput.focus(), 0);

  return new Promise((resolve) => {
    const close = (result) => {
      modal.classList.add("hidden");
      resolve({ ...result, extractedText });
    };

    const onBackdrop = (event) => {
      if (event.target?.dataset?.closeModal === "true") {
        cleanup();
        close({ action: "cancel" });
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") {
        cleanup();
        close({ action: "cancel" });
      }
    };

    const onSave = () => {
      const label = String(labelInput.value || "").trim();
      if (!label) {
        labelInput.classList.add("manual-training-input-error");
        labelInput.focus();
        return;
      }
      cleanup();
      close({ action: "train", label });
    };

    const onRedactOnly = () => {
      cleanup();
      close({ action: "redact-only" });
    };

    const onCancel = () => {
      cleanup();
      close({ action: "cancel" });
    };

    const cleanup = () => {
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEscape);
      btnSave.removeEventListener("click", onSave);
      btnRedactOnly.removeEventListener("click", onRedactOnly);
      btnCancel.removeEventListener("click", onCancel);
    };

    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEscape);
    btnSave.addEventListener("click", onSave);
    btnRedactOnly.addEventListener("click", onRedactOnly);
    btnCancel.addEventListener("click", onCancel);
  });
}

async function saveManualTraining({ page, rect, label, extractedText }) {
  const companySelect = document.getElementById("companySelect");
  const companyId = companySelect?.value;
  const displayName = companySelect?.selectedOptions?.[0]?.text || companyId;

  if (!companyId) {
    throw new Error("No company was detected. Select a company before saving training.");
  }

  const payload = {
    company_id: companyId,
    display_name: displayName,
    items: [
      {
        label,
        group: inferGroup(label),
        sample_text: extractedText || "",
        text: extractedText || "",
        rects: [rect],
        page,
      },
    ],
  };

  const response = await fetch(`${BACKEND_URL}/api/ai/learn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.detail || json.error || `Training save failed (${response.status})`);
  }

  await loadTemplateForCompany(companyId);
  return json;
}

export async function handleManualTrainingRect({ page, rect }) {
  const result = await promptManualTrainingLabel({ page, rect });

  if (result.action === "cancel") {
    setStatus("Manual redaction cancelled.");
    return { keepRedaction: false };
  }

  if (result.action === "redact-only") {
    setStatus(`Added manual redaction on page ${page}.`);
    return { keepRedaction: true };
  }

  try {
    await saveManualTraining({
      page,
      rect,
      label: result.label,
      extractedText: result.extractedText,
    });
    showToast(`Saved training for ${result.label}`);
    setStatus(`Saved manual training for ${result.label}.`);
    return { keepRedaction: true, trainingLabel: result.label };
  } catch (error) {
    showToast(error?.message || "Failed to save manual training");
    setStatus(error?.message || "Failed to save manual training.");
    return { keepRedaction: true };
  }
}
