'use client';
import { formatNumber } from '@/lib/utils';

import { forwardRef } from 'react';
import { Grid3X3, List, SlidersHorizontal } from 'lucide-react';
import type { UseGameCatalogReturn } from './use-game-catalog';
import type { GameSortKey } from './game-catalog-types';

const SORT_OPTIONS: Array<{ key: GameSortKey; label: string }> = [
  { key: 'popular', label: 'الترتيب المقترح' },
  { key: 'newest', label: 'الأحدث' },
  { key: 'oldest', label: 'الأقدم' },
  { key: 'players', label: 'الأكبر سعة للاعبين' },
  { key: 'manual', label: 'ترتيب المسؤول' },
];

export const GameSortBar = forwardRef<HTMLButtonElement, {
  catalog: UseGameCatalogReturn;
  onOpenFilters: () => void;
}>(function GameSortBar({ catalog, onOpenFilters }, ref) {
  const { filters, setSort, setView, filtered, activeFiltersCount } = catalog;
  return (
    <div className="gc-toolbar" role="toolbar" aria-label="أدوات عرض الألعاب">
      <div className="gc-toolbar-left">
        <span className="gc-result-count" aria-live="polite">
          <b dir="ltr">{formatNumber(filtered.length)}</b>{' '}
          {filtered.length === 1 ? 'نتيجة' : 'نتيجة'}
        </span>
      </div>
      <div className="gc-toolbar-right">
        <button
          ref={ref}
          type="button"
          className="gc-filter-button"
          onClick={onOpenFilters}
          aria-label="فتح لوحة الفلاتر"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal aria-hidden="true" size={16} />
          الفلاتر
          {activeFiltersCount > 0 ? (
            <span className="gc-filter-button-badge" aria-hidden="true">
              {activeFiltersCount}
            </span>
          ) : null}
        </button>
        <label className="sr-only" htmlFor="gc-sort">
          ترتيب حسب
        </label>
        <select
          id="gc-sort"
          className="gc-sort-select"
          value={filters.sort}
          onChange={(e) => setSort(e.target.value as GameSortKey)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <div
          className="gc-view-toggle"
          role="group"
          aria-label="طريقة عرض النتائج"
        >
          <button
            type="button"
            aria-pressed={filters.view === 'grid'}
            aria-label="عرض شبكي"
            onClick={() => setView('grid')}
          >
            <Grid3X3 aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            aria-pressed={filters.view === 'list'}
            aria-label="عرض قائمة"
            onClick={() => setView('list')}
          >
            <List aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});
