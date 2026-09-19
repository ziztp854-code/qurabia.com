# Question Bank Visual Identity — Emerald Vault

Date: 2026-08-22 
Status: approved palette; implementation follows `docs/superpowers/plans/2026-08-22-question-bank-visual-identity.md`

## Goal

Redesign the visual identity of the Tahaddi Question Bank only. The bank becomes a night **Emerald Vault**: organized, luxurious, and operational. It stays compatible with Prestige Live without changing global brand tokens.

## Scope

In:

- `/questions` list: header (page-local), stats, search, filters, domain index, catalog (stage + list), pagination, empty/loading/error, quiz draft tray, admin details chrome
- Question composer / create editor
- `/questions/[id]` edit + preview
- Question dialogs (archive confirm, and any bank-local overlays)
- Bank-only CSS modules, a new scoped token file, and isolating `.cinematic-bank` from `cinematic-stage.css`

Out:

- Homepage, games, ladder, chess
- Site header, site nav, sidebar (no `:has()` restyle)
- Realtime, APIs, Prisma, auth, routing, question-selection logic
- `apps/web/tokens.css` `:root` primitives and `design.md` global brand

## Locked palette (verbatim)

```css
--qb-bg: #050908;
--qb-surface: #0A0F0D;
--qb-surface-2: #0E1512;
--qb-emerald-deep: #063D2D;
--qb-emerald: #00C982;
--qb-emerald-bright: #19E6A2;
--qb-gold: #D9A62E;
--qb-gold-bright: #F2C14E;
--qb-ivory: #F4EBD8;
--qb-text-muted: #AFA99C;
--qb-danger: #E65345;
--qb-archive: #9B72CF;
```

## Semantic mapping

| Role | Token | Value |
|---|---|---|
| page background | `--qb-bg` | `#050908` |
| surface | `--qb-surface` | `#0A0F0D` |
| elevated surface | `--qb-surface-2` | `#0E1512` |
| primary (interactive) | `--qb-emerald` | `#00C982` |
| primary bright / focus | `--qb-emerald-bright` | `#19E6A2` |
| primary deep / selected fill | `--qb-emerald-deep` | `#063D2D` |
| accent (create, draft, gold CTA) | `--qb-gold` | `#D9A62E` |
| accent hover | `--qb-gold-bright` | `#F2C14E` |
| border | `--qb-border` | `color-mix(in srgb, var(--qb-emerald) 22%, transparent)` |
| primary text | `--qb-ivory` | `#F4EBD8` |
| secondary text | `--qb-text-muted` | `#AFA99C` |
| success / published / easy | `--qb-emerald` | `#00C982` |
| warning / medium / draft | `--qb-gold` | `#D9A62E` |
| error / hard | `--qb-danger` | `#E65345` |
| archived | `--qb-archive` | `#9B72CF` |
| focus | `--qb-emerald-bright` | `#19E6A2` |
| hover fill | `--qb-hover` | `color-mix(in srgb, var(--qb-emerald) 12%, var(--qb-surface-2))` |

Scoping: all `--qb-*` live on `.question-bank` only. Do not set `--background` on `body`, `.dashboard-layout`, `.sidebar`, or `.site-header`.

### Contrast rules

- Body and labels use ivory on `--qb-bg` / `--qb-surface`.
- Muted text uses `--qb-text-muted` on those surfaces only.
- Emerald and gold are not body text at 16px. They are borders, icons, meters, large stats, and badges that also include a text label.
- Gold buttons: background `--qb-gold`, text `--qb-bg`.
- Focus ring: `3px solid var(--qb-emerald-bright)`, offset 2px. Never `outline: none` without replacement.

## Visual thesis

The bank is a **control-room vault**, not Ivory Crown paper and not a SaaS card grid.

Signature (one bold choice): gold slit + large tabular inventory count + emerald focus ring on search. Everything else stays quiet.

## Layout

### Desktop 1440 / 1920

1. Page-local kicker inside `.question-bank` (DashboardLayout title may stay; sidebar untouched).
2. Stats as a horizontal inventory strip, not four identical hero cards.
3. Search as the operational hero; status + difficulty inline; advanced filters in `details`.
4. Active filters as removable chips.
5. Domain index as a compact strip/chips, not 17.5rem poster cards.
6. Catalog toolbar: stage/list toggle, random sample, count.
7. Stage: variable tiles. List: dense rows.
8. Pagination: previous / page status / next (existing href contract). Visual polish only.

### Mobile 320 / 390 / 768

- No desktop table. List view is stacked cards.
- Search full width. Filter chips in a horizontal row with wrap, not page-level horizontal scroll.
- Stats: three compact figures in one row.
- Question actions: three ≥44px controls (add to quiz, edit, archive).
- Editor: single column, sectioned, sticky save bar.

## Question list

Each item keeps type, difficulty, and status as text + icon (color is not the only signal).

| Difficulty | Tone |
|---|---|
| Easy | emerald |
| Medium | gold |
| Hard | danger |

| Status | Tone |
|---|---|
| Published | emerald |
| Draft | gold |
| Archived | archive purple |

Hover: 160ms border color + 1px translateY. No perpetual float. Reduced motion: no transform.

## Question editor

Workshop, not a flat `form-grid`:

- **Main:** prompt, image, type, options with in-row correct answer, live preview.
- **Rail (desktop):** category, difficulty, time, points, publish/draft.
- **Footer:** explanation, source.
- **Save bar:** same verb as the toast (`حفظ كمسودة` → `حُفظ كمسودة`; `حفظ التعديلات` → `حُفظت التعديلات`).

Edit page `/questions/[id]` uses the same `.question-bank` chrome. Do not leave it as a generic `Card`.

## Motion

Durations: 100ms instant, 160ms fast, 240ms normal, 360ms slow. 
Properties: opacity + transform only. Easing: `cubic-bezier(0.2, 0, 0, 1)`.

| Event | Duration |
|---|---|
| Page entrance | 240ms fade + 8px |
| Card/row hover | 160ms |
| Filter chip on | 160ms |
| Search focus | 160ms ring |
| Dialog in | 240ms |
| Dialog out | 160ms |
| Dropdown | 160ms fade + 4px |
| Toast | 240ms |
| Save success | 240ms |
| Archive exit | 240ms opacity |
| Skeleton | 360ms opacity pulse |

Forbidden: bounce, perpetual glow, floating cards, parallax, long animations, heavy glass, gradients on every element.

`prefers-reduced-motion: reduce` jumps to the end state.

## States

- Empty: title, one-sentence direction, gold CTA to `#question-editor`.
- Loading: skeletons that match stats, search, and 6 catalog slots.
- Error: `role="alert"`, what failed, how to retry. No apology copy.
- Archive: `AlertDialog` confirm, then fade out.

## Accessibility

RTL first. WCAG AA. Keyboard. `:focus-visible`. Touch ≥44px. Status and difficulty never color-only. Sticky chrome must not fully cover focused controls (`scroll-padding`).

## Reuse

`Button`, `ButtonLink`, `Input`, `Select`, `Textarea`, `NumberInput`, `Dialog`/`AlertDialog`, `Badge`, `Skeleton`, `EmptyState`, `Toast`, `QuestionImage`, `QuestionImageField`, `QuestionTaxonomyFields`, `QuestionPreviewPanel`, `QuizDraftTray`, Lucide.

No Tailwind/shadcn introduction. No new webfont.

## Isolation rule

`cinematic-stage.css` must stop targeting `.cinematic-bank` and `.dashboard-layout:has(.cinematic-bank)`. Host, player, and live `.cinematic-question` stay on Ivory Crown. Bank pages use `.question-bank` + `question-bank.css`.
