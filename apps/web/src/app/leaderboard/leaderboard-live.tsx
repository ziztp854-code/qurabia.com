'use client';
import { formatNumber } from '@/lib/utils';

import { useCallback, useEffect, useState } from 'react';
import { PageBackButton } from '@/components/layout/site-shell';
import type { LeaderboardPayload, LeaderboardPlayer } from '@/lib/leaderboard/types';

const REFRESH_MS = 5_000;

export function LeaderboardLive({
  initialPlayers,
  initialLoadError = false,
}: {
  initialPlayers: LeaderboardPlayer[];
  initialLoadError?: boolean;
}) {
  const [players, setPlayers] = useState(initialPlayers.slice(0, 10));
  const [loadError, setLoadError] = useState(initialLoadError);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/leaderboard', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('LEADERBOARD_REQUEST_FAILED');
      const payload = (await response.json()) as LeaderboardPayload;
      setPlayers(payload.players.slice(0, 10));
      setLoadError(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: number;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timeout = window.setTimeout(poll, REFRESH_MS);
    }
    void poll();
    return () => {
      controller.abort();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [refresh]);

  return (
    <main className="leaderboard-poster-page">
      <h1 className="sr-only">لوحة الشرف</h1>
      <div className="leaderboard-poster-frame">
        <PageBackButton className="leaderboard-back-button" />
        <picture>
          <source
            media="(max-width: 40rem)"
            srcSet="/game-art/leaderboard-hall-of-fame-mobile.webp"
          />
          <img
            className="leaderboard-poster"
            src="/game-art/leaderboard-hall-of-fame.webp"
            alt="لوحة الشرف بمنصة ذهبية للفائزين وقائمة أفضل عشرة متسابقين"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
        </picture>

        {[players[1], players[0], players[2]].map((player, index) =>
          player ? (
            <div
              className={`leaderboard-live-winner leaderboard-live-winner-${index + 1}`}
              key={player.id}
              aria-hidden="true"
            >
              <strong>{player.name}</strong>
              <small>المركز {formatNumber(player.rank)}</small>
              <span>{formatNumber(player.score)}</span>
            </div>
          ) : null,
        )}

        <ol className="leaderboard-live-ranking" aria-label="ترتيب الفائزين المحدث">
          {players.map((player) => (
            <li
              key={player.id}
              aria-label={`المركز ${formatNumber(player.rank)}: ${player.name}، ${formatNumber(player.score)} نقطة`}
            >
              <span>{player.name}</span>
              <strong>{formatNumber(player.score)}</strong>
            </li>
          ))}
        </ol>
        {loadError ? (
          <p className="leaderboard-live-error">تعذّر تحديث الفائزين</p>
        ) : players.length === 0 ? (
          <p className="leaderboard-live-error">لا توجد نتائج منشورة بعد</p>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {players[0]
          ? `المتصدر الآن ${players[0].name} برصيد ${formatNumber(players[0].score)} نقطة`
          : loadError
            ? 'تعذّر تحديث الفائزين الآن. ستتم المحاولة تلقائيًا.'
            : 'لا توجد نتائج منشورة بعد.'}
      </p>
    </main>
  );
}
