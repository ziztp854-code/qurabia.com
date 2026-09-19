'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X as CloseIcon } from 'lucide-react';
import type { UseGameCatalogReturn } from './use-game-catalog';
import type { DifficultyValue, GameKind, PlatformValue } from './game-catalog-types';

const KIND_META: Record<GameKind, { label: string; icon: string }> = {
  room: { label: 'جماعية', icon: '👥' },
  instant: { label: 'فورية', icon: '⚡' },
  upcoming: { label: 'قريبًا', icon: '✨' },
};

const PLATFORM_META: Record<PlatformValue, { label: string; icon: string }> = {
  web: { label: 'متصفح', icon: '🌐' },
  pwa: { label: 'PWA', icon: '📱' },
  mobile: { label: 'جوال', icon: '📲' },
};

function Section({
  id,
  title,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="gc-filter-section" aria-labelledby={id}>
      <h4>
        <span id={id}>{title}</span>
        <button
          type="button"
          aria-label={open ? 'طي القسم' : 'فتح القسم'}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </h4>
      <div id={`${id}-body`} className="gc-filter-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function Chips<T extends string>({
  items,
  active,
  onToggle,
  labelOf,
  legend,
}: {
  items: readonly T[];
  active: readonly T[];
  onToggle: (v: T) => void;
  labelOf: (v: T) => { label: string; icon?: string };
  legend?: string;
}) {
  const body = (
    <>
      {items.map((v) => {
        const meta = labelOf(v);
        const isActive = active.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={isActive}
            data-active={isActive}
            className="gc-chip"
            onClick={() => onToggle(v)}
          >
            {meta.icon ? <span aria-hidden="true">{meta.icon}</span> : null}
            {meta.label}
          </button>
        );
      })}
    </>
  );
  if (legend) {
    return (
      <fieldset className="gc-chips" style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
        <legend style={{ padding: 0, marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-soft)' }}>{legend}</legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div className="gc-chips" role="group" aria-label={legend}>
      {body}
    </div>
  );
}

function Slider({
  id,
  min,
  max,
  value,
  onChange,
  labelOf,
  label,
  ariaLabel,
  step = 1,
}: {
  id: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  labelOf: (v: number) => string;
  label?: string;
  ariaLabel?: string;
  step?: number;
}) {
  return (
    <div className="gc-range">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
        {label ? (
          <label htmlFor={id} style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {label}
          </label>
        ) : null}
        <div
          className="gc-range-labels"
          style={label ? { justifyContent: 'flex-end', flex: 1, marginInlineStart: '0.75rem' } : undefined}
        >
          <span>{labelOf(min)}</span>
          <span dir="ltr" aria-live="polite">
            {labelOf(value)}
          </span>
          <span>{labelOf(max)}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        aria-label={label ? undefined : ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function GameFilters({
  catalog,
  open,
  onClose,
}: {
  catalog: UseGameCatalogReturn;
  open: boolean;
  onClose: () => void;
}) {
  const {
    filters,
    allCategories,
    allTags,
    allYears,
    toggleKind,
    toggleCategory,
    togglePlatform,
    toggleYear,
    toggleTag,
    setDifficultyMin,
    setDifficultyMax,
    setPlayersMin,
    setPlayersMax,
    resetFilters,
    activeFiltersCount,
  } = catalog;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const target = firstFocusRef.current ?? panelRef.current?.querySelector<HTMLElement>('button, [role="switch"], input[type="range"]');
    target?.focus();
  }, [open]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="gc-filter-title"
      className="gc-filters-panel"
      data-open={open}
    >
      <button
        ref={firstFocusRef}
        type="button"
        className="gc-filters-close"
        aria-label="إغلاق لوحة الفلاتر"
        onClick={onClose}
      >
        <CloseIcon size={16} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 id="gc-filter-title" style={{ margin: 0, fontSize: '1.05rem' }}>الفلاتر</h3>
        {activeFiltersCount > 0 ? (
          <button
            type="button"
            className="gc-chip"
            onClick={resetFilters}
            style={{ padding: '0.35rem 0.7rem' }}
          >
            مسح الكل ({activeFiltersCount})
          </button>
        ) : null}
      </div>

      <Section id="gc-filter-kind" title="نوع اللعب">
        <Chips<GameKind>
          items={(['room', 'instant', 'upcoming'] as const)}
          active={filters.kinds}
          onToggle={toggleKind}
          labelOf={(k) => KIND_META[k]}
          legend="نوع اللعب"
        />
      </Section>

      <Section id="gc-filter-cat" title="التصنيفات">
        <Chips
          items={allCategories}
          active={filters.categories}
          onToggle={toggleCategory}
          labelOf={(c) => ({ label: c })}
          legend="التصنيفات"
        />
      </Section>

      <Section id="gc-filter-diff" title="الصعوبة">
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <Slider
            id="difficulty-min"
            min={1}
            max={5}
            value={filters.difficultyMin}
            onChange={(v) => setDifficultyMin(v as DifficultyValue)}
            labelOf={(v) => `${'★'.repeat(v)}${'☆'.repeat(5 - v)}`}
            label="الصعوبة الدنيا"
          />
          <Slider
            id="difficulty-max"
            min={1}
            max={5}
            value={filters.difficultyMax}
            onChange={(v) => setDifficultyMax(v as DifficultyValue)}
            labelOf={(v) => `${'★'.repeat(v)}${'☆'.repeat(5 - v)}`}
            label="الصعوبة القصوى"
          />
        </div>
      </Section>

      <Section id="gc-filter-platforms" title="المنصات">
        <Chips<PlatformValue>
          items={(['web', 'pwa', 'mobile'] as const)}
          active={filters.platforms}
          onToggle={togglePlatform}
          labelOf={(p) => PLATFORM_META[p]}
          legend="المنصات"
        />
      </Section>

      <Section id="gc-filter-players" title="سعة اللاعبين">
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <Slider
            id="players-min"
            min={0}
            max={20}
            value={filters.playersMin}
            onChange={setPlayersMin}
            labelOf={(v) => (v === 0 ? 'بلا حد' : `+${v}`)}
            label="الحد الأدنى لعدد اللاعبين"
          />
          <Slider
            id="players-max"
            min={1}
            max={20}
            value={filters.playersMax}
            onChange={setPlayersMax}
            labelOf={(v) => (v === 20 ? '∞' : `${v}`)}
            label="الحد الأقصى لعدد اللاعبين"
          />
        </div>
      </Section>

      <Section id="gc-filter-years" title="سنوات النشر">
        <Chips
          items={allYears.map(String)}
          active={filters.years.map(String)}
          onToggle={(v) => toggleYear(Number(v))}
          labelOf={(v) => ({ label: v })}
          legend="سنوات النشر"
        />
      </Section>

      <Section id="gc-filter-tags" title="جدار الوسوم" defaultOpen={false}>
        <fieldset className="gc-tag-wall" style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }} aria-labelledby="gc-filter-tags">
          <legend style={{ padding: 0, marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-soft)' }}>جدار الوسوم</legend>
          {allTags.map((tag) => {
            const pressed = filters.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={pressed}
                data-active={pressed}
                className="gc-chip"
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            );
          })}
        </fieldset>
      </Section>
    </div>
  );
}
