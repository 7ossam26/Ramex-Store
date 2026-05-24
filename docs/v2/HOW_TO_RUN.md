# How to Run v2 — Kickoff Prompt + Model Guide

Two things you need for every phase run:

1. **A kickoff prompt** to paste into a fresh Claude Code session — same template for every phase, only the phase number/file changes.
2. **The right Claude model selected** before pasting — see the table at the bottom.

---

## 1. The kickoff prompt (paste at the start of every phase session)

Replace `<N>` and `<PHASE_FILE>` with the phase you're running. Everything else stays identical session-to-session.

````
You are running **v2 Phase <N>** of the Ramex Store rollout.

Read these files in this exact order BEFORE doing anything else. Do not start writing code, running migrations, or editing files until all reads are complete:

1. `CLAUDE.md` — project memory
2. `CORE_PLAN.md` — single source of truth for the whole project
3. `docs/requirements-v2.md` — resolved v2 requirements
4. `docs/v2/questions-resolved.md` — frozen Q&A record (THIS is the ground truth for every decision)
5. `docs/v2/PLAN.md` — v2 phase index + universal constraints
6. `docs/v2/<PHASE_FILE>` — this phase's detailed prompt (lists any additional code files to read)

After reading those, verify prerequisites:
- `git log --oneline | grep "feat(v2-phase-"` — confirm every required prior phase has shipped per the dependency column in `docs/v2/PLAN.md`. If any required prior phase is missing, **stop and surface it** instead of guessing.
- For Phase 1 only (no prior phases): just confirm v1.1 is in `git log` cleanly.

Then execute the phase exactly as `docs/v2/<PHASE_FILE>` describes. Use TodoWrite to track sub-tasks. End with:
- The smoke checklist from the phase prompt
- The commit message format specified in the prompt (`feat(v2-phase-<N>): …`)
- `npm run typecheck && npm run build && npm run lint` clean
- The "Stop here — Phase <N> done" line

If you discover the phase prompt is wrong (something contradicts `questions-resolved.md`), surface the contradiction and ask before deviating. Do not silently amend.
````

### Phase-specific values

Replace `<N>` and `<PHASE_FILE>` per the table:

| Phase | `<N>` | `<PHASE_FILE>` |
|---|---|---|
| 1 | `1` | `phase-1-inventory-foundations.md` |
| 2 | `2` | `phase-2-add-top-ux.md` |
| 3 | `3` | `phase-3-shipment-pricing.md` |
| 4 | `4` | `phase-4-fulfillment-destination.md` |
| 5 | `5` | `phase-5-pos-pricing-deposit.md` |
| 6 | `6` | `phase-6-return-on-scan.md` |
| 7 | `7` | `phase-7-payment-methods.md` |
| 8 | `8` | `phase-8-finance-day-window.md` |
| 9 | `9` | `phase-9-hr-module.md` |
| 10 | `10` | `phase-10-validation.md` |

### Practical workflow

1. Open a fresh terminal in the project root.
2. Run `/clear` if continuing from a previous Claude Code session — wipes context so the new phase starts clean.
3. Run `/model <id>` to switch to the recommended model for this phase (see §2).
4. Paste the kickoff prompt (with `<N>` and `<PHASE_FILE>` filled in).
5. Approve tool calls as Claude Code goes. The phase prompt instructs it to stop at the end — review the diff before tagging the commit.
6. After the commit lands and CI is green, move to the next phase in a fresh session.

---

## 2. Model recommendations

| Phase | Model | `/model` command | Why this model |
|---|---|---|---|
| 1 — Inventory foundations | **Opus 4.7** | `/model claude-opus-4-7` | Foundational schema. Migration mistakes cascade through every later phase. Worth Opus's care. |
| 2 — Add Top UX | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Heavy React/form work but well-defined. Sonnet handles UI volume efficiently. |
| 3 — Shipment pricing | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Moderate scope, focused single-page change. |
| 4 — Fulfillment destination | **Opus 4.7** | `/model claude-opus-4-7` | Cross-cutting POS + invoice + warehouse rules. Edge cases (mixed cart, destination switch with lines, factory roll on shop invoice) bite. |
| 5 — POS pricing + deposit refund | **Opus 4.7** | `/model claude-opus-4-7` | Complex business logic — refund state machine, negative payments, `deposit_refunded` status, partial refunds. The phase most likely to ship a subtle bug if rushed. |
| 6 — Return on scan | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Integrates with existing `returnsService.ts`. Bounded scope. |
| 7 — Payment methods | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Schema extension + 2 new UI tiles + 1 new admin list. Pattern-following work. |
| 8 — Finance simplification | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Smallest phase. Haiku 4.5 also viable but the savings vs Sonnet are marginal for one short session. |
| 9 — HR module | **Sonnet 4.6** | `/model claude-sonnet-4-6` | Largest scope by line count, but mostly CRUD scaffolding — Sonnet is well-suited for volume work with clear patterns. |
| 10 — Validation | **Opus 4.7** | `/model claude-opus-4-7` | Cross-cutting verification, thorough test design, careful report generation. This is the final correctness gate — don't skimp here. |

### Decision shortcuts

- **Default**: follow the table above. It's tuned for quality at reasonable cost.
- **Cost-constrained**: use Sonnet 4.6 for everything *except* Phase 10. Phase 10 stays on Opus because it's the gate before tagging `v2.0.0`.


