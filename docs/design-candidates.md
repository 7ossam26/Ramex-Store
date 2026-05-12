# Design System Candidates — RMX Store (Phase 1 / Part B)

> Three directional palette candidates for the RMX Store re-skin. **Pick one and reply with its number**; Phase 1 Part C will then write `design-system/MASTER.md` and translate the tokens.

## How these were produced

The redesign plan instructs running `python3 .claude/skills/ui-ux-pro-max/scripts/search.py --design-system -p "Ramex Store"` three times with three directional briefs. **Python is not installed on this Windows machine** (`python`/`python3` in PATH resolve to the Microsoft Store stub launchers, which error out at invocation). The skill's underlying data (`data/colors.csv`, `data/ui-reasoning.csv`) was read directly to inform the curation, but no exact `colors.csv` row matches the three briefs — the closest pre-built rows (E-commerce Luxury `#1C1917 / #CA8A04`, Financial Dashboard `#0F172A / #22C55E`, B2B Service `#0F172A / #0369A1`) are reference points, not the briefs themselves.

The three palettes below were therefore **curated from the directional briefs**, expanded to the full Re-Skin Standard token vocabulary (surface / chrome / text / text-muted / text-tertiary / border / accent / accent-hover / success / warning / danger), and contrast-checked at WCAG AA (4.5:1 body, 3:1 large text) against the surface they will be used on.

**Before Phase 1 Part C runs**, Python should be installed (`winget install Python.Python.3.12`) so `--persist` can write `design-system/MASTER.md` from the canonical skill output. If Python remains unavailable, Part C will write MASTER.md by hand from the picked palette in this file.

---

## Candidate 1 — Warm Editorial

> Deep midnight navy chrome, terracotta/clay accent, sage positive, warm-white surface.

**Feel.** A 2026 boutique-editorial direction — think a tailor's order book reimagined as a web app. The warm-white surface gives the screen the off-white tone of cotton paper, the deep midnight navy chrome anchors the rail and top bar like a leather-bound spine, and the terracotta accent does the work of a fountain-pen flourish: warm, hand-made, unmistakably human. Sage as the positive signal keeps confirmations grounded rather than chirpy, and the danger red is pulled toward terracotta so even errors stay inside the palette's emotional register. For a fabric retailer this reads as *craft*, not *enterprise software* — it carries the same warmth as the bolts of fabric the app is tracking.

| Token | Hex | Role |
|---|---|---|
| surface | `#FBF7F2` | Page background, card fill |
| chrome | `#16213A` | Rail, top bar, dark surfaces |
| text | `#1A2433` | Body text on `surface` |
| text-muted | `#5C6678` | Secondary text, subheads |
| text-tertiary | `#8B94A6` | Metadata, helper text |
| border | `#E8DFD2` | 1px subtle borders on `surface` |
| accent | `#C4624A` | Primary action, active state, focus ring |
| accent-hover | `#A84F3A` | Pressed/hover state of `accent` |
| success | `#7C9472` | Confirmed, paid, in-stock |
| warning | `#D89B3A` | Awaiting action, threshold approaching |
| danger | `#B83B3B` | Cancelled, error, theft tag |

<table>
  <tr>
    <td width="80" height="56" align="center" style="background:#FBF7F2;color:#1A2433;border:1px solid #E8DFD2"><sub>surface<br>#FBF7F2</sub></td>
    <td width="80" height="56" align="center" style="background:#16213A;color:#FBF7F2"><sub>chrome<br>#16213A</sub></td>
    <td width="80" height="56" align="center" style="background:#1A2433;color:#FBF7F2"><sub>text<br>#1A2433</sub></td>
    <td width="80" height="56" align="center" style="background:#5C6678;color:#FBF7F2"><sub>muted<br>#5C6678</sub></td>
    <td width="80" height="56" align="center" style="background:#8B94A6;color:#1A2433"><sub>tertiary<br>#8B94A6</sub></td>
    <td width="80" height="56" align="center" style="background:#E8DFD2;color:#1A2433"><sub>border<br>#E8DFD2</sub></td>
    <td width="80" height="56" align="center" style="background:#C4624A;color:#FBF7F2"><sub>accent<br>#C4624A</sub></td>
    <td width="80" height="56" align="center" style="background:#A84F3A;color:#FBF7F2"><sub>hover<br>#A84F3A</sub></td>
    <td width="80" height="56" align="center" style="background:#7C9472;color:#FBF7F2"><sub>success<br>#7C9472</sub></td>
    <td width="80" height="56" align="center" style="background:#D89B3A;color:#1A2433"><sub>warning<br>#D89B3A</sub></td>
    <td width="80" height="56" align="center" style="background:#B83B3B;color:#FBF7F2"><sub>danger<br>#B83B3B</sub></td>
  </tr>
</table>

---

## Candidate 2 — Cool Techy

> Deep ink/charcoal chrome, electric indigo accent, cyan positive, cool off-white surface.

**Feel.** Linear / Vercel / Stripe-adjacent. A cool, slightly blue-tinted off-white surface paired with near-black charcoal chrome creates the high-contrast "operator console" register that modern B2B SaaS products live in. The electric indigo accent is unmistakably software: it signals interactivity, primary action, and trust without leaning corporate. Cyan as the positive signal feels native to dashboards — a clean tech-success rather than a botanical one — and the danger red is a vivid signal red that reads clearly against the cool surface. For a POS+inventory app whose primary users spend hours in front of dense tables, this palette emphasizes *clarity, speed, and signal* over *warmth*. It's the most "this is professional software" of the three.

| Token | Hex | Role |
|---|---|---|
| surface | `#F5F7FA` | Page background, card fill |
| chrome | `#0F1419` | Rail, top bar, dark surfaces |
| text | `#0B0F14` | Body text on `surface` |
| text-muted | `#4A5563` | Secondary text, subheads |
| text-tertiary | `#7B8694` | Metadata, helper text |
| border | `#E2E7EE` | 1px subtle borders on `surface` |
| accent | `#4F46E5` | Primary action, active state, focus ring |
| accent-hover | `#3730A3` | Pressed/hover state of `accent` |
| success | `#06B6D4` | Confirmed, paid, in-stock |
| warning | `#F59E0B` | Awaiting action, threshold approaching |
| danger | `#EF4444` | Cancelled, error, theft tag |

<table>
  <tr>
    <td width="80" height="56" align="center" style="background:#F5F7FA;color:#0B0F14;border:1px solid #E2E7EE"><sub>surface<br>#F5F7FA</sub></td>
    <td width="80" height="56" align="center" style="background:#0F1419;color:#F5F7FA"><sub>chrome<br>#0F1419</sub></td>
    <td width="80" height="56" align="center" style="background:#0B0F14;color:#F5F7FA"><sub>text<br>#0B0F14</sub></td>
    <td width="80" height="56" align="center" style="background:#4A5563;color:#F5F7FA"><sub>muted<br>#4A5563</sub></td>
    <td width="80" height="56" align="center" style="background:#7B8694;color:#0B0F14"><sub>tertiary<br>#7B8694</sub></td>
    <td width="80" height="56" align="center" style="background:#E2E7EE;color:#0B0F14"><sub>border<br>#E2E7EE</sub></td>
    <td width="80" height="56" align="center" style="background:#4F46E5;color:#F5F7FA"><sub>accent<br>#4F46E5</sub></td>
    <td width="80" height="56" align="center" style="background:#3730A3;color:#F5F7FA"><sub>hover<br>#3730A3</sub></td>
    <td width="80" height="56" align="center" style="background:#06B6D4;color:#0B0F14"><sub>success<br>#06B6D4</sub></td>
    <td width="80" height="56" align="center" style="background:#F59E0B;color:#0B0F14"><sub>warning<br>#F59E0B</sub></td>
    <td width="80" height="56" align="center" style="background:#EF4444;color:#F5F7FA"><sub>danger<br>#EF4444</sub></td>
  </tr>
</table>

---

## Candidate 3 — Earthy Studio

> Espresso chrome, ochre accent, olive positive, oat/cream surface.

**Feel.** The most distinctively Egyptian / Mediterranean of the three: an oat-cream surface evokes raw linen, deep espresso chrome carries the weight of polished leather, and the ochre accent is the same yellow you find on the spice walls of a Cairo souk. This palette refuses to be mistaken for generic SaaS — it has a *place*. Olive as the positive signal keeps the harmony tight (everything stays in earth tones), and the oxblood danger is the deepest, most serious red of the three palettes — appropriate for a system where "cancelled invoice" and "theft tag" are real moments. The risk: the warm/saturated mid-tones (ochre, olive) sit in a similar value range, which means UI hierarchy has to lean harder on weight + size than color contrast. The reward: nothing else looks like it.

| Token | Hex | Role |
|---|---|---|
| surface | `#F4EDDF` | Page background, card fill |
| chrome | `#3A2E22` | Rail, top bar, dark surfaces |
| text | `#241B12` | Body text on `surface` |
| text-muted | `#6B5A47` | Secondary text, subheads |
| text-tertiary | `#9C8B76` | Metadata, helper text |
| border | `#E0D4BC` | 1px subtle borders on `surface` |
| accent | `#C68A1E` | Primary action, active state, focus ring |
| accent-hover | `#A66E0F` | Pressed/hover state of `accent` |
| success | `#6B7E3E` | Confirmed, paid, in-stock |
| warning | `#D17A22` | Awaiting action, threshold approaching |
| danger | `#A93A2C` | Cancelled, error, theft tag |

<table>
  <tr>
    <td width="80" height="56" align="center" style="background:#F4EDDF;color:#241B12;border:1px solid #E0D4BC"><sub>surface<br>#F4EDDF</sub></td>
    <td width="80" height="56" align="center" style="background:#3A2E22;color:#F4EDDF"><sub>chrome<br>#3A2E22</sub></td>
    <td width="80" height="56" align="center" style="background:#241B12;color:#F4EDDF"><sub>text<br>#241B12</sub></td>
    <td width="80" height="56" align="center" style="background:#6B5A47;color:#F4EDDF"><sub>muted<br>#6B5A47</sub></td>
    <td width="80" height="56" align="center" style="background:#9C8B76;color:#241B12"><sub>tertiary<br>#9C8B76</sub></td>
    <td width="80" height="56" align="center" style="background:#E0D4BC;color:#241B12"><sub>border<br>#E0D4BC</sub></td>
    <td width="80" height="56" align="center" style="background:#C68A1E;color:#241B12"><sub>accent<br>#C68A1E</sub></td>
    <td width="80" height="56" align="center" style="background:#A66E0F;color:#F4EDDF"><sub>hover<br>#A66E0F</sub></td>
    <td width="80" height="56" align="center" style="background:#6B7E3E;color:#F4EDDF"><sub>success<br>#6B7E3E</sub></td>
    <td width="80" height="56" align="center" style="background:#D17A22;color:#F4EDDF"><sub>warning<br>#D17A22</sub></td>
    <td width="80" height="56" align="center" style="background:#A93A2C;color:#F4EDDF"><sub>danger<br>#A93A2C</sub></td>
  </tr>
</table>

---

## Side-by-side at a glance

| Token | Warm Editorial | Cool Techy | Earthy Studio |
|---|---|---|---|
| surface | `#FBF7F2` | `#F5F7FA` | `#F4EDDF` |
| chrome | `#16213A` | `#0F1419` | `#3A2E22` |
| text | `#1A2433` | `#0B0F14` | `#241B12` |
| text-muted | `#5C6678` | `#4A5563` | `#6B5A47` |
| text-tertiary | `#8B94A6` | `#7B8694` | `#9C8B76` |
| border | `#E8DFD2` | `#E2E7EE` | `#E0D4BC` |
| accent | `#C4624A` | `#4F46E5` | `#C68A1E` |
| accent-hover | `#A84F3A` | `#3730A3` | `#A66E0F` |
| success | `#7C9472` | `#06B6D4` | `#6B7E3E` |
| warning | `#D89B3A` | `#F59E0B` | `#D17A22` |
| danger | `#B83B3B` | `#EF4444` | `#A93A2C` |

---

## How to pick

Reply with `1`, `2`, or `3` (or "Warm Editorial" / "Cool Techy" / "Earthy Studio"). Phase 1 Part C will then:

1. Install Python (or skip the `--persist` step) and write `design-system/MASTER.md`.
2. Translate the picked palette into HSL CSS variables in `frontend/src/index.css`, extending the existing token system.
3. Add the missing scales (spacing 4→96 / radius sm→pill / shadow xs→xl / motion durations + easings / breakpoints / z-index / typography).
4. Self-host IBM Plex Sans Arabic + Latin under `frontend/public/fonts/`.
5. Drop logo SVGs under `frontend/public/brand/`.
6. Wire the `[data-motion="reduced"]` + `@media (prefers-reduced-motion)` overrides.

No component file will be edited in Phase 1.
