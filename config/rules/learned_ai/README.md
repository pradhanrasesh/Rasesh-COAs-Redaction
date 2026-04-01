# Learned AI Layer (Offline)

This folder stores per-company “learned” patterns generated locally from user redactions.

## File naming

- `config/rules/learned_ai/<company_id>.json`

## Schema (versioned)

The backend expects a JSON object with at least:

- `company_id` (string)
- `display_name` (string)
- `regex` (array of learned regex entries)
- `layout` (optional array of learned layout zone entries)

### `regex` entry shape

Each entry is:

- `id` (string)
- `label` (string) - human readable field name (e.g. `Account Number`)
- `pattern` (string) - regex pattern (safe for Python `re`)
- `action` (string) - usually `suggest`
- `confidence` (number) - 0..1, used by sensitivity filtering

### `layout` entry shape (optional)

Layout zones are still optional until layout suggestion generation is enabled:

- `id` (string)
- `label` (string) - should include the word `zone` if you want it treated as a layout-zone suggestion
- `rect` (object) - normalized coords `{x0,y0,x1,y1}` in 0..1
- `page_scope` (string) - `all` or `first_page`
- `action` (string) - usually `suggest`
- `confidence` (number) - 0..1

### `version`

- `version` (string) - for future migrations (current: `1`)

