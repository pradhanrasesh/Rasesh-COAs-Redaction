// frontend/app/RedactionWordList.js
// Persistent redaction word list with localStorage

const STORAGE_KEY = "redaction_word_list";
const DEFAULT_LIST = [
  "CONFIDENTIAL",
  "PROPRIETARY",
  "INTERNAL USE ONLY",
  "TRADE SECRET",
  "SENSITIVE"
];

export let redactionWordList = [];

// Initialize from localStorage
export function initRedactionWordList() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      redactionWordList = JSON.parse(stored);
      console.log("[RedactionWordList] Loaded", redactionWordList.length, "words");
    } else {
      redactionWordList = [...DEFAULT_LIST];
      saveRedactionWordList();
      console.log("[RedactionWordList] Initialized with defaults");
    }
  } catch (err) {
    console.error("[RedactionWordList] Failed to load:", err);
    redactionWordList = [...DEFAULT_LIST];
  }
}

// Save to localStorage
export function saveRedactionWordList() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(redactionWordList));
  } catch (err) {
    console.error("[RedactionWordList] Failed to save:", err);
  }
}

// Add a word to the list (case-insensitive, unique)
export function addWordToRedactionList(word) {
  if (!word || typeof word !== 'string') return false;
  
  const normalized = word.trim().toUpperCase();
  if (!normalized) return false;
  
  // Check if already exists
  if (redactionWordList.some(w => w.toUpperCase() === normalized)) {
    return false;
  }
  
  redactionWordList.push(normalized);
  saveRedactionWordList();
  console.log("[RedactionWordList] Added:", normalized);
  return true;
}

// Remove a word from the list
export function removeWordFromRedactionList(word) {
  const normalized = word.trim().toUpperCase();
  const initialLength = redactionWordList.length;
  
  redactionWordList = redactionWordList.filter(w => w.toUpperCase() !== normalized);
  
  if (redactionWordList.length !== initialLength) {
    saveRedactionWordList();
    console.log("[RedactionWordList] Removed:", normalized);
    return true;
  }
  
  return false;
}

// Get all words
export function getRedactionWordList() {
  return [...redactionWordList];
}

// Clear the list
export function clearRedactionWordList() {
  redactionWordList = [];
  saveRedactionWordList();
  console.log("[RedactionWordList] Cleared");
}

// Apply redaction word list to current PDF
export async function applyRedactionWordList() {
  const { textStore } = await import("./TextLayer.js");
  const { performSearch } = await import("./Search.js");
  const { showAlert } = await import("./alert.js");
  
  if (!redactionWordList.length) {
    showAlert("info", "Redaction word list is empty");
    return;
  }
  
  // Create a regex pattern that matches any word in the list
  const escapedWords = redactionWordList.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = `\\b(${escapedWords.join('|')})\\b`;
  
  // Temporarily set search input to the pattern
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) {
    showAlert("error", "Search input not found");
    return;
  }
  
  const originalQuery = searchInput.value;
  searchInput.value = pattern;
  
  // Perform search to find all matches
  await performSearch();
  
  // Get search results
  const { searchResults } = await import("./Utils.js");
  
  if (!searchResults || searchResults.length === 0) {
    searchInput.value = originalQuery;
    showAlert("info", "No matches found for redaction word list");
    return;
  }
  
  // Redact all matches
  const { redactions, setRedactions, pushUndo } = await import("./Utils.js");
  const { renderAllPages } = await import("./PDF_Loader.js");
  
  pushUndo();
  const map = structuredClone(redactions || {});
  
  for (const r of searchResults) {
    const page = r.page;
    if (!map[page]) map[page] = [];
    map[page].push({
      page,
      type: "wordlist",
      rects: r.rects,
      color: "#000000"
    });
  }
  
  setRedactions(map);
  await renderAllPages();
  
  // Restore original query
  searchInput.value = originalQuery;
  
  showAlert("success", `Applied redaction word list: ${searchResults.length} matches redacted`);
}

// Export list to JSON file
export function exportRedactionWordList() {
  const data = JSON.stringify(redactionWordList, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `redaction-word-list-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}

// Import list from JSON file
export function importRedactionWordList(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          // Add all unique words from imported list
          let added = 0;
          imported.forEach(word => {
            if (typeof word === 'string' && word.trim()) {
              const normalized = word.trim().toUpperCase();
              if (!redactionWordList.some(w => w.toUpperCase() === normalized)) {
                redactionWordList.push(normalized);
                added++;
              }
            }
          });
          
          saveRedactionWordList();
          resolve({ success: true, added, total: redactionWordList.length });
        } else {
          reject(new Error("Invalid format: expected array of strings"));
        }
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}