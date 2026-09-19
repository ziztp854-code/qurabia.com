'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Users, Wifi, Zap } from 'lucide-react';
import type { CatalogGame } from '@/data/games';
import { formatNumber } from '@/lib/utils';

const KIND_LABEL: Record<CatalogGame['kind'], string> = {
  room: 'جماعية',
  instant: 'فورية',
  upcoming: 'قريبًا',
};

export function GameCard({
  game,
  index,
  view,
  prefetch,
  earlyAccess = false,
}: {
  game: CatalogGame;
  index: number;
  view: 'grid' | 'list';
  prefetch?: boolean;
  earlyAccess?: boolean;
}) {
  const isDisabled = !game.href || (game.kind === 'upcoming' && !earlyAccess);
  const cta = isDisabled ? 'قريبًا' : game.kind === 'upcoming' ? 'لعب مبكرًا' : 'العب الآن';
  return (
    <article
      className="gc-card"
      data-kind={game.kind}
      data-mode={game.mode}
      data-view={view}
      style={
        {
          '--game-accent': game.accent,
          animationDelay: `${(index % 6) * 70}ms`,
        } as React.CSSProperties
      }
    >
      <div className="gc-card-head">
        <span className="gc-card-index game-card__index" aria-hidden="true" dir="ltr">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="gc-card-kind" data-kind={game.kind}>
          {game.kind === 'room' ? (
            <Users aria-hidden="true" size={12} />
          ) : game.kind === 'instant' ? (
            <Zap aria-hidden="true" size={12} />
          ) : null}
          {KIND_LABEL[game.kind]}
        </span>
      </div>

      <div className="gc-card-visual" data-visual={game.id} data-artwork="true">
        <Image
          className="gc-card-cover"
          src={game.image}
          alt={game.imageAlt}
          fill
          priority={index < 5}
          sizes={
            view === 'grid' ? '(min-width: 1440px) 18vw, (min-width: 768px) 32vw, 92vw' : '220px'
          }
        />
      </div>

      <div className="gc-card-body">
        <h3 className="gc-card-title" id={`gc-title-${game.id}`}>
          {game.title}
        </h3>
        <p className="gc-card-desc">{game.description}</p>
        <div className="gc-meta-row game-card__meta">
          {game.requiresRealtime ? (
            <span className="gc-meta-chip" data-realtime="true">
              <Wifi aria-hidden="true" size={12} />
              مباشر
            </span>
          ) : null}
          <span className="gc-meta-chip">
            <Users aria-hidden="true" size={12} />
            {game.maximumPlayers === 1
              ? 'لاعب واحد'
              : game.minimumPlayers === 2 && game.maximumPlayers === 2
                ? 'لاعبان'
                : game.minimumPlayers === game.maximumPlayers
                  ? `${formatNumber(game.minimumPlayers)} لاعبين`
                  : `${formatNumber(game.minimumPlayers)}–${game.maximumPlayers >= 20 ? '∞' : formatNumber(game.maximumPlayers)} لاعب`}
          </span>
          <span className="gc-meta-chip">{game.categories.join('، ')}</span>
        </div>
      </div>

      <div className="gc-card-foot">
        <span className="gc-card-year">
          {isDisabled ? 'قريبًا في تحدّي' : (
            <>الصعوبة <bdi dir="ltr">{formatNumber(game.difficulty)} / {formatNumber(5)}</bdi></>
          )}
        </span>
        {isDisabled ? (
          <span aria-labelledby={`gc-title-${game.id}`}>{cta}</span>
        ) : (
          <Link
            href={game.href}
            prefetch={prefetch ?? false}
            aria-labelledby={`gc-title-${game.id}`}
          >
            {cta}
            <ArrowLeft aria-hidden="true" size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}
