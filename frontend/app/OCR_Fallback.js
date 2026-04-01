// ------------------------------------------------------------
// OCR_Fallback.js — Run OCR when PDF.js finds no real text
// ------------------------------------------------------------

import { textStore } from "./TextLayer.js";
import { renderAllPages } from "./PDF_Loader.js";
import { originalPdfBytes } from "./Utils.js";   // ⭐ FIXED: import at top
import { showAlert } from "./alert.js";

export async function runOCRFallback() {
  const hasRealText = Object.values(textStore).some(
    store => store.fullText && store.fullText.trim().length > 5
  );

  if (hasRealText) {
    console.log("OCR not needed — PDF has real extractable text.");
    return;
  }

  console.log("🔍 No real text found — running OCR fallback...");

  const form = new FormData();
  form.append(
    "file",
    new Blob([originalPdfBytes], { type: "application/pdf" }),   // ⭐ FIXED
    "file.pdf"
  );

  let res;
  try {
    res = await fetch("/api/ocr", {
      method: "POST",
      body: form
    });
  } catch (networkError) {
    console.error("OCR fetch failed:", networkError);
    showAlert("error", "OCR request failed: Network error. Please check backend server.");
    return;
  }

  let words;
  try {
    words = await res.json();
  } catch (parseError) {
    console.error("OCR response parse failed:", parseError);
    showAlert("error", "OCR failed: Invalid response from server.");
    return;
  }

  if (!res.ok) {
    const errorDetail = words?.detail || words?.error || `HTTP ${res.status}`;
    console.error("OCR backend error:", errorDetail);
    let userMessage = `OCR failed: ${errorDetail}.`;
    // Provide actionable guidance based on error
    if (errorDetail.includes("Tesseract") || errorDetail.includes("language")) {
      userMessage += " Try installing Tesseract OCR language packs or using a different OCR engine.";
    } else if (errorDetail.includes("large") || errorDetail.includes("size")) {
      userMessage += " Try uploading a smaller file or splitting the PDF.";
    } else if (errorDetail.includes("unsupported") || errorDetail.includes("format")) {
      userMessage += " Ensure the PDF contains readable text or images.";
    }
    showAlert("error", userMessage);
    return;
  }

  if (!Array.isArray(words)) {
    console.error("OCR returned non-array:", words);
    showAlert("error", "OCR failed: Unexpected response format.");
    return;
  }

  if (words.length === 0) {
    showAlert("warn", "OCR completed but no text detected. The PDF may be empty or contain only images. Try a different OCR engine or language.");
    return;
  }

  console.log("🔍 OCR results:", words);

  for (const w of words) {
    if (!textStore[w.page]) {
      textStore[w.page] = { fullText: "", charMap: [], spans: [] };
    }

    const store = textStore[w.page];

    store.fullText += w.text + " ";

    store.charMap.push({
      char: w.text,
      x0: w.x0,
      y0: w.y0,
      x1: w.x1,
      y1: w.y1
    });

    store.spans.push({
      text: w.text,
      x0: w.x0,
      y0: w.y0,
      x1: w.x1,
      y1: w.y1
    });
  }

  console.log("🔍 OCR textStore built:", textStore);
  await renderAllPages();
}
