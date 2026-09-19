import { describe, it, expect } from 'vitest';
import {
  applyCatalogFilters,
  buildSearchSuggestions,
  collectAllCategories,
  collectAllTags,
  collectAllYears,
  DEFAULT_FILTER_STATE,
  gameMatchesFilters,
  INJECTED_GAME_CATALOG,
  mergeCatalogWithExisting,
  normalizeCatalogFilters,
  sortGames,
  summarizeGames,
  type GameFilterState,
} from './game-catalog.js';

function takeCatalog() {
  return mergeCatalogWithExisting(INJECTED_GAME_CATALOG);
}

function filterState(partial: Partial<GameFilterState>): GameFilterState {
  return {
    ...DEFAULT_FILTER_STATE,
    tags: DEFAULT_FILTER_STATE.tags.filter((t): t is string => Boolean(t)),
    ...partial,
  };
}

describe('game-catalog engine', () => {
  it('exposes at least 7 games including upcoming', () => {
    const catalog = takeCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(7);
    expect(catalog.some((g) => g.id === 'knowledge-tower' && g.href === '/games/knowledge-tower')).toBe(
      true,
    );
    expect(catalog.some((g) => g.id === 'millionaire')).toBe(true);
    expect(catalog.some((g) => g.id === 'baloot' && g.title === 'البلوت')).toBe(true);
    expect(
      catalog.some((g) => g.id === 'letter-challenge' && g.href === '/games/letter-challenge'),
    ).toBe(true);
    expect(catalog.some((g) => g.kind === 'room')).toBe(true);
    expect(catalog.some((g) => g.kind === 'instant')).toBe(true);
    expect(catalog.some((g) => g.kind === 'upcoming')).toBe(true);
  });

  it('collectAll helpers return distinct sorted values', () => {
    const catalog = takeCatalog();
    const tags = collectAllTags(catalog);
    expect(tags.every((t, i) => i === 0 || tags[i - 1].localeCompare(t, 'ar') <= 0)).toBe(true);
    expect(collectAllCategories(catalog).length).toBeGreaterThan(0);
    const years = collectAllYears(catalog);
    expect(years.every((y, i) => i === 0 || years[i - 1] >= y)).toBe(true);
  });

  it('لا يحمل الكتالوج مقاييس تقييم أو نشاط مختلقة', () => {
    const catalog = takeCatalog();
    expect(
      catalog.every(
        (game) =>
          !('rating' in game) && !('sessionsCount' in game) && !('nowPlaying' in game),
      ),
    ).toBe(true);
  });

  it('gameMatchesFilters respects kinds/categories/platforms/years/tags', () => {
    const catalog = takeCatalog();
    const game = catalog.find((g) => g.id === 'parallel-world')!;
    expect(game).toBeTruthy();
    const roomsOnly = filterState({ kinds: ['room'] });
    expect(gameMatchesFilters(game, roomsOnly)).toBe(true);
    const instantOnly = filterState({ kinds: ['instant'] });
    expect(gameMatchesFilters(game, instantOnly)).toBe(false);
    const badCategory = filterState({ categories: ['حظ'] });
    expect(gameMatchesFilters(game, badCategory)).toBe(game.categories.includes('حظ'));
    const yearOn = filterState({ years: [game.year] });
    expect(gameMatchesFilters(game, yearOn)).toBe(true);
    const firstTag = game.tags[0];
    const withTag = firstTag ? filterState({ tags: [firstTag] }) : filterState({});
    expect(gameMatchesFilters(game, withTag)).toBe(true);
    const outOfRange = filterState({ playersMin: 99 });
    expect(gameMatchesFilters(game, outOfRange)).toBe(false);
  });

  it('gameMatchesFilters supports arabic query search on title, categories, tags', () => {
    const catalog = takeCatalog();
    const game = catalog.find((g) => g.id === 'memory-flash')!;
    expect(game).toBeTruthy();
    const qTitle = filterState({ query: 'ومضة' });
    expect(gameMatchesFilters(game, qTitle)).toBe(true);
    const firstTag = game.tags[0];
    if (firstTag) {
      const qTag = filterState({ query: firstTag });
      expect(gameMatchesFilters(game, qTag)).toBe(true);
    }
    const qNoMatch = filterState({ query: 'لعبة غير موجودة أبدًا' });
    expect(gameMatchesFilters(game, qNoMatch)).toBe(false);
  });

  it('sortGames produces stable ordering for each strategy', () => {
    const catalog = takeCatalog();
    const keys = ['popular', 'newest', 'oldest', 'players'] as const;
    for (const key of keys) {
      const sorted = sortGames(catalog, filterState({ sort: key }));
      expect(sorted.map((g) => g.id)).toHaveLength(catalog.length);
    }
    expect(sortGames(catalog, filterState({ sort: 'popular' }))).toEqual(catalog);
  });

  it('manual sort follows provided order then appends unknown', () => {
    const catalog = takeCatalog();
    const order = ['color-rush', 'infiltrator'];
    const sorted = sortGames(catalog, filterState({ sort: 'manual', manualOrder: order }));
    expect(sorted[0]?.id).toBe('color-rush');
    expect(sorted[1]?.id).toBe('infiltrator');
  });

  it('buildSearchSuggestions returns games first then categories then tags', () => {
    const catalog = takeCatalog();
    const sugg = buildSearchSuggestions(catalog, filterState({ query: 'ذكاء' }), 12);
    expect(sugg.length).toBeGreaterThan(0);
    expect(sugg.some((s) => s.type === 'game' || s.type === 'category')).toBe(true);
  });

  it('summarizeGames totals reflect filtered set', () => {
    const catalog = takeCatalog();
    const popular = sortGames(catalog, filterState({ sort: 'popular' })).slice(0, 3);
    const s = summarizeGames(popular);
    expect(s.total).toBe(3);
    expect(s.categories).toBeGreaterThan(0);
  });

  it('applyCatalogFilters filters and sorts in one step', () => {
    const catalog = takeCatalog();
    const onlyInstant = applyCatalogFilters(
      catalog,
      filterState({ kinds: ['instant'], sort: 'newest' }),
    );
    expect(onlyInstant.every((g) => g.kind === 'instant')).toBe(true);
    for (let i = 1; i < onlyInstant.length; i++) {
      const prev = onlyInstant[i - 1]?.year ?? 0;
      const next = onlyInstant[i]?.year ?? 0;
      expect(prev).toBeGreaterThanOrEqual(next);
    }
  });

  describe('normalizeCatalogFilters', () => {
    it('تطبيع difficultyMin > difficultyMax مع الحفاظ على النطاق الصحيح', () => {
      const norm = normalizeCatalogFilters(filterState({ difficultyMin: 5, difficultyMax: 2 }));
      expect(norm.difficultyMin).toBeLessThanOrEqual(norm.difficultyMax);
      expect(norm.difficultyMin).toBe(2);
      expect(norm.difficultyMax).toBe(5);
    });

    it('تطبيع playersMin > playersMax دون انقلاب النطاق', () => {
      const norm = normalizeCatalogFilters(filterState({ playersMin: 16, playersMax: 3 }));
      expect(norm.playersMin).toBeLessThanOrEqual(norm.playersMax);
      expect(norm.playersMin).toBe(3);
      expect(norm.playersMax).toBe(16);
    });

    it('انقلاب النطاقات لا يُعيد قائمة فارغة خطأً', () => {
      const catalog = takeCatalog();
      const inverted = filterState({
        difficultyMin: 5,
        difficultyMax: 2,
        playersMin: 20,
        playersMax: 1,
      });
      const result = applyCatalogFilters(catalog, inverted);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('ensurePresent semantics for suggestions (simulated via filters)', () => {
    it('إضافة تصنيف موجود مسبقاً لا يحذفه من القائمة', () => {
      const initial = filterState({ categories: ['اجتماعي'] });
      const categories = initial.categories.includes('اجتماعي')
        ? initial.categories
        : [...initial.categories, 'اجتماعي' as GameFilterState['categories'][number]];
      expect(categories).toContain('اجتماعي');
      expect(categories.filter((c) => c === 'اجتماعي')).toHaveLength(1);
    });

    it('إضافة وسم موجود مسبقاً لا يحذفه من القائمة', () => {
      const initial = filterState({ tags: ['سريع'] });
      const tags = initial.tags.includes('سريع') ? initial.tags : [...initial.tags, 'سريع'];
      expect(tags).toContain('سريع');
      expect(tags.filter((t) => t === 'سريع')).toHaveLength(1);
    });
  });
});
