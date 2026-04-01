// C:\projects\redact-tool-K2\frontend\app\SaveRule.js
// ------------------------------------------------------------
// SaveRule.js — Frontend helper to save selected suggestions as a company rule
// ------------------------------------------------------------

const BACKEND_URL = "";

function normalizeForSave({ companyId, displayName, suggestions }) {
  const normalizedSuggestions = suggestions.map((s, idx) => ({
    id: `${s.label || s.group || "rule"}_${Date.now()}_${idx}`,
    label: s.label || s.group || "AUTO",
    group: s.group || "auto",
    sample_text: s.sample_text || s.text || "",
    text: s.text || s.sample_text || "",
    rects: s.rects || [],
    page: s.page || 1,
    action: "suggest"
  }));

  const sensitiveTerms = Array.from(new Set(
    normalizedSuggestions
      .map((s) => (s.sample_text || "").trim())
      .filter(Boolean)
  ));

  // suggestions: array of { id, page, rects, text, label, group }
  return {
    company_id: companyId || `company_${Date.now()}`,
    display_name: displayName || companyId || "Unnamed Company",
    created_at: new Date().toISOString(),
    identifiers: [displayName || companyId || "Unnamed Company", companyId || ""].filter(Boolean),
    sensitive_terms: sensitiveTerms,
    studio_rule: {
      id: companyId || `company_${Date.now()}`,
      name: displayName || companyId || "Unnamed Company",
      patterns: sensitiveTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      type: "regex",
      isActive: true,
      sensitiveTerms,
      learnedCoordinates: normalizedSuggestions
        .filter((s) => Array.isArray(s.rects) && s.rects[0])
        .map((s) => {
          const rect = s.rects[0];
          return {
            pageIndex: Math.max(0, (s.page || 1) - 1),
            x: (rect.x0 || 0) * 100,
            y: (rect.y0 || 0) * 100,
            width: ((rect.x1 || 0) - (rect.x0 || 0)) * 100,
            height: ((rect.y1 || 0) - (rect.y0 || 0)) * 100,
            label: s.label || "AUTO"
          };
        }),
      identifiers: [displayName || companyId || "Unnamed Company", companyId || ""].filter(Boolean),
      description: "Imported from Redection-studio rule structure"
    },
    rules: normalizedSuggestions
  };
}

export async function saveSelectedAsRule(payload) {
  // payload: { companyId, displayName, suggestions }
  const body = normalizeForSave(payload);

  const form = new FormData();
  form.append("rule", JSON.stringify(body));

  const res = await fetch(`${BACKEND_URL}/api/templates/save-rule`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Save failed: ${res.status} ${txt}`);
  }

  return await res.json();
}
