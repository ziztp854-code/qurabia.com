'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useGameCatalog } from './use-game-catalog';
import { GameSearch } from './game-search';
import { GameFilters } from './game-filters';
import { GameSortBar } from './game-sort-bar';
import { GameCard } from './game-card';
import { ChallengeCardPreview } from '@/components/3d/challenge-card-preview';
import { formatNumber } from '@/lib/utils';
import { ButtonLink } from '@/components/ui';
import type { CatalogGame } from '@/data/games';

type GameCatalogWrapperProps = {
  sessionUserName: string | null;
  initialGames: readonly CatalogGame[];
  embedded?: boolean;
  earlyAccess?: boolean;
};

function GameCatalogShell({
  sessionUserName,
  initialGames,
  embedded = false,
  earlyAccess = false,
}: GameCatalogWrapperProps) {
  const catalog = useGameCatalog(initialGames);
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
              {formatNumber(catalog.allGames.filter((game) => game.status !== 'soon').length)} لعبة
              متاحة الآن
            </span>
            <HeroHeading className="gc-hero-title">ساحة الألعاب</HeroHeading>
            <p className="gc-hero-desc">
              اختر لعبتك المفضلة وابدأ جولة مباشرة مع أصدقائك، أو اختبر سرعتك وتركيزك في ألعاب فورية
              مصممة لتبقى المنافسة ممتعة.
            </p>
            {!embedded && (
              <div className="gc-start-actions">
                <ButtonLink href="/quizzes/new" variant="gold">
                  أنشئ مسابقة
                </ButtonLink>
                <ButtonLink href="/join" variant="outline">
                  انضم برمز
                </ButtonLink>
                <a href="#gc-results">
                  استكشف الألعاب <ArrowLeft aria-hidden="true" size={16} />
                </a>
              </div>
            )}
            <GameSearch catalog={catalog} />
          </div>
          <div className="gc-hero-preview">
            <span className="gc-hero-preview-badge">
              <Sparkles aria-hidden="true" size={16} />
              بطاقة تحدّي التفاعلية
            </span>
            <ChallengeCardPreview compact />
            <p className="gc-hero-welcome">
              {sessionUserName ? `مرحبًا، ${sessionUserName}. ` : ''}
              اسحب البطاقة لتدويرها، أو استخدم الأسهم للتنقل.
            </p>
          </div>
        </div>
      </section>

      <section className="container gc-catalog-body">
        <GameSortBar
          ref={filtersTriggerRef}
          catalog={catalog}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        <div className="gc-main">
          <GameFilters catalog={catalog} open={filtersOpen} onClose={closeFilters} />
          <div className="gc-results" id="gc-results" aria-live="polite">
            {catalog.filtered.length === 0 ? (
              <div className="gc-empty">
                <b>لا توجد ألعاب مطابقة</b>
                <p>جرّب اسمًا آخر، أو امسح البحث والفلاتر لاستعراض جميع الألعاب.</p>
                <button type="button" className="gc-chip" onClick={catalog.resetFilters}>
                  مسح البحث والفلاتر
                </button>
              </div>
            ) : (
              <>
                {(['room', 'instant', 'upcoming'] as const).map((kind) => {
                  const group = catalog.visibleGames.filter((g) => g.kind === kind);
                  if (!group.length) return null;
                  const label =
                    kind === 'room'
                      ? 'الألعاب الجماعية'
                      : kind === 'instant'
                        ? 'الألعاب الفورية'
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
}: {
  game: Parameters<typeof GameCard>[0]['game'];
  index: number;
  view: Parameters<typeof GameCard>[0]['view'];
  earlyAccess?: boolean;
}) {
  return (
    <LinkWrap>
      <GameCard game={game} index={index} view={view} prefetch={false} earlyAccess={earlyAccess} />
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
