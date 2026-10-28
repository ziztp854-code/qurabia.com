'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Users, Zap, Castle } from 'lucide-react';
import { useGameCatalog } from './use-game-catalog';
import { GameSearch } from './game-search';
import { GameFilters } from './game-filters';
import { GameSortBar } from './game-sort-bar';
import { GameCard } from './game-card';
import { formatNumber } from '@/lib/utils';
import { ButtonLink } from '@/components/ui';
import type { CatalogGame } from '@/data/games';
import { GradientText } from '@/components/react-bits/gradient-text';
import { getGamePlayMode } from './game-catalog-types';

type GameCatalogWrapperProps = {
  sessionUserName: string | null;
  initialGames: readonly CatalogGame[];
  embedded?: boolean;
  earlyAccess?: boolean;
  isSignedIn?: boolean;
};

function GameCatalogShell({
  sessionUserName,
  initialGames,
  embedded = false,
  earlyAccess = false,
  isSignedIn = false,
}: GameCatalogWrapperProps) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shortOnly, setShortOnly] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const catalogGames = useMemo(
    () => initialGames.filter((game) =>
      (!favoritesOnly || favoriteIds.includes(game.id)) &&
      (!shortOnly || (game.timedSessionSeconds !== undefined && game.timedSessionSeconds <= 60)),
    ),
    [favoriteIds, favoritesOnly, initialGames, shortOnly],
  );
  const catalog = useGameCatalog(catalogGames);

  useEffect(() => {
    if (!isSignedIn) return;
    const controller = new AbortController();
    fetch('/api/game-favorites', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('favorites unavailable');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('gameIds' in data) || !Array.isArray(data.gameIds)) throw new Error('invalid favorites');
        setFavoriteIds(data.gameIds.filter((id): id is string => typeof id === 'string'));
        setFavoritesReady(true);
      })
      .catch(() => { if (!controller.signal.aborted) setFavoriteMessage('تعذّر تحميل المفضلة. أعد تحميل الصفحة للمحاولة مجددًا.'); });
    return () => controller.abort();
  }, [isSignedIn]);

  async function toggleFavorite(gameId: string) {
    if (favoriteBusy) return;
    const favorite = !favoriteIds.includes(gameId);
    setFavoriteBusy(gameId);
    setFavoriteMessage('');
    try {
      const response = await fetch('/api/game-favorites', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, favorite }),
      });
      if (!response.ok) throw new Error('favorite update failed');
      setFavoriteIds((ids) => favorite ? [...ids, gameId] : ids.filter((id) => id !== gameId));
      setFavoriteMessage(favorite ? 'أُضيفت اللعبة إلى المفضلة.' : 'أُزيلت اللعبة من المفضلة.');
    } catch {
      setFavoriteMessage('تعذّر تحديث المفضلة. حاول مجددًا.');
    } finally {
      setFavoriteBusy(null);
    }
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isGrid = catalog.filters.view === 'grid';
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const HeroHeading = embedded ? 'h2' : 'h1';
  const GroupHeading = embedded ? 'h3' : 'h2';

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    setTimeout(() => filtersTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFilters();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtersOpen, closeFilters]);

  return (
    <div className={`gc-wrapper${embedded ? ' gc-wrapper--embedded' : ''}`}>
      <section className="container gc-hero">
        <div className="gc-hero-inner">
          <div>
            <span className="gc-hero-kicker">
              <Sparkles aria-hidden="true" size={16} />
              {formatNumber(initialGames.filter((game) => game.status !== 'soon').length)} لعبة
              متاحة الآن
            </span>
            <HeroHeading className="gc-hero-title">
              <GradientText>ساحة الألعاب</GradientText>
            </HeroHeading>
            <p className="gc-hero-desc">
              اختر لعبة جماعية مع أصدقائك، أو اختبر سرعتك وتركيزك في ألعاب فردية مصممة لتبقى
              المنافسة ممتعة.
            </p>
            {!embedded && (
              <div className="gc-start-actions">
                <ButtonLink href="/quizzes/new" variant="gold">
                  أنشئ مسابقة
                </ButtonLink>
                <ButtonLink href="/join" variant="outline">
                  انضم برمز
                </ButtonLink>
                <Link href="#gc-results" prefetch={false}>
                  استكشف الألعاب <ArrowLeft aria-hidden="true" size={16} />
                </Link>
              </div>
            )}
            <GameSearch catalog={catalog} />
          </div>
          <aside className="gc-discovery" aria-label="ابدأ على طريقتك">
            <span className="gc-hero-kicker">
              {sessionUserName ? `مرحبًا، ${sessionUserName}` : 'مساحة لكل نوع من اللاعبين'}
            </span>
            <GroupHeading>على طريقتك، وفي وقتك.</GroupHeading>
            <button type="button" onClick={() => catalog.setFilterPatch({ playModes: ['group'] })}>
              <Users aria-hidden="true" />
              <span>
                <b>مع المجموعة</b>
                <small>جولة تجمعكم وتفتح باب المنافسة</small>
              </span>
              <ArrowLeft aria-hidden="true" />
            </button>
            <button type="button" onClick={() => catalog.setFilterPatch({ playModes: ['solo'] })}>
              <Zap aria-hidden="true" />
              <span>
                <b>تحدٍّ لنفسك</b>
                <small>اختبر معرفتك وسرعتك وتركيزك</small>
              </span>
              <ArrowLeft aria-hidden="true" />
            </button>
            <Link href="/games/kingdoms">
              <Castle aria-hidden="true" />
              <span>
                <b>عالم تبنيه</b>
                <small>طوّر قريتك واكتب حكاية مملكتك</small>
              </span>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <section className="container gc-catalog-body">
        <div className="gc-chips gc-play-modes" role="group" aria-label="تصفح حسب نوع اللعب">
          {(
            [
              { label: 'جميع الألعاب', modes: [] },
              { label: 'الألعاب الجماعية', modes: ['group'] },
              { label: 'الألعاب الفردية', modes: ['solo'] },
            ] as const
          ).map(({ label, modes }) => (
            <button
              key={label}
              type="button"
              className="gc-chip"
              aria-pressed={
                catalog.filters.playModes.length === modes.length &&
                modes.every((mode) => catalog.filters.playModes.includes(mode))
              }
              data-active={
                catalog.filters.playModes.length === modes.length &&
                modes.every((mode) => catalog.filters.playModes.includes(mode))
              }
              onClick={() => catalog.setFilterPatch({ playModes: [...modes] })}
            >
              {label}
            </button>
          ))}
        </div>
        {isSignedIn && (
          <div className="gc-favorite-filter">
            <button type="button" className="gc-chip" aria-pressed={favoritesOnly} data-active={favoritesOnly} disabled={!favoritesReady} onClick={() => setFavoritesOnly((value) => !value)}>
              ألعابي المفضلة
            </button>
            {favoriteMessage && <span role="status">{favoriteMessage}</span>}
          </div>
        )}
        <div className="gc-player-picker" role="group" aria-label="تصفح حسب عدد اللاعبين">
          <span>عدد اللاعبين</span>
          <div className="gc-chips">
            {[
              { label: 'الكل', min: 0, max: 20 },
              { label: 'لاعب واحد', min: 1, max: 1 },
              { label: 'لاعبان', min: 2, max: 2 },
              { label: '٤ لاعبين', min: 4, max: 4 },
            ].map(({ label, min, max }) => (
              <button
                key={label}
                type="button"
                className="gc-chip"
                aria-pressed={catalog.filters.playersMin === min && catalog.filters.playersMax === max}
                data-active={catalog.filters.playersMin === min && catalog.filters.playersMax === max}
                onClick={() => catalog.setFilterPatch({ playersMin: min, playersMax: max })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="gc-duration-filter">
          <button type="button" className="gc-chip" aria-pressed={shortOnly} data-active={shortOnly} onClick={() => setShortOnly((value) => !value)}>
            جلسة موقّتة حتى دقيقة
          </button>
          {shortOnly && <span>تظهر الألعاب التي عُرفت مدة جلستها فقط؛ لا يشمل التدريب.</span>}
        </div>
        <p className="gc-sort-hint">تُرتّب النتائج داخل كل قسم حسب اختيارك.</p>
        <GameSortBar
          ref={filtersTriggerRef}
          catalog={catalog}
          onOpenFilters={() => setFiltersOpen(true)}
          filtersOpen={filtersOpen}
        />
        <div className="gc-main">
          <GameFilters catalog={catalog} open={filtersOpen} onClose={closeFilters} />
          <div className="gc-results" id="gc-results" aria-live="polite">
            {catalog.filtered.length === 0 ? (
              <div className="gc-empty">
                <b>لا توجد ألعاب مطابقة</b>
                <p>جرّب تغيير الاختيارات أو مسح البحث والفلاتر لاستعراض جميع الألعاب.</p>
                <button type="button" className="gc-chip" onClick={() => { catalog.resetFilters(); setFavoritesOnly(false); setShortOnly(false); }}>
                  مسح البحث والفلاتر
                </button>
              </div>
            ) : (
              <>
                {(['group', 'solo', 'upcoming'] as const).map((kind) => {
                  const group = catalog.visibleGames.filter((game) =>
                    kind === 'upcoming'
                      ? game.kind === 'upcoming'
                      : game.kind !== 'upcoming' && getGamePlayMode(game) === kind,
                  );
                  if (!group.length) return null;
                  const label =
                    kind === 'group'
                      ? 'الألعاب الجماعية'
                      : kind === 'solo'
                        ? 'الألعاب الفردية'
                        : 'الألعاب القادمة';
                  return (
                    <section key={kind} className="gc-game-section">
                      <div className="gc-section-heading">
                        <GroupHeading>{label}</GroupHeading>
                        <span>{formatNumber(group.length)}</span>
                      </div>
                      <div
                        className={isGrid ? 'gc-grid' : 'gc-list'}
                        role="list"
                        aria-label={label}
                      >
                        {group.map((game, i) => {
                          const globalIndex = catalog.visibleGames.findIndex(
                            (g) => g.id === game.id,
                          );
                          return (
                            <div role="listitem" key={game.id} style={{ display: 'contents' }}>
                              <GameCardWrap
                                game={game}
                                index={globalIndex >= 0 ? globalIndex : i}
                                view={catalog.filters.view}
                                earlyAccess={earlyAccess}
                                favorite={favoriteIds.includes(game.id)}
                                favoriteBusy={favoriteBusy !== null}
                                onToggleFavorite={isSignedIn && favoritesReady ? () => toggleFavorite(game.id) : undefined}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                <div
                  className="gc-floating-sentinel"
                  ref={catalog.sentinelRef as unknown as React.RefObject<HTMLDivElement>}
                  aria-hidden="true"
                />
                {/* eslint-disable react-hooks/refs */}
                {catalog.hasMore ? (
                  <div className="gc-load-more">
                    <button type="button" onClick={catalog.loadMore}>
                      تحميل المزيد (
                      {formatNumber(catalog.filtered.length - catalog.visibleGames.length)} متبقية)
                    </button>
                  </div>
                ) : null}
                {/* eslint-enable react-hooks/refs */}
              </>
            )}
          </div>
        </div>
      </section>

      <div className="gc-backdrop" onClick={closeFilters} aria-hidden="true" />
    </div>
  );
}

function GameCardWrap({
  game,
  index,
  view,
  earlyAccess,
  favorite,
  favoriteBusy,
  onToggleFavorite,
}: {
  game: Parameters<typeof GameCard>[0]['game'];
  index: number;
  view: Parameters<typeof GameCard>[0]['view'];
  earlyAccess?: boolean;
  favorite?: boolean;
  favoriteBusy?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <LinkWrap>
      <GameCard game={game} index={index} view={view} prefetch={false} earlyAccess={earlyAccess} favorite={favorite} favoriteBusy={favoriteBusy} onToggleFavorite={onToggleFavorite} />
    </LinkWrap>
  );
}

function LinkWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'contents' }}>{children}</div>;
}

export function GameCatalogWrapper(props: GameCatalogWrapperProps) {
  return <GameCatalogShell {...props} />;
}

export default GameCatalogWrapper;
