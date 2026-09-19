# Question Bank Emerald Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Tahaddi Question Bank as a scoped Emerald Vault without changing global brand tokens, APIs, routing, or game logic.

**Architecture:** Add `question-bank.css` tokens on `.question-bank`. Isolate Ivory Crown by removing `.cinematic-bank` from `cinematic-stage.css`. Restyle existing CSS modules and section the editor. Reuse `components/ui` primitives. No Prisma/API/auth changes.

**Tech Stack:** Next.js App Router, CSS modules, existing `components/ui`, Vitest + Testing Library, logical CSS (RTL).

## Global Constraints

- Scope is `/questions` and `/questions/[id]` UI only.
- Do not modify `apps/web/tokens.css` `:root`, homepage, games, realtime, Prisma, APIs, auth, or routing.
- Do not restyle `.sidebar`, `.site-header`, or `.dashboard-layout` via `:has(.question-bank)`.
- Palette values are copied verbatim from the spec.
- Motion: 100/160/240/360ms, opacity+transform only, honor `prefers-reduced-motion`.
- Touch targets ≥44px, WCAG AA, `:focus-visible`, RTL logical properties.
- No Tailwind/shadcn, no new webfont, no bouncing/glow/parallax/heavy glass.
- Existing filter/query/href contracts stay (`questionsListHref`, page size 40, view=list).
- Copy stays Arabic. Button verbs match toast verbs.

---

## File map

- Create: `apps/web/src/styles/question-bank.css` — tokens, motion, scoped form/dialog/input overrides
- Create: `apps/web/src/components/questions/question-bank-shell.tsx` — `.question-bank` wrapper
- Create: `apps/web/src/components/questions/question-bank-shell.test.tsx`
- Create: `apps/web/src/components/questions/question-editor.module.css` — workshop layout
- Modify: `apps/web/src/app/layout.tsx` — import `question-bank.css`
- Modify: `apps/web/src/styles/cinematic-stage.css` — drop every `.cinematic-bank` / `:has(.cinematic-bank)` selector
- Modify: `apps/web/src/app/questions/page.tsx` — use `QuestionBankShell`, drop `cinematic-bank`
- Modify: `apps/web/src/app/questions/loading.tsx` — vault skeletons
- Modify: `apps/web/src/app/questions/[id]/page.tsx` — same shell, no generic Card chrome
- Modify: `apps/web/src/components/questions/question-bank-page.module.css`
- Modify: `apps/web/src/components/questions/question-bank-index.module.css`
- Modify: `apps/web/src/components/questions/question-bank-index.tsx`
- Modify: `apps/web/src/components/questions/question-catalog.tsx`
- Modify: `apps/web/src/components/questions/question-catalog-item.tsx` + `.module.css`
- Modify: `apps/web/src/components/questions/question-editor.tsx`
- Modify: `apps/web/src/components/questions/question-edit-form.tsx`
- Modify: `apps/web/src/components/questions/question-composer.tsx`
- Modify: `apps/web/src/components/questions/archive-question-button.tsx` + test
- Modify: `apps/web/src/components/questions/question-preview-panel.tsx`
- Modify existing bank tests only when public copy/landmarks change
- Do not edit `apps/web/src/app/preview/cinematic/page.tsx` unless isolation leaves it unstyled; then swap `cinematic-bank` to `question-bank` on that bank stage only

---

### Task 1: Vault tokens, shell, and Ivory Crown isolation

**Files:**
- Create: `apps/web/src/styles/question-bank.css`
- Create: `apps/web/src/components/questions/question-bank-shell.tsx`
- Create: `apps/web/src/components/questions/question-bank-shell.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/questions/page.tsx`
- Modify: `apps/web/src/app/questions/loading.tsx`
- Modify: `apps/web/src/app/questions/[id]/page.tsx`
- Modify: `apps/web/src/styles/cinematic-stage.css`
- Modify: `apps/web/src/components/questions/question-bank-index.tsx` (drop `cinematic-bank-hero` / `cinematic-bank-total`)

**Interfaces:**
- Consumes: existing `pageStyles.page`
- Produces: `QuestionBankShell({ children: ReactNode, className?: string })` rendering `div.question-bank` with optional extra class names

- [ ] **Step 1: Write the failing shell test**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionBankShell } from './question-bank-shell';

describe('QuestionBankShell', () => {
  it('scopes the vault class without the cinematic-bank leak marker', () => {
    const { container } = render(
      <QuestionBankShell>
        <p>الخزانة</p>
      </QuestionBankShell>,
    );

    const root = container.querySelector('.question-bank');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('cinematic-bank')).toBe(false);
    expect(root).toHaveTextContent('الخزانة');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tahaddi/web test -- src/components/questions/question-bank-shell.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement tokens, shell, import, isolation, and page wrappers**

`question-bank.css` must define the verbatim primitives plus semantic aliases, motion durations, page background on `.question-bank` only, entrance animation, reduced-motion kill switch, and scoped input/button/dialog colors.

Remove `.cinematic-bank` from every selector group in `cinematic-stage.css` listed in the spec isolation rule. Keep `.cinematic-host`, `.cinematic-player`, `.cinematic-question`.

Replace `<div className={\`${pageStyles.page} cinematic-bank\`}>` with `<QuestionBankShell className={pageStyles.page}>`. Wrap edit and loading the same way.

- [ ] **Step 4: Run the shell test and existing bank tests**

Run: `pnpm --filter @tahaddi/web test -- src/components/questions/question-bank-shell.test.tsx src/components/questions/question-bank-index.test.tsx src/components/questions/question-catalog.test.tsx src/components/layout/site-shell.test.tsx`

Expected: PASS. Sidebar test still finds «بنك الأسئلة المركزي».

- [ ] **Step 5: Commit** (only if the user asked for commits)

```bash
git add apps/web/src/styles/question-bank.css apps/web/src/components/questions/question-bank-shell.tsx apps/web/src/components/questions/question-bank-shell.test.tsx apps/web/src/app/layout.tsx apps/web/src/app/questions/page.tsx apps/web/src/app/questions/loading.tsx apps/web/src/app/questions/[id]/page.tsx apps/web/src/styles/cinematic-stage.css apps/web/src/components/questions/question-bank-index.tsx
git commit -m "feat(questions): isolate Emerald Vault tokens from Ivory Crown"
```

---

### Task 2: Inventory stats and domain index

**Files:**
- Modify: `apps/web/src/components/questions/question-bank-index.module.css`
- Modify: `apps/web/src/components/questions/question-bank-index.tsx`
- Test: `apps/web/src/components/questions/question-bank-index.test.tsx`

**Interfaces:**
- Consumes: `QuestionBankStats` / `QuestionBankIndex` public props (unchanged)
- Produces: same landmarks and copy (`إجمالي الأسئلة`, `منشور`, `مسودة`, `تصنيفات`, `فهرس المجالات المعرفية`, `تصفح الأسئلة`)

- [ ] **Step 1: Extend the stats test with a compact inventory landmark**

Keep existing assertions. Add:

```tsx
expect(screen.getByLabelText('إحصاءات البنك')).toBeInTheDocument();
```

If the domain section becomes a chip strip, keep the nine domain names and `تصفح الأسئلة` (or update that label in the same task to `عرض المجال` only if the visible control still filters by domain). Prefer keeping `تصفح الأسئلة` to avoid copy churn.

- [ ] **Step 2: Run test**

Run: `pnpm --filter @tahaddi/web test -- src/components/questions/question-bank-index.test.tsx`

- [ ] **Step 3: Restyle inventory to a strip; compact domain cards**

CSS uses `--qb-*` only. Stats: one row on ≥64rem, wrap on small screens. Domain cards: min-block-size auto, not 17.5rem. Active domain: `--qb-emerald-deep` fill + `--qb-emerald` border. Gold slit on the total hero only.

- [ ] **Step 4: Re-run index tests — Expected: PASS**

- [ ] **Step 5: Commit if requested**

---

### Task 3: Search, filters, catalog chrome, pagination, empty state

**Files:**
- Modify: `apps/web/src/components/questions/question-bank-page.module.css`
- Modify: `apps/web/src/app/questions/page.tsx` (search markup classes only)
- Modify: `apps/web/src/components/questions/question-catalog.tsx`
- Test: `apps/web/src/components/questions/question-catalog.test.tsx`

**Interfaces:**
- Consumes: existing `questionsListHref` / filter names (`q`, `status`, `difficulty`, `domain`, `canonical`, `type`, `view`)
- Produces: unchanged form `action="/questions"` and empty-state link `#question-editor`

- [ ] **Step 1: Strengthen empty-state test**

```tsx
expect(screen.getByRole('link', { name: 'إضافة سؤال جديد' })).toHaveAttribute('href', '#question-editor');
```

Already present. Add heading-level empty copy if introducing `EmptyState`:

```tsx
expect(screen.getByRole('heading', { name: /لا توجد أسئلة مطابقة/ })).toBeInTheDocument();
```

If adding a heading, update catalog empty markup in Step 3 to include it so the test is not tautological against a CSS class.

- [ ] **Step 2: Run catalog test**

- [ ] **Step 3: Apply vault surfaces to search panel, chips, view toggle, pager, composer, draft tray, admin details**

Search focus ring uses `--qb-focus`. Active filter chips use emerald-deep. View toggle current page uses emerald-deep + ivory. Pagination remains prev/next + «صفحة X من Y». Empty state: title, sentence, gold CTA.

- [ ] **Step 4: Re-run catalog tests — Expected: PASS**

- [ ] **Step 5: Commit if requested**

---

### Task 4: Question cards / rows

**Files:**
- Modify: `apps/web/src/components/questions/question-catalog-item.module.css`
- Modify: `apps/web/src/components/questions/question-catalog-item.tsx` (classes/data attributes only)
- Test: `apps/web/src/components/questions/question-catalog-item.test.tsx`

**Interfaces:**
- Consumes: `CatalogQuestion`, `BankView`
- Produces: article `[data-view][data-difficulty][data-status]`, edit link `/questions/:id`, no emoji difficulty

- [ ] **Step 1: Assert list view is not a table and keeps labels**

```tsx
it('renders list view as an article row with difficulty and status text', () => {
  const { container } = render(<QuestionCatalogItem question={question} view="list" />);
  expect(container.querySelector('table')).toBeNull();
  expect(container.querySelector('article')).toHaveAttribute('data-view', 'list');
  expect(screen.getByText('صعب')).toBeDefined();
  expect(screen.getByText('منشور')).toBeDefined();
});
```

- [ ] **Step 2: Run test — expected PASS for structure even before CSS, FAIL only if markup regresses**

- [ ] **Step 3: Style tiles with `--qb-*`; list rows 72–88px on ≥40rem; stacked cards below 40rem; hover 160ms / 1px; difficulty/status tones per spec**

- [ ] **Step 4: Re-run catalog-item tests — Expected: PASS**

- [ ] **Step 5: Commit if requested**

---

### Task 5: Question editor workshop + edit page + preview

**Files:**
- Create: `apps/web/src/components/questions/question-editor.module.css`
- Modify: `apps/web/src/components/questions/question-editor.tsx`
- Modify: `apps/web/src/components/questions/question-edit-form.tsx`
- Modify: `apps/web/src/components/questions/question-preview-panel.tsx`
- Modify: `apps/web/src/app/questions/[id]/page.tsx`
- Test: `apps/web/src/components/questions/question-editor.test.tsx`

**Interfaces:**
- Consumes: `createQuestion` / `updateQuestion` actions, field names unchanged (`type`, `prompt`, `options`, `correctOption`, `difficulty`, `timeLimit`, `basePoints`, `explanation`, `source`)
- Produces: section landmarks `نص السؤال`, `الخيارات والإجابة الصحيحة`, `التصنيف والإعدادات`, `الشرح والمصدر`; submit labels `حفظ كمسودة` / `حفظ التعديلات`

- [ ] **Step 1: Add landmark assertions to editor test**

```tsx
it('groups editor fields into question, options, and settings sections', () => {
  render(<QuestionEditor categories={categories} />);
  expect(screen.getByRole('group', { name: 'الخيارات والإجابة الصحيحة' })).toBeInTheDocument();
  expect(screen.getByLabelText('نص السؤال')).toBeInTheDocument();
  expect(screen.getByLabelText('الصعوبة')).toBeInTheDocument();
  expect(screen.getByLabelText('الوقت بالثواني')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'حفظ كمسودة' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run editor tests**

- [ ] **Step 3: Implement two-column workshop on ≥64rem, stacked below; wrap edit page in `QuestionBankShell`; restyle preview panel with vault tokens; keep TRUE_FALSE contract**

Use `<section>` / existing `fieldset` for groups. Do not change action payloads.

- [ ] **Step 4: Re-run editor tests — Expected: PASS**

- [ ] **Step 5: Commit if requested**

---

### Task 6: Archive dialog, loading skeletons, reduced motion

**Files:**
- Modify: `apps/web/src/components/questions/archive-question-button.tsx`
- Modify: `apps/web/src/components/questions/archive-question-button.test.tsx`
- Modify: `apps/web/src/app/questions/loading.tsx`
- Modify: `apps/web/src/styles/question-bank.css` (dialog + skeleton + reduced-motion)

**Interfaces:**
- Consumes: `archiveQuestion` server action, hidden `id` field
- Produces: confirm dialog with `role="dialog"`, cancel, destructive confirm still named `/أرشفة/`

- [ ] **Step 1: Rewrite archive test to require confirmation**

```tsx
it('asks for confirmation before archiving', async () => {
  const user = userEvent.setup();
  render(<ArchiveQuestionButton questionId="q-1" />);
  await user.click(screen.getByRole('button', { name: /أرشفة/ }));
  expect(screen.getByRole('dialog', { name: /أرشفة السؤال/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'تأكيد الأرشفة' })).toHaveClass('button-danger');
});
```

- [ ] **Step 2: Run test — Expected: FAIL (no dialog yet)**

- [ ] **Step 3: Implement `AlertDialog`; confirm submits the existing form; loading skeletons match stats/search/six tiles; reduced-motion disables vault animations**

- [ ] **Step 4: Run archive + shell + catalog + editor tests — Expected: PASS**

- [ ] **Step 5: Commit if requested**

---

## Verification (after all tasks)

```bash
pnpm --filter @tahaddi/web test -- src/components/questions src/components/layout/site-shell.test.tsx
pnpm --filter @tahaddi/web exec tsc --noEmit --pretty false
```

Manual RTL check at 1920, 1440, 1024, 768, 390, 320. Confirm sidebar/header are not ivory and not emerald-restyled. Confirm host/live cinematic pages still Ivory Crown.

## Spec coverage

| Spec section | Task |
|---|---|
| Locked tokens + scoping | 1 |
| Isolation from cinematic-stage | 1 |
| Stats + domain index | 2 |
| Search/filters/pagination/empty | 3 |
| Cards/rows/badges | 4 |
| Editor/edit page/preview | 5 |
| Dialogs/loading/motion | 6 |
| WCAG/focus/touch/reduced-motion | 1–6 CSS |
| Out-of-scope systems | all tasks — do not touch |
