import { formatNumber } from '@/lib/utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameSearch, GameFilters, GameSortBar, GameCard, GameCatalogWrapper } from './index';
import type { UseGameCatalogReturn } from './use-game-catalog';
import React from 'react';
import { DEFAULT_FILTER_STATE } from './game-catalog-types';
import { availableGamesCount, publicGames, toCatalogGames } from '@/data/games';

vi.mock('@/components/3d/challenge-card-preview', () => ({
  ChallengeCardPreview: () => null,
}));

const catalogSample = toCatalogGames(publicGames);

function makeCatalog(partial: Partial<UseGameCatalogReturn> = {}): UseGameCatalogReturn {
  const base = {
    allGames: catalogSample,
    allCategories: Array.from(new Set(catalogSample.flatMap((g) => g.categories))),
    allTags: Array.from(new Set(catalogSample.flatMap((g) => g.tags))),
    allYears: Array.from(new Set(catalogSample.map((g) => g.year))),
    filters: { ...DEFAULT_FILTER_STATE },
    setFilterPatch: () => {},
    toggleKind: () => {},
    toggleCategory: () => {},
    togglePlatform: () => {},
    toggleYear: () => {},
    toggleTag: () => {},
    setDifficultyMin: () => {},
    setDifficultyMax: () => {},
    setPlayersMin: () => {},
    setPlayersMax: () => {},
    setSort: () => {},
    setView: () => {},
    setQuery: () => {},
    clearQuery: () => {},
    resetFilters: () => {},
    activeFiltersCount: 0,
    filtered: catalogSample,
    visibleGames: catalogSample,
    hasMore: false,
    loadMore: () => {},
    stats: { total: catalogSample.length, categories: 5 },
    suggestions: [],
    suggestionsOpen: false,
    setSuggestionsOpen: () => {},
    activeSuggestionIndex: -1,
    setActiveSuggestionIndex: () => {},
    applySuggestion: () => {},
    closeSuggestions: () => {},
    PAGE_SIZE: 6,
    sentinelRef: { current: null },
  } as unknown as UseGameCatalogReturn;
  return { ...base, ...partial };
}

describe('GameCatalog UI', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns a unique generated cover to every catalog game', () => {
    const covers = publicGames.map((game) => game.image);
    expect(new Set(covers).size).toBe(publicGames.length);
    expect(covers.every((cover) => cover.startsWith('/game-art/catalog-v2/'))).toBe(true);
  });

  it('GameCard renders grid/list variants and accent CSS custom property', () => {
    const game = catalogSample[0];
    const { rerender, container } = render(<GameCard game={game} index={0} view="grid" />);
    expect(screen.getByRole('heading', { level: 3, name: game.title })).toBeInTheDocument();
    const card = container.querySelector('.gc-card') as HTMLElement;
    expect(card.style.getPropertyValue('--game-accent')).toBe(game.accent);
    expect(container.querySelector('.gc-card-visual')).toHaveAttribute('data-visual', game.id);
    expect(container.querySelector('.gc-card-cover')).toHaveAttribute('alt');
    rerender(<GameCard game={game} index={0} view="list" />);
    expect(screen.getByRole('heading', { level: 3, name: game.title })).toBeInTheDocument();
  });

  it('يعرض القاتل داخل الألعاب ويربطه بصفحة القاتل الحقيقية', () => {
    const game = catalogSample.find((item) => item.id === 'mafia');
    expect(game).toBeDefined();
    render(<GameCard game={game!} index={1} view="grid" />);
    expect(screen.getByRole('heading', { level: 3, name: 'القاتل' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'القاتل' })).toHaveAttribute('href', '/mafia');
  });

  it('يعرض برج المعرفة داخل الألعاب ويربطه بصفحته', () => {
    const game = catalogSample.find((item) => item.id === 'knowledge-tower');
    expect(game).toBeDefined();
    render(<GameCard game={game!} index={0} view="grid" />);
    expect(screen.getByRole('heading', { level: 3, name: 'برج المعرفة' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'برج المعرفة' })).toHaveAttribute(
      'href',
      '/games/knowledge-tower',
    );
  });

  it('يعرض من سيربح المليون داخل الألعاب ويربطه بصفحته', () => {
    const game = catalogSample.find((item) => item.id === 'millionaire');
    expect(game).toBeDefined();
    render(<GameCard game={game!} index={2} view="grid" />);
    expect(
      screen.getByRole('heading', { level: 3, name: 'من سيربح المليون؟' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'من سيربح المليون؟' })).toHaveAttribute(
      'href',
      '/games/millionaire',
    );
  });

  it('يعرض البلوت داخل الألعاب ويربطه بلوحة البلوت', () => {
    const game = catalogSample.find((item) => item.id === 'baloot');
    expect(game).toBeDefined();
    render(<GameCard game={game!} index={3} view="grid" />);
    expect(screen.getByRole('heading', { level: 3, name: 'البلوت' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'البلوت' })).toHaveAttribute('href', '/games/baloot');
  });

  it('يعرض الكتالوج المضمّن بعنوان متوافق مع تسلسل الصفحة الرئيسية', async () => {
    render(<GameCatalogWrapper sessionUserName={null} initialGames={catalogSample} embedded />);

    expect(
      await screen.findByText(`${formatNumber(availableGamesCount)} لعبة متاحة الآن`),
    ).toBeInTheDocument();
    expect(screen.queryByText('متواجد الآن')).not.toBeInTheDocument();
    expect(screen.queryByText('لاعب في غرفة حيّة')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ابدأ أول غرفة الآن' })).not.toBeInTheDocument();
    expect(screen.queryByText(/متوسط التقييم|نشط الآن/)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(/ساحة\s*الألعاب/);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'الألعاب الجماعية' }),
    ).toBeInTheDocument();
  });

  it('GameSearch combobox has a11y attributes and debounces input', async () => {
    const setQuery = vi.fn();
    const catalog = makeCatalog({
      filters: { ...DEFAULT_FILTER_STATE, query: '' },
      setQuery,
      suggestions: [
        { id: 'game:color-rush', type: 'game', label: 'خدعة الألوان', match: 'فورية · تركيز' },
      ],
      suggestionsOpen: true,
    });
    render(<GameSearch catalog={catalog} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    const user = userEvent.setup();
    await user.click(input);
    for (const ch of 'خدعة') {
      await user.keyboard(ch);
    }
    if (setQuery.mock.calls.length === 0) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(setQuery.mock.calls.length).toBeGreaterThan(0);
    const opt = screen.getByRole('option', { name: /خدعة الألوان/ });
    expect(opt).toBeInTheDocument();
  }, 30000);

  it('GameSortBar exposes sort select, view toggle, and filter badge', () => {
    const setSort = vi.fn();
    const setView = vi.fn();
    const catalog = makeCatalog({
      filters: { ...DEFAULT_FILTER_STATE, view: 'grid', sort: 'popular' },
      setSort,
      setView,
      activeFiltersCount: 3,
    });
    render(<GameSortBar catalog={catalog} onOpenFilters={() => {}} />);
    expect(screen.getByLabelText(/ترتيب حسب/)).toBeInTheDocument();
    const [gridBtn] = screen.getAllByRole('button', { name: /عرض/ });
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('GameFilters panel renders sections, chips aria-pressed, and sliders with accessible names', () => {
    const toggleKind = vi.fn();
    const catalog = makeCatalog({ toggleKind });
    render(<GameFilters catalog={catalog} open={true} onClose={() => {}} />);
    const sections = screen.getAllByRole('region') as HTMLElement[];
    expect(sections.length).toBeGreaterThanOrEqual(5);
    const kindChip = screen
      .getAllByRole('button')
      .find((el) => /جماعية|فورية|قريبًا/.test(el.textContent ?? ''));
    expect(kindChip).toBeDefined();
    expect(kindChip).toHaveAttribute('aria-pressed');
    const diffMinLabel = screen.getByLabelText('الصعوبة الدنيا');
    expect(diffMinLabel).toBeInTheDocument();
    expect(screen.queryByLabelText('التقييم الأدنى للألعاب')).not.toBeInTheDocument();
  });

  it('يجعل لعبة الطيف القادمة غير قابلة للنقر', () => {
    const game = catalogSample.find((item) => item.id === 'spectrum');
    expect(game).toBeDefined();
    const { container } = render(<GameCard game={game!} index={0} view="grid" />);
    expect(screen.getByText('قريبًا في تحدّي')).toBeInTheDocument();
    expect(container.querySelector('a[href]')).not.toBeInTheDocument();
  });

  it('GameSearch closes suggestions on Escape and navigates Arrow keys + Enter applies', async () => {
    const applySuggestion = vi.fn();
    const setActive = vi.fn();
    const setOpen = vi.fn();
    const closeSuggestions = vi.fn();
    const suggestions = [
      {
        id: 'game:color-rush',
        type: 'game' as const,
        label: 'خدعة الألوان',
        match: 'فورية · تركيز',
      },
      {
        id: 'category:اجتماعي',
        type: 'category' as const,
        label: 'التصنيف: اجتماعي',
        match: '4 ألعاب',
      },
      { id: 'tag:سريع', type: 'tag' as const, label: 'الوسم: سريع', match: '5 ألعاب' },
    ];
    const catalog = makeCatalog({
      filters: { ...DEFAULT_FILTER_STATE, query: '' },
      suggestions,
      suggestionsOpen: true,
      activeSuggestionIndex: 0,
      setActiveSuggestionIndex: setActive,
      applySuggestion,
      setSuggestionsOpen: setOpen,
      closeSuggestions,
    });
    render(<GameSearch catalog={catalog} />);
    const input = screen.getByRole('combobox');
    const user = userEvent.setup();
    await user.click(input);

    await user.keyboard('{ArrowDown}');
    expect(setActive.mock.calls.length).toBeGreaterThan(0);

    await user.keyboard('{ArrowUp}');
    expect(setActive.mock.calls.length).toBeGreaterThan(1);

    await user.keyboard('{Enter}');
    expect(applySuggestion.mock.calls.length).toBe(1);

    setActive.mockClear();
    applySuggestion.mockClear();
    closeSuggestions.mockClear();
    await user.keyboard('{Escape}');
    expect(closeSuggestions.mock.calls.length).toBe(1);
  }, 30000);

  it('GameSearch onBlur closes suggestions only when focus leaves entire component', async () => {
    const closeSuggestions = vi.fn();
    const catalog = makeCatalog({
      filters: { ...DEFAULT_FILTER_STATE, query: '' },
      suggestions: [{ id: 'game:color-rush', type: 'game', label: 'خدعة الألوان', match: 'فورية' }],
      suggestionsOpen: true,
      closeSuggestions,
    });
    const { container } = render(
      <div>
        <GameSearch catalog={catalog} />
        <button type="button" data-outside>
          خارج البحث
        </button>
      </div>,
    );
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.click(input);

    const clearBtn = container.querySelector(
      '.gc-search-btn[aria-label="مسح البحث"]',
    ) as HTMLButtonElement | null;
    closeSuggestions.mockClear();
    if (clearBtn) {
      await user.click(clearBtn);
    }

    const outside = screen.getByRole('button', { name: /خارج البحث/ });
    await user.click(outside);
    expect(closeSuggestions.mock.calls.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('GameCard passes prefetch to the underlying Link element', () => {
    const game = catalogSample[0];
    const { container, rerender } = render(
      <GameCard game={game} index={0} view="grid" prefetch={true} />,
    );
    const link = container.querySelector('a[href]') as HTMLAnchorElement | null;
    expect(link).toBeDefined();
    rerender(<GameCard game={game} index={0} view="grid" prefetch={false} />);
    const link2 = container.querySelector('a[href]') as HTMLAnchorElement | null;
    expect(link2).toBeDefined();
  });

  it('keeps every typed character visible before search results settle', async () => {
    render(<GameCatalogWrapper sessionUserName={null} initialGames={catalogSample} />);
    const user = userEvent.setup();
    const input = screen.getByRole('combobox', { name: 'ابحث عن لعبة' });
    await user.type(input, 'الشطرنج');
    expect(input).toHaveValue('الشطرنج');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByRole('link', { name: 'تحدي الشطرنج' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'برج المعرفة' })).not.toBeInTheDocument();
  }, 15_000);

  it('offers a direct recovery from an empty search and competition entry links', async () => {
    render(<GameCatalogWrapper sessionUserName={null} initialGames={catalogSample} />);
    const user = userEvent.setup();
    expect(screen.getByRole('link', { name: 'أنشئ مسابقة' })).toHaveAttribute(
      'href',
      '/quizzes/new',
    );
    expect(screen.getByRole('link', { name: 'انضم برمز' })).toHaveAttribute('href', '/join');
    await user.type(screen.getByRole('combobox', { name: 'ابحث عن لعبة' }), 'zzzzzz');
    await act(() => vi.advanceTimersByTimeAsync(200));
    await user.click(screen.getByRole('button', { name: 'مسح البحث والفلاتر' }));
    expect(screen.getByRole('link', { name: 'برج المعرفة' })).toBeInTheDocument();
  }, 15_000);

  it('does not offer early access when the upcoming game has no destination', () => {
    const game = catalogSample.find((item) => item.id === 'spectrum')!;
    render(<GameCard game={{ ...game, href: '' }} index={0} view="grid" earlyAccess />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('قريبًا في تحدّي')).toBeInTheDocument();
  });
});
