# Redectio Backend Future Features (Offline AI + Stirling/Acrobat Parity)

This document describes backend capabilities we already have and backend-only future work.
It is intentionally **frontend-agnostic**: if a capability is listed under “future”, we do not
add any new UI wiring in this step.

## Status Legend

- `✅ Backend already implemented`
- `⚠️ Partially implemented (some logic exists, not fully wired/complete)`
- `⏳ Planned (backend work only; UI not included in this step)`

---

## With Frontend (current UI already uses these backend capabilities)

### Offline AI training layer (Local Learning)
- ✅ `config/rules/learned_ai/<company_id>.json` learned data storage
- ✅ Runtime merge of learned rules into curated rules
- ✅ Continuous learning from in-app auto-suggestions:
  - ✅ `POST /api/ai/learn`
  - ✅ deterministic “value -> regex” generalization + confidence updates (heuristic, no ML dependency)
- ✅ Dedicated pair training workflow:
  - ✅ `POST /api/ai/train-pair` (OCR both PDFs, compare detected/suggested candidates, learn removed examples)
- ✅ “AI sensitivity” affects template auto-suggestions:
  - ✅ `aiSensitivity` stored in `localStorage` (frontend)
  - ⚠️ Backend applies confidence gating inside `backend/suggestions.py` (currently template-rule driven)

### Redaction workflow (single + batch)
- ✅ PDF rendering + selection tools (frontend)
- ✅ Manual redaction application:
  - ✅ `POST /api/redact/manual`
- ✅ Batch redaction backend pipeline:
  - ✅ `POST /api/batch/redact` returning a ZIP
- ⚠️ “Save/download button” is a UI concern:
  - ⏳ Backend endpoints exist for saving/exporting PDFs, but UI placement is still a frontend task.

### PDF permission bypass (offline)
- ⚠️ “Locked/encrypted PDF” support is implemented as a fallback unlock approach:
  - ✅ If applying redactions fails, we render pages to images and rebuild a fresh PDF locally.
  - ⏳ Future work could detect lock type earlier (editing/printing flags) and avoid unnecessary rebuilds.

---

## Without Frontend (backend-only future features; no new UI wiring)

## 1) Plugin system parity (Stirling-PDF style pipeline)
- ✅ Existing plugin loader:
  - `backend/plugins/manager.py` discovers `ToolPlugin` subclasses under `backend/plugins/`
  - Current API endpoints can run plugins and return output PDFs.
- ⏳ “Stirling-like modular pipeline” abstraction:
  - Add a backend “pipeline runner” that can chain plugins (e.g. OCR -> classification -> field extraction -> redaction).
  - Add standardized plugin option schemas (JSON schema) so UI can query later.
- ⏳ Add more Stirling-style plugin categories:
  - OCR preprocess
  - PDF structure cleanup
  - Layer/annotation removal
  - Unlock/export steps

## 2) AI engine modules (Offline, no cloud)
The UI already shows AI-driven behavior; this section expands backend-only modules to reach parity with:
- **AI Redaction Tools** (text classification, layout understanding, field extraction)
- Stirling-PDF patterns (behavioral UX parity)

### 2.1 Local OCR
- ✅ Available via existing `TextFinder` with OCR fallback (Tesseract-backed when configured).
- ⏳ Improve OCR span fidelity:
  - multi-block span grouping
  - better line clustering
  - consistent coordinate normalization across render modes.

### 2.2 Local PII detection (regex + heuristics)
- ✅ Exists today inside `backend/suggestions.py` as regex-driven value extraction + heuristics filtering.
- ⏳ Add explicit “pattern redaction modes”:
  - stricter/looser regimes beyond sensitivity gating
  - label-value separation improvements

### 2.3 COA field detection (regex + layout + zones)
- ⚠️ Curated rules handle “label/value” patterns.
- ⏳ Full layout-zone learning:
  - layout-zone suggestion output exists,
  - learning/inference should use learned zones to generate stronger bounding boxes.

### 2.4 AI text classification (backend-only)
- ⏳ Implement a rule-based classifier that assigns:
  - field types (Report No, Account Number, To/Client Name, Phone, Email, Address, PO#, Lab Number, Sample ID, COA Number, etc.)
  - per-span confidence scores
- Note: this remains offline and ML-free in the first iteration (heuristics + feature scoring).

### 2.5 AI layout understanding (backend-only)
- ⏳ Learn and infer:
  - line/row structure
  - table-like sections
  - label/value adjacency zones
- Use learned layout zones stored in `learned_ai/<company_id>.json`.

### 2.6 AI field extraction (backend-only)
- ⏳ Convert classification + layout inference into:
  - final canonical field candidates `{label, value, confidence, rects, page}`

### 2.7 Semantic search (backend-only)
- ⏳ Add local semantic search over OCR text:
  - embeddings can be optional (future), but first implementation can be:
    - BM25/keyword + fuzzy matching
    - rule-assisted synonym expansion per company

---

## 3) PDF cleanup / hardening (Stirling-PDF parity)

### Metadata removal
- ✅ Implemented via existing scrub behavior:
  - `manual_redaction_engine` sets PDF metadata to `None` / scrubs fields
  - `ocr_report` manual endpoint scrubs metadata when enabled.

### Hidden layer removal
- ⏳ Implement optional layer cleanup:
  - remove Optional Content Groups (OCGs) or ensure they are flattened
  - remove hidden layers/unneeded UI elements

### View-only permission remove (“unlock without password” behavior)
- ⚠️ Current behavior is “unlock by render-to-images and rebuild” fallback when redaction application fails.
- ⏳ Add earlier detection of:
  - editing/printing permission flags
  - encrypted PDFs handling
  - apply targeted strategies instead of full rebuild.

### Annotation removal
- ⏳ Implement removal/flattening of:
  - existing annotations
  - markup overlays
  - redaction preview artifacts (if stored separately)

---

## Backend-only API/Feature Checklist (quick index)

- ✅ `POST /api/ai/learn`
- ✅ `POST /api/ai/train-pair`
- ✅ `POST /api/redact/manual`
- ✅ `POST /api/batch/redact`
- ✅ Offline “unlock fallback” (render-to-images -> rebuild)

- ⏳ Layer/hidden OC cleanup
- ⏳ Annotation removal/flattening
- ⏳ View-only permission early detection
- ⏳ Layout-zone inference integration into suggestion bbox generation
- ⏳ Semantic search backend
- ⏳ Local text classification scoring

