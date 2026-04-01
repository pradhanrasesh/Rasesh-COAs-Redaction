import { textStore } from "./TextLayer.js";
import { performSearch } from "./Search.js";
import { addWordToRedactionList, getRedactionWordList } from "./RedactionWordList.js";
import { showAlert } from "./alert.js";

let suggestionsReady = false;
let suggestionWords = [];   // flat list of unique words

export function initSearchSuggestions() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchSuggestions");

  if (!input || !box) {
    console.warn("[Suggestions] searchInput or searchSuggestions not found in DOM");
    return;
  }

  // ------------------------------------------------------------
  // Build suggestions index once, after pages are rendered
  // ------------------------------------------------------------
  document.addEventListener("pages-rendered", () => {
    console.log("[Suggestions] pages-rendered fired, building word index…");

    const wordSet = new Set();

    for (const page in textStore) {
      const store = textStore[page];
      if (!store || !store.fullText) continue;

      // Split on whitespace, strip basic punctuation
      const rawWords = store.fullText.split(/\s+/);

      for (let w of rawWords) {
        w = w.trim();
        if (!w) continue;

        // remove leading/trailing punctuation like commas, periods, etc.
        w = w.replace(/^[^\w]+|[^\w]+$/g, "");
        if (!w) continue;

        wordSet.add(w);
      }
    }

    suggestionWords = Array.from(wordSet);
    suggestionsReady = true;

    console.log("[Suggestions] index built. Unique words:", suggestionWords.length);
    console.log("[Suggestions] sample:", suggestionWords.slice(0, 30));
  });

  // ------------------------------------------------------------
  // Input handler
  // ------------------------------------------------------------
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    if (!suggestionsReady) {
      console.log("[Suggestions] not ready yet (no pages-rendered or empty textStore)");
      box.classList.add("hidden");
      return;
    }

    if (!q) {
      box.classList.add("hidden");
      return;
    }

    // Filter words that start with the query
    const matches = suggestionWords
      .filter(w => w.toLowerCase().startsWith(q))
      .slice(0, 15);

    console.log("[Suggestions] query:", q, "matches:", matches.length);

    box.innerHTML = "";

    if (!matches.length) {
      box.classList.add("hidden");
      return;
    }

    // Get current redaction word list to show which words are already in it
    const redactionList = getRedactionWordList();
    const redactionSet = new Set(redactionList.map(w => w.toUpperCase()));

    matches.forEach(word => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      
      // Check if word is already in redaction list
      const isInRedactionList = redactionSet.has(word.toUpperCase());
      
      // Create main text
      const textSpan = document.createElement("span");
      textSpan.textContent = word;
      textSpan.style.flex = "1";
      
      // Create add/remove button
      const actionBtn = document.createElement("button");
      actionBtn.className = "suggestion-action-btn";
      actionBtn.innerHTML = isInRedactionList ?
        '<i data-lucide="check" style="width:12px;height:12px;"></i>' :
        '<i data-lucide="plus" style="width:12px;height:12px;"></i>';
      actionBtn.title = isInRedactionList ? "Remove from redaction list" : "Add to redaction list";
      actionBtn.style.marginLeft = "8px";
      actionBtn.style.padding = "2px 6px";
      actionBtn.style.borderRadius = "4px";
      actionBtn.style.background = "var(--accent-soft)";
      actionBtn.style.border = "none";
      actionBtn.style.cursor = "pointer";
      actionBtn.style.fontSize = "10px";
      
      actionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        
        if (isInRedactionList) {
          // Remove from redaction list
          import("./RedactionWordList.js").then(({ removeWordFromRedactionList }) => {
            if (removeWordFromRedactionList(word)) {
              showAlert("success", `Removed "${word}" from redaction list`);
              // Refresh suggestions to update UI
              input.dispatchEvent(new Event("input"));
            }
          });
        } else {
          // Add to redaction list
          if (addWordToRedactionList(word)) {
            showAlert("success", `Added "${word}" to redaction list`);
            // Refresh suggestions to update UI
            input.dispatchEvent(new Event("input"));
          } else {
            showAlert("info", `"${word}" is already in redaction list`);
          }
        }
      });

      item.appendChild(textSpan);
      item.appendChild(actionBtn);

      item.addEventListener("click", (e) => {
        if (e.target === actionBtn || actionBtn.contains(e.target)) {
          return; // Don't trigger search when clicking the action button
        }
        input.value = word;   // put chosen word into search box
        box.classList.add("hidden");
        performSearch();      // run search with that word
      });

      box.appendChild(item);
    });

    // Add "Add all matches to redaction list" option if there are multiple matches
    if (matches.length > 1) {
      const addAllItem = document.createElement("div");
      addAllItem.className = "suggestion-item suggestion-action";
      addAllItem.style.borderTop = "1px solid var(--border)";
      addAllItem.style.marginTop = "4px";
      addAllItem.style.paddingTop = "6px";
      addAllItem.style.fontWeight = "500";
      addAllItem.style.color = "var(--accent)";
      
      const iconSpan = document.createElement("span");
      iconSpan.innerHTML = '<i data-lucide="list-plus" style="width:12px;height:12px;margin-right:6px;"></i>';
      
      const textSpan = document.createElement("span");
      textSpan.textContent = `Add all ${matches.length} matches to redaction list`;
      
      addAllItem.appendChild(iconSpan);
      addAllItem.appendChild(textSpan);
      
      addAllItem.addEventListener("click", () => {
        let addedCount = 0;
        matches.forEach(word => {
          if (addWordToRedactionList(word)) {
            addedCount++;
          }
        });
        
        if (addedCount > 0) {
          showAlert("success", `Added ${addedCount} words to redaction list`);
        } else {
          showAlert("info", "All words are already in redaction list");
        }
        
        box.classList.add("hidden");
      });
      
      box.appendChild(addAllItem);
    }

    box.classList.remove("hidden");
  });
}
