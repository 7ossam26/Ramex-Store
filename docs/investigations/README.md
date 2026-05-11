# Investigations

Phase 2 of v1.1 (and any future investigation passes) writes its findings here.

Filename pattern: `YYYY-MM-DD-<topic>.md` — e.g. `2026-05-12-open-invoices-instapay.md`.

A report should contain:
- **Scope** — what was investigated
- **Method** — tools used (Playwright MCP, manual code read, DB query, etc.) and which environment (local / staging / prod)
- **Findings** — one section per defect, each with: where it lives, current behavior, expected behavior, evidence (screenshot path, log excerpt, query result), severity
- **Recommendations** — short, ordered list of fixes the next phase should make
- **Out of scope** — things observed but deliberately not addressed

The report is the input to `docs/v1.1/phase-3-4-generator.md`, which produces the implementation prompts for phases 3 and 4.
