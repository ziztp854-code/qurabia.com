'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Search, X as CloseIcon } from 'lucide-react';
import type { UseGameCatalogReturn } from './use-game-catalog';

export function GameSearch({ catalog }: { catalog: UseGameCatalogReturn }) {
  const {
    filters,
    setQuery,
    clearQuery,
    suggestions,
    suggestionsOpen,
    setSuggestionsOpen,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    applySuggestion,
    closeSuggestions,
  } = catalog;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const node = wrapperRef.current;
      if (!node) return;
      const target = event.target as Node;
      if (node.contains(target)) return;
      closeSuggestions();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeSuggestions]);

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const relatedTarget = event.relatedTarget as Node | null;
    const container = wrapperRef.current;
    if (container && relatedTarget && container.contains(relatedTarget)) {
      return;
    }
    closeSuggestions();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = (activeSuggestionIndex + 1) % suggestions.length;
      setActiveSuggestionIndex(next);
      setSuggestionsOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
      setActiveSuggestionIndex(next);
      setSuggestionsOpen(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
      if (picked) applySuggestion(picked);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSuggestions();
    }
  }

  return (
    <div className="gc-search" ref={wrapperRef}>
      <label className="gc-search-label" htmlFor="gc-search-input">
        ابحث عن لعبة
      </label>
      <div className="gc-search-field">
        <input
          id="gc-search-input"
          name="game-search"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={suggestionsOpen && suggestions.length > 0}
          aria-controls="gc-suggestions-list"
          aria-activedescendant={
            activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]
              ? `gc-suggestion-${suggestions[activeSuggestionIndex].id}`
              : undefined
          }
          aria-autocomplete="list"
          placeholder="ابحث بلعبة أو تصنيف أو وسم…"
          value={filters.query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setSuggestionsOpen(!!suggestions.length || filters.query.length > 0)}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
        />
        {filters.query ? (
          <button
            type="button"
            className="gc-search-btn"
            aria-label="مسح البحث"
            onClick={() => {
              clearQuery();
              inputRef.current?.focus();
            }}
          >
            <CloseIcon aria-hidden="true" size={16} />
          </button>
        ) : (
          <span className="gc-search-btn" aria-hidden="true">
            <Search aria-hidden="true" size={16} />
          </span>
        )}
      </div>
      {suggestionsOpen && suggestions.length > 0 && (
        <ul id="gc-suggestions-list" className="gc-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`gc-suggestion-${s.id}`}
              role="option"
              aria-selected={activeSuggestionIndex === i}
              className="gc-suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => {
                setActiveSuggestionIndex(i);
              }}
              onClick={() => applySuggestion(s)}
            >
              <span className="gc-suggestion-type" data-type={s.type}>
                {s.type === 'game' ? 'لعبة' : s.type === 'category' ? 'تصنيف' : 'وسم'}
              </span>
              <span className="gc-suggestion-label">
                <b>{s.label}</b>
                {s.match ? <span>{s.match}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
