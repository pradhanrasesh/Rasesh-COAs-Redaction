// ------------------------------------------------------------
// TextLayer.js — PDF.js v5 text layer builder (FIXED)
// ------------------------------------------------------------

import * as pdfjsLib from "../pdfjs/pdf.mjs";

export const textStore = {};

// ------------------------------------------------------------
// buildTextLayer(view, viewport)
// ------------------------------------------------------------
export async function buildTextLayer(view, viewport) {
  const { page, textLayerDiv, pageNumber } = view;

  console.log("[TextLayer] Building page", pageNumber);

  textLayerDiv.innerHTML = "";
  textLayerDiv.style.display = "block";
  textLayerDiv.style.opacity = "1";
  textLayerDiv.style.pointerEvents = "auto";

  const textContent = await page.getTextContent();
  const items = textContent.items;

  // Initialize store
  textStore[pageNumber] = {
    fullText: "",
    charMap: [],
    spans: []
  };

  for (const item of items) {
    if (!item.str) continue;

    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.position = "absolute";
    span.style.whiteSpace = "pre";

    // Transform → viewport coordinates
    //const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    //const x = tx[4];
    //const y = tx[5];
    //const fontHeight = Math.hypot(tx[2], tx[3]);
    //const width = item.width * viewport.scale;
    //const top = viewport.height - y - fontHeight;

    // ⭐ Correct PDF.js v5 text transform
    const [a, b, c, d, e, f] = item.transform;

    // Convert PDF coordinate system → canvas coordinate system
    const x = e * viewport.scale;
    const y = (viewport.height - f * viewport.scale);

    const fontHeight = Math.abs(d * viewport.scale);
    const width = item.width * viewport.scale;

    // PDF.js text origin is bottom-left → convert to top-left
    const top = y - fontHeight;

    span.style.left = `${x}px`;
    span.style.top = `${top}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.height = `${fontHeight}px`;
    span.style.width = `${width}px`;
    textLayerDiv.appendChild(span);

    // Normalized coordinates
    const spanInfo = {
      text: item.str,
      x0: x / viewport.width,
      y0: top / viewport.height,
      x1: (x + width) / viewport.width,
      y1: (top + fontHeight) / viewport.height
    };

    textStore[pageNumber].spans.push(spanInfo);

    // Build fullText + charMap
    const charWidth = width / item.str.length;

    for (let i = 0; i < item.str.length; i++) {
      const cx0 = (x + charWidth * i) / viewport.width;
      const cx1 = (x + charWidth * (i + 1)) / viewport.width;

      textStore[pageNumber].charMap.push({
        char: item.str[i],
        x0: cx0,
        y0: spanInfo.y0,
        x1: cx1,
        y1: spanInfo.y1
      });

      textStore[pageNumber].fullText += item.str[i];
    }
  }

  // ------------------------------------------------------------
  // ⭐ DEBUG LOGS YOU REQUESTED
  // ------------------------------------------------------------
  console.log(
    `[TextLayer] page ${pageNumber} fullText length:`,
    textStore[pageNumber].fullText.length
  );
  console.log(
    `[TextLayer] page ${pageNumber} sample:`,
    textStore[pageNumber].fullText.slice(0, 200)
  );
}

// ------------------------------------------------------------
// clearTextStore()
// ------------------------------------------------------------
export function clearTextStore() {
  for (const key in textStore) delete textStore[key];
}
