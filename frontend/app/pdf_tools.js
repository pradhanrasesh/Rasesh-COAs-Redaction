import { GoogleGenAI } from "@google/genai";

const CFG = {
  "document-review": {
    title: "Document Review",
    tools: [
      { id: "metadata-update", title: "Change Metadata", description: "Edit PDF properties like title, author, and keywords.", icon: "file-text", endpoint: "/api/document/metadata/update", responseType: "download", fields: [
        { name: "title", label: "Title", type: "text" }, { name: "author", label: "Author", type: "text" }, { name: "subject", label: "Subject", type: "text" },
        { name: "keywords", label: "Keywords", type: "text" }, { name: "creator", label: "Creator", type: "text" }, { name: "producer", label: "Producer", type: "text" }
      ]},
      { id: "toc-update", title: "Edit Table of Contents", description: "Modify bookmarks and document structure.", icon: "book-open", endpoint: "/api/document/toc/update", responseType: "download", fields: [
        { name: "toc_json", label: "TOC JSON", type: "textarea", required: true, rows: 8, defaultValue: JSON.stringify({ entries: [{ title: "Section 1", page: 1, level: 1 }] }, null, 2) }
      ]},
      { id: "read-text", title: "Read", description: "View and review document content.", icon: "eye", endpoint: "/api/document/read/extract-text", responseType: "json", fields: [
        { name: "page_start", label: "Start Page", type: "number", min: 1 }, { name: "page_end", label: "End Page", type: "number", min: 1 }
      ]},
      { id: "sign-with-certificate", title: "Sign with Certificate", description: "Apply digital signatures using certificates.", icon: "shield-check", endpoint: "/api/document/sign/apply", responseType: "download", fields: [
        { name: "certificate_file", label: "Certificate File", type: "file", accept: ".p12,.pfx,.pem,.crt,.cer" }, { name: "password", label: "Certificate Password", type: "password" }, { name: "reason", label: "Reason", type: "text", defaultValue: "Approved" }, { name: "location", label: "Location", type: "text" }
      ]},
      { id: "sign", title: "Sign", description: "Add hand-drawn or image signatures.", icon: "pen-tool", endpoint: "/api/document/sign/apply", responseType: "download", fields: [
        { name: "reason", label: "Reason", type: "text", defaultValue: "Approved" }, { name: "location", label: "Location", type: "text" }
      ]}
    ]
  },
  security: {
    title: "Document Security",
    tools: [
      { id: "add-password", title: "Add Password", description: "Protect your PDF with a password.", icon: "lock", endpoint: "/api/security/password/add", responseType: "download", fields: [{ name: "password", label: "Password", type: "password", required: true }] },
      { id: "add-watermark", title: "Add Watermark", description: "Overlay text or images as watermarks.", icon: "droplets", endpoint: "/api/security/watermark/add", responseType: "download", fields: [{ name: "text", label: "Watermark Text", type: "text", required: true }] },
      { id: "add-stamp", title: "Add Stamp to PDF", description: "Apply predefined or custom stamps.", icon: "stamp", endpoint: "/api/security/stamp/add", responseType: "download", fields: [{ name: "text", label: "Stamp Text", type: "text" }, { name: "image_file", label: "Stamp Image", type: "file", accept: "image/*" }] },
      { id: "sanitize", title: "Sanitise", description: "Remove hidden sensitive information.", icon: "eraser", endpoint: "/api/security/sanitize", responseType: "download" },
      { id: "flatten", title: "Flatten", description: "Merge form fields and annotations into the page.", icon: "layers", endpoint: "/api/security/flatten", responseType: "download" },
      { id: "unlock-forms", title: "Unlock PDF Forms", description: "Make restricted form fields editable.", icon: "unlock", endpoint: "/api/security/forms/unlock", responseType: "download" },
      { id: "change-permissions", title: "Change Permissions", description: "Restrict printing, copying, or editing.", icon: "shield", endpoint: "/api/security/permissions/change", responseType: "download", fields: [
        { name: "print_allowed", label: "Allow Printing", type: "checkbox", defaultValue: true }, { name: "modify_allowed", label: "Allow Modifying", type: "checkbox", defaultValue: true }, { name: "copy_allowed", label: "Allow Copying", type: "checkbox", defaultValue: true }, { name: "annotate_allowed", label: "Allow Annotating", type: "checkbox", defaultValue: true }
      ]}
    ]
  },
  verification: {
    title: "Verification",
    tools: [
      { id: "info", title: "Get ALL Info on PDF", description: "Detailed technical report of the PDF structure.", icon: "info", endpoint: "/api/verification/info", responseType: "json" },
      { id: "validate-signature", title: "Validate PDF Signature", description: "Verify the integrity of digital signatures.", icon: "check-circle", endpoint: "/api/verification/validate-signature", responseType: "json" }
    ]
  },
  formatting: {
    title: "Page Formatting",
    tools: [
      { id: "crop", title: "Crop PDF", description: "Adjust page margins and visible area.", icon: "crop", endpoint: "/api/formatting/crop", responseType: "download", fields: [{ name: "x", label: "X", type: "number", defaultValue: 20 }, { name: "y", label: "Y", type: "number", defaultValue: 20 }, { name: "width", label: "Width", type: "number", defaultValue: 400 }, { name: "height", label: "Height", type: "number", defaultValue: 500 }, { name: "page_number", label: "Page Number", type: "number", defaultValue: 1 }] },
      { id: "rotate", title: "Rotate", description: "Rotate pages individually or in bulk.", icon: "rotate-cw", endpoint: "/api/formatting/rotate", responseType: "download", fields: [{ name: "degrees", label: "Rotation", type: "select", required: true, options: [{ value: "90", label: "90 degrees" }, { value: "180", label: "180 degrees" }, { value: "270", label: "270 degrees" }] }] },
      { id: "merge", title: "Merge PDFs", description: "Combine multiple PDF files into one.", icon: "merge", endpoint: "/api/tools/merge", responseType: "download", fields: [{ name: "files", label: "PDF Files", type: "file", accept: "application/pdf", multiple: true, required: true }] },
      { id: "merge-advanced", title: "Merge with Page Ranges", description: "Combine PDFs with selective page ranges.", icon: "filter", endpoint: "/api/tools/merge-advanced", responseType: "download", fields: [
        { name: "files", label: "PDF Files", type: "file", accept: "application/pdf", multiple: true, required: true },
        { name: "page_ranges", label: "Page Ranges (semicolon separated)", type: "text", placeholder: "1-10; 14; 25-; all", help: "One range per file, separated by semicolons. Example: '1-10; 14; 25-'" }
      ]},
      { id: "split", title: "Split", description: "Break a PDF into multiple smaller files.", icon: "split", endpoint: "/api/formatting/split", responseType: "download" },
      { id: "mix", title: "Mix PDFs (Alternating Pages)", description: "Merge PDFs by taking pages alternately from each file.", icon: "shuffle", endpoint: "/api/tools/mix", responseType: "download", fields: [
        { name: "files", label: "PDF Files", type: "file", accept: "application/pdf", multiple: true, required: true },
        { name: "reverse_order", label: "Reverse Order", type: "checkbox", defaultValue: false, help: "Take pages in reverse order (last page first)" }
      ]},
      { id: "reorder", title: "Reorganize Pages", description: "Drag and drop to reorder pages.", icon: "layout", endpoint: "/api/formatting/reorder", responseType: "download", fields: [{ name: "order_json", label: "Order JSON", type: "textarea", required: true, rows: 4, defaultValue: JSON.stringify([1], null, 2) }] },
      { id: "resize", title: "Adjust page size/scale", description: "Resize pages to standard formats like A4.", icon: "maximize", endpoint: "/api/formatting/resize", responseType: "download", fields: [{ name: "width", label: "Width", type: "number", defaultValue: 595 }, { name: "height", label: "Height", type: "number", defaultValue: 842 }, { name: "unit", label: "Unit", type: "select", defaultValue: "pt", options: [{ value: "pt", label: "Points" }, { value: "mm", label: "Millimeters" }, { value: "inch", label: "Inches" }] }] },
      { id: "page-numbers", title: "Add Page Numbers", description: "Insert dynamic page numbering.", icon: "hash", endpoint: "/api/formatting/add-page-numbers", responseType: "download", fields: [{ name: "position", label: "Position", type: "text", defaultValue: "bottom-center" }, { name: "font_size", label: "Font Size", type: "number", defaultValue: 12 }, { name: "start_number", label: "Start Number", type: "number", defaultValue: 1 }] },
      { id: "multi-page-layout", title: "Multi-Page Layout", description: "Print multiple pages on a single sheet.", icon: "grid-2x2", endpoint: "/api/formatting/multi-page-layout", responseType: "download", fields: [{ name: "rows", label: "Rows", type: "number", defaultValue: 2 }, { name: "cols", label: "Columns", type: "number", defaultValue: 2 }] },
      { id: "booklet", title: "Booklet Imposition", description: "Prepare pages for booklet printing.", icon: "book", endpoint: "/api/formatting/booklet", responseType: "download", fields: [{ name: "pages_per_sheet", label: "Pages Per Sheet", type: "number", defaultValue: 4 }, { name: "duplex", label: "Duplex", type: "checkbox", defaultValue: true }] },
      { id: "single-large-page", title: "PDF to Single Large Page", description: "Combine all pages into one long canvas.", icon: "file-plus", endpoint: "/api/formatting/single-large-page", responseType: "download" },
      { id: "attachments", title: "Add Attachments", description: "Embed files directly into the PDF.", icon: "paperclip", endpoint: "/api/formatting/add-attachments", responseType: "download", fields: [{ name: "attachment_files", label: "Attachment", type: "file", required: true }] }
    ]
  },
  extraction: {
    title: "Extraction",
    tools: [
      { id: "extract-pages", title: "Extract Pages", description: "Save specific pages as a new PDF.", icon: "copy", endpoint: "/api/extraction/pages", responseType: "download", fields: [{ name: "page_range", label: "Page Range", type: "text", required: true, defaultValue: "1-2" }] },
      { id: "extract-images", title: "Extract Images", description: "Pull all embedded images from the document.", icon: "image", endpoint: "/api/extraction/images", responseType: "download", fields: [{ name: "page_start", label: "Start Page", type: "number", min: 1 }, { name: "page_end", label: "End Page", type: "number", min: 1 }] }
    ]
  },
  removal: {
    title: "Removal",
    tools: [
      { id: "remove-pages", title: "Remove Pages", description: "Delete unwanted pages from the PDF.", icon: "trash-2", endpoint: "/api/removal/pages", responseType: "download", fields: [{ name: "pages_json", label: "Pages JSON", type: "textarea", required: true, rows: 5, defaultValue: JSON.stringify([2], null, 2) }] },
      { id: "remove-blank-pages", title: "Remove Blank pages", description: "Automatically detect and remove empty pages.", icon: "eraser", endpoint: "/api/removal/blank-pages", responseType: "download", fields: [{ name: "threshold", label: "Blank Threshold", type: "number", defaultValue: 0.98, step: "0.01" }] },
      { id: "remove-annotations", title: "Remove Annotations", description: "Clear all comments and highlights.", icon: "eraser", endpoint: "/api/removal/annotations", responseType: "download" },
      { id: "remove-image", title: "Remove image", description: "Strip images from the document.", icon: "image", endpoint: "/api/removal/images", responseType: "download" },
      { id: "remove-password", title: "Remove Password", description: "Decrypt and remove password protection.", icon: "key", endpoint: "/api/removal/password", responseType: "download", fields: [{ name: "password", label: "Current Password", type: "password", required: true }] },
      { id: "remove-certificate-sign", title: "Remove Certificate Sign", description: "Strip digital signatures from the file.", icon: "user-x", endpoint: "/api/removal/certificate-sign", responseType: "download" }
    ]
  },
  automation: {
    title: "Automation",
    tools: [
      { id: "auto-rename", title: "Auto Rename PDF File", description: "Rename based on content or metadata.", icon: "wand-2", endpoint: "/api/automation/auto-rename", responseType: "download", fields: [{ name: "pattern", label: "Pattern", type: "text", required: true, defaultValue: "{filename}_processed" }] },
      { id: "automate", title: "Automate", description: "Run custom processing pipelines.", icon: "play", endpoint: "/api/automation/automate", responseType: "download", fields: [{ name: "actions_json", label: "Actions JSON", type: "textarea", required: true, rows: 8, defaultValue: JSON.stringify([{ type: "watermark", text: "INTERNAL" }], null, 2) }] }
    ]
  },
  general: {
    title: "General",
    tools: [
      { id: "add-text", title: "Add Text", description: "Insert new text blocks into the PDF.", icon: "type", endpoint: "/api/general/add-text", responseType: "download", fields: [{ name: "text", label: "Text", type: "text", required: true }, { name: "x", label: "X", type: "number", defaultValue: 72 }, { name: "y", label: "Y", type: "number", defaultValue: 72 }, { name: "page", label: "Page", type: "number", defaultValue: 1 }, { name: "font_size", label: "Font Size", type: "number", defaultValue: 14 }, { name: "color", label: "Color", type: "text", defaultValue: "#111827" }] },
      { id: "add-image", title: "Add image", description: "Place images onto PDF pages.", icon: "image", endpoint: "/api/general/add-image", responseType: "download", fields: [{ name: "image_file", label: "Image File", type: "file", accept: "image/*", required: true }, { name: "x", label: "X", type: "number", defaultValue: 72 }, { name: "y", label: "Y", type: "number", defaultValue: 72 }, { name: "width", label: "Width", type: "number", defaultValue: 120 }, { name: "height", label: "Height", type: "number", defaultValue: 80 }, { name: "page", label: "Page", type: "number", defaultValue: 1 }] },
      { id: "annotate", title: "Annotate", description: "Draw, highlight, and comment.", icon: "pen-tool", endpoint: "/api/general/annotate", responseType: "download", fields: [{ name: "annotation_json", label: "Annotation JSON", type: "textarea", required: true, rows: 8, defaultValue: JSON.stringify({ type: "highlight", rect: { x: 72, y: 72, width: 120, height: 24 }, page: 1, color: "#fde68a" }, null, 2) }] }
    ]
  },
  advanced: {
    title: "Advanced Formatting",
    tools: [
      { id: "adjust-colors", title: "Adjust Colours/Contrast", description: "Modify visual properties of the document.", icon: "palette", endpoint: "/api/advanced/adjust-colors", responseType: "download", fields: [{ name: "brightness", label: "Brightness", type: "number", defaultValue: 1, step: "0.1" }, { name: "contrast", label: "Contrast", type: "number", defaultValue: 1, step: "0.1" }, { name: "saturation", label: "Saturation", type: "number", defaultValue: 1, step: "0.1" }] },
      { id: "repair", title: "Repair", description: "Fix corrupted or broken PDF files.", icon: "wrench", endpoint: "/api/advanced/repair", responseType: "download" },
      { id: "detect-split-scanned", title: "Detect & Split Scanned Photos", description: "Identify multiple photos on a single scan.", icon: "camera", endpoint: "/api/advanced/detect-split-scanned", responseType: "download", fields: [{ name: "threshold", label: "Threshold", type: "number", defaultValue: 0.5, step: "0.05" }] },
      { id: "overlay", title: "Overlay PDFs", description: "Merge two PDFs by overlaying pages.", icon: "copy", endpoint: "/api/advanced/overlay", responseType: "download", primaryFieldName: "base_file", fields: [{ name: "overlay_file", label: "Overlay PDF", type: "file", accept: "application/pdf", required: true }, { name: "opacity", label: "Opacity", type: "number", defaultValue: 0.5, step: "0.1" }] },
      { id: "replace-invert-color", title: "Replace & Invert Colour", description: "Invert colors or replace specific ones.", icon: "replace", endpoint: "/api/advanced/replace-invert-color", responseType: "download", fields: [{ name: "mode", label: "Mode", type: "select", required: true, options: [{ value: "invert", label: "Invert" }, { value: "replace", label: "Replace" }] }, { name: "target_color", label: "Target Color", type: "text", defaultValue: "#000000" }, { name: "replacement_color", label: "Replacement Color", type: "text", defaultValue: "#ffffff" }] },
      { id: "scanner-effect", title: "Scanner Effect", description: "Make digital PDFs look like physical scans.", icon: "zap", endpoint: "/api/advanced/scanner-effect", responseType: "download", fields: [{ name: "effect", label: "Effect", type: "text", defaultValue: "grayscale" }] }
    ]
  },
  conversion: {
    title: "Conversion",
    tools: [
      { id: "pdf-to-word", title: "PDF to Word", description: "Convert PDF files to editable DOCX documents.", icon: "file-text", endpoint: "/api/tools/pdf-to-word", responseType: "download" },
      { id: "pdf-to-pptx", title: "PDF to PowerPoint", description: "Convert PDF to PPTX presentation slides.", icon: "presentation", endpoint: "/api/tools/pdf-to-pptx", responseType: "download" },
      { id: "pdf-to-excel", title: "PDF to Excel", description: "Extract tables from PDF to XLSX spreadsheets.", icon: "table", endpoint: "/api/tools/pdf-to-excel", responseType: "download" },
      { id: "word-to-pdf", title: "Word to PDF", description: "Convert DOC/DOCX documents to PDF format.", icon: "file-text", endpoint: "/api/tools/word-to-pdf", responseType: "download", fields: [{ name: "file", label: "Word Document", type: "file", accept: ".doc,.docx", required: true }] },
      { id: "pptx-to-pdf", title: "PowerPoint to PDF", description: "Convert PPT/PPTX presentations to PDF.", icon: "presentation", endpoint: "/api/tools/pptx-to-pdf", responseType: "download", fields: [{ name: "file", label: "PowerPoint File", type: "file", accept: ".ppt,.pptx", required: true }] },
      { id: "excel-to-pdf", title: "Excel to PDF", description: "Convert XLS/XLSX spreadsheets to PDF.", icon: "table", endpoint: "/api/tools/excel-to-pdf", responseType: "download", fields: [{ name: "file", label: "Excel File", type: "file", accept: ".xls,.xlsx", required: true }] },
      { id: "html-to-pdf", title: "HTML to PDF", description: "Convert webpages or HTML files to PDF.", icon: "globe", endpoint: "/api/tools/html-to-pdf", responseType: "download", fields: [{ name: "url", label: "URL", type: "text", required: false }, { name: "html", label: "HTML Content", type: "textarea", required: false, rows: 5 }] },
      { id: "pdf-to-pdfa", title: "PDF to PDF/A", description: "Convert PDF to archival PDF/A format.", icon: "archive", endpoint: "/api/tools/pdf-to-pdfa", responseType: "download" },
      { id: "pdf-to-jpg", title: "PDF to JPG", description: "Convert PDF pages to JPG images.", icon: "image", endpoint: "/api/tools/convert/pdf-to-images", responseType: "download" },
      { id: "jpg-to-pdf", title: "JPG to PDF", description: "Convert JPG images to PDF document.", icon: "file-image", endpoint: "/api/tools/convert/images-to-pdf", responseType: "download", fields: [{ name: "files", label: "Image Files", type: "file", accept: "image/*", multiple: true, required: true }] },
      { id: "ocr-pdf", title: "OCR PDF", description: "Make scanned PDFs searchable and editable.", icon: "scan-text", endpoint: "/api/ocr", responseType: "json" }
    ]
  },
  ai: {
    title: "AI Tools",
    tools: [
      { id: "ai-summarize", title: "AI Summarizer", description: "Generate concise summaries from PDF content.", icon: "sparkles", endpoint: "/api/tools/ai-summarize", responseType: "json" },
      { id: "translate-pdf", title: "Translate PDF", description: "Translate PDF content to other languages.", icon: "languages", endpoint: "/api/tools/translate", responseType: "json", fields: [{ name: "target_lang", label: "Target Language", type: "text", defaultValue: "en", required: true }] }
    ]
  },
  comparison: {
    title: "Comparison",
    tools: [
      { id: "compare-pdf", title: "Compare PDF", description: "Show side-by-side comparison of two PDFs.", icon: "git-compare", endpoint: "/api/tools/compare", responseType: "json", fields: [{ name: "file1", label: "First PDF", type: "file", accept: "application/pdf", required: true }, { name: "file2", label: "Second PDF", type: "file", accept: "application/pdf", required: true }] }
    ]
  },
  developer: {
    title: "Developer Tools",
    tools: [
      { id: "show-javascript", title: "Show Javascript", description: "View embedded JavaScript in the PDF.", icon: "code", endpoint: "/api/developer/show-javascript", responseType: "json" },
      { id: "api", title: "API", description: "Access developer API documentation.", icon: "terminal", endpoint: "/api/developer/api", method: "GET", requiresPrimaryFile: false, responseType: "json" },
      { id: "folder-scan", title: "Automated Folder Scanning", description: "Watch folders for automatic processing.", icon: "folder-open", endpoint: "/api/developer/folder-scan", responseType: "json", requiresPrimaryFile: false, fields: [{ name: "folder_path", label: "Folder Path", type: "text", required: true }, { name: "action", label: "Action", type: "text", required: true, defaultValue: "scan" }] },
      { id: "sso-guide", title: "SSO Guide", description: "Integration guide for Single Sign-On.", icon: "users", endpoint: "/api/developer/sso-guide", method: "GET", requiresPrimaryFile: false, responseType: "json" },
      { id: "airgapped-setup", title: "Air-gapped Setup", description: "Instructions for offline deployments.", icon: "wifi-off", endpoint: "/api/developer/airgapped-setup", method: "GET", requiresPrimaryFile: false, responseType: "json" }
    ]
  }
};

const ORDER = ["document-review", "security", "verification", "formatting", "extraction", "removal", "automation", "general", "advanced", "conversion", "ai", "comparison", "developer"];
const el = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function syncTheme() {
  try {
    const settings = JSON.parse(localStorage.getItem("coaSettings") || "{}");
    if (settings.theme) document.body.dataset.theme = settings.theme;
    if (settings.density) document.body.dataset.density = settings.density;
  } catch {}
}

function getPrimaryFile() {
  return el("toolsPrimaryFile")?.files?.[0] || null;
}

function setStatus(message) {
  const node = el("toolsStatus");
  if (node) node.textContent = message;
}

function fieldMarkup(field) {
  if (field.type === "textarea") return `<div class="tools-field${field.full ? " full" : ""}"><label>${esc(field.label)}</label><textarea name="${esc(field.name)}" rows="${field.rows || 5}" ${field.required ? "required" : ""}>${esc(field.defaultValue || "")}</textarea></div>`;
  if (field.type === "select") return `<div class="tools-field${field.full ? " full" : ""}"><label>${esc(field.label)}</label><select name="${esc(field.name)}" ${field.required ? "required" : ""}>${(field.options || []).map((opt) => `<option value="${esc(opt.value)}"${opt.value === field.defaultValue ? " selected" : ""}>${esc(opt.label)}</option>`).join("")}</select></div>`;
  if (field.type === "checkbox") return `<div class="tools-field${field.full ? " full" : ""}"><label><input type="checkbox" name="${esc(field.name)}" ${field.defaultValue ? "checked" : ""} /> ${esc(field.label)}</label></div>`;
  return `<div class="tools-field${field.full ? " full" : ""}"><label>${esc(field.label)}</label><input name="${esc(field.name)}" type="${esc(field.type || "text")}" ${field.accept ? `accept="${esc(field.accept)}"` : ""} ${field.required ? "required" : ""} ${field.defaultValue !== undefined && field.type !== "file" ? `value="${esc(field.defaultValue)}"` : ""} ${field.min !== undefined ? `min="${esc(field.min)}"` : ""} ${field.step !== undefined ? `step="${esc(field.step)}"` : ""} /></div>`;
}

function renderOverview() {
  const container = el("toolsOverview");
  if (!container) return;
  container.innerHTML = ORDER.map((key) => {
    const category = CFG[key];
    return `
      <section class="toolbox-section">
        <div class="toolbox-section-head"><h2>${esc(category.title)}</h2></div>
        <div class="toolbox-grid">
          ${category.tools.map((tool) => `
            <button class="toolbox-card" type="button" data-tool-id="${esc(tool.id)}" data-category="${esc(key)}">
              <span class="toolbox-card-icon"><i data-lucide="${esc(tool.icon)}"></i></span>
              <h3 class="toolbox-card-title">${esc(tool.title)}</h3>
              <p class="toolbox-card-copy">${esc(tool.description)}</p>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");

  container.querySelectorAll(".toolbox-card").forEach((button) => {
    button.addEventListener("click", () => {
      const category = CFG[button.dataset.category];
      const tool = category.tools.find((entry) => entry.id === button.dataset.toolId);
      if (tool) openModal(category.title, tool);
    });
  });
}

function wireDropzone() {
  const zone = el("toolsDropzone");
  const input = el("toolsPrimaryFile");
  const name = el("toolsFilename");
  if (!zone || !input) return;
  const update = () => { name.textContent = input.files?.[0]?.name || "No file selected"; };
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", update);
  zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    update();
  });
}

function resultMarkup(content, asJson = false) {
  return asJson ? `<pre>${esc(JSON.stringify(content, null, 2))}</pre>` : `<pre>${esc(content)}</pre>`;
}

function filenameFromResponse(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function parseError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    return json.detail || json.error || JSON.stringify(json);
  }
  return response.text().catch(() => `Request failed with ${response.status}`);
}

async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    // Wait for pdfjsLib to be initialized by pdf-init.js
    await new Promise((resolve) => {
      const check = () => {
        if (window.pdfjsLib) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
  }
  return fullText;
}

async function runGeminiTool(tool, formEl, resultEl) {
  const primaryFile = getPrimaryFile();
  if (!primaryFile) throw new Error("Upload a main PDF first.");

  setStatus(`Extracting text for "${tool.title}"...`);
  const text = await extractTextFromPdf(primaryFile);
  if (!text.trim()) throw new Error("Could not extract any text from the PDF.");

  setStatus(`Calling Gemini for "${tool.title}"...`);
  const apiKey = (window.process?.env?.GEMINI_API_KEY) || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : "");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Please configure it in the environment.");
  const ai = new GoogleGenAI({ apiKey });
  
  let prompt = "";
  if (tool.id === "ai-summarize") {
    prompt = `Summarize the following PDF content concisely:\n\n${text}`;
  } else if (tool.id === "translate-pdf") {
    const targetLang = formEl.querySelector('[name="target_lang"]')?.value || "en";
    prompt = `Translate the following PDF content to ${targetLang}:\n\n${text}`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  const result = {
    status: "ok",
    [tool.id === "ai-summarize" ? "summary" : "translation"]: response.text,
    original_length: text.length
  };

  resultEl.innerHTML = resultMarkup(result, true);
  return `Finished "${tool.title}" using Gemini.`;
}

async function runTool(tool, formEl, resultEl) {
  if (tool.id === "ai-summarize" || tool.id === "translate-pdf") {
    return runGeminiTool(tool, formEl, resultEl);
  }
  const method = tool.method || "POST";
  let response;
  if (method === "GET") {
    response = await fetch(tool.endpoint, { method: "GET" });
  } else {
    const data = new FormData();
    if (tool.requiresPrimaryFile !== false) {
      const primaryFile = getPrimaryFile();
      if (!primaryFile) throw new Error("Upload a main PDF first from the toolbox page.");
      data.append(tool.primaryFieldName || "file", primaryFile, primaryFile.name);
    }
    for (const field of tool.fields || []) {
      const input = formEl.querySelector(`[name="${field.name}"]`);
      if (!input) continue;
      if (field.type === "file") {
        const file = input.files?.[0];
        if (field.required && !file) throw new Error(`Select ${field.label}.`);
        if (file) data.append(field.name, file, file.name);
        continue;
      }
      if (field.type === "checkbox") {
        data.append(field.name, input.checked ? "true" : "false");
        continue;
      }
      const value = input.value?.trim?.() ?? input.value;
      if (field.required && !value) throw new Error(`Enter ${field.label}.`);
      if (value !== "" && value !== undefined && value !== null) data.append(field.name, value);
    }
    response = await fetch(tool.endpoint, { method, body: data });
  }

  if (!response.ok) throw new Error(await parseError(response));

  const contentType = response.headers.get("content-type") || "";
  if (tool.responseType === "json" || contentType.includes("application/json")) {
    const json = await response.json();
    resultEl.innerHTML = resultMarkup(json, true);
    return `Finished "${tool.title}".`;
  }

  const blob = await response.blob();
  const filename = filenameFromResponse(response, `${tool.id}.pdf`);
  downloadBlob(blob, filename);
  resultEl.innerHTML = resultMarkup(`Download started: ${filename}`);
  return `Finished "${tool.title}". File download started.`;
}

function closeModal() {
  const modal = el("toolsModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.innerHTML = "";
}

function openModal(categoryTitle, tool) {
  const modal = el("toolsModal");
  if (!modal) return;
  modal.innerHTML = `
    <div class="toolbox-dialog">
      <div class="toolbox-dialog-head">
        <div>
          <div class="tools-kicker">${esc(categoryTitle)}</div>
          <h2 class="toolbox-dialog-title">${esc(tool.title)}</h2>
          <p class="toolbox-dialog-subtitle">${esc(tool.description)}</p>
        </div>
        <button class="toolbox-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="toolbox-dialog-body">
        <div class="tools-status">${tool.requiresPrimaryFile === false ? "This tool does not require the main PDF upload." : `Main PDF: ${esc(getPrimaryFile()?.name || "No file selected yet")}`}</div>
        <form id="toolboxModalForm" class="tools-form">${(tool.fields?.length ? tool.fields.map(fieldMarkup).join("") : `<div class="tools-field full"><label>No extra parameters</label><div class="tools-status">This action only uses the main PDF.</div></div>`)}</form>
        <div class="tools-toolbar">
          <button id="toolboxRunBtn" type="button" class="btn btn-primary">Run ${esc(tool.title)}</button>
          <button id="toolboxCloseBtn" type="button" class="btn">Close</button>
        </div>
        <div id="toolboxModalResult" class="tools-result toolbox-dialog-result">Run the tool to see JSON output or download status here.</div>
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
  if (window.lucide) window.lucide.createIcons();

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  }, { once: true });
  modal.querySelector(".toolbox-close").addEventListener("click", closeModal);
  modal.querySelector("#toolboxCloseBtn").addEventListener("click", closeModal);

  const runBtn = modal.querySelector("#toolboxRunBtn");
  const formEl = modal.querySelector("#toolboxModalForm");
  const resultEl = modal.querySelector("#toolboxModalResult");
  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    setStatus(`Running "${tool.title}"...`);
    try {
      const message = await runTool(tool, formEl, resultEl);
      setStatus(message);
    } catch (error) {
      const text = error?.message || String(error);
      resultEl.innerHTML = resultMarkup(text);
      setStatus(text);
    } finally {
      runBtn.disabled = false;
    }
  });
}

export function initPdfToolsPage() {
  syncTheme();
  wireDropzone();
  renderOverview();
  setStatus("Upload a PDF, then open any tool card.");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el("toolsModal").classList.contains("hidden")) closeModal();
  });
  if (window.lucide) window.lucide.createIcons();
}
