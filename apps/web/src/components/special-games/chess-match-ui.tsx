'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { ChessPieceSvg, getPieceLabel } from './chess-piece';

export type ChessColor = 'white' | 'black';

export function CapturedPiecesPanel({
  color,
  pieces,
  compact = false,
}: {
  color: ChessColor;
  pieces: string[];
  compact?: boolean;
}) {
  const colorLabel = color === 'white' ? 'الأبيض' : 'الأسود';

  return (
    <section
      className={`chess-captured-panel ${compact ? 'chess-captured-panel--compact' : ''}`}
      aria-label={`قطع ${colorLabel} المأسورة`}
    >
      <div className="chess-captured-panel__header">
        <span>قطع {colorLabel}</span>
        <strong>{pieces.length}</strong>
      </div>
      {pieces.length === 0 ? (
        <p className="chess-captured-panel__empty">لا توجد قطع مأسورة</p>
      ) : (
        <div className="chess-captured-panel__pieces">
          {pieces.map((piece, index) => (
            <span
              key={`${piece}-${index}`}
              className="chess-captured-piece"
              role="img"
              aria-label={getPieceLabel(piece)}
              title={getPieceLabel(piece)}
            >
              <ChessPieceSvg piece={piece} color={color} decorative />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function ChessPlayerBar({
  color,
  name,
  connected,
  remainingMs,
  startedAt,
  active,
  isSelf,
  turnLabel,
  position,
  capturedPieces,
}: {
  color: ChessColor;
  name: string;
  connected: boolean;
  remainingMs: number;
  startedAt?: number;
  active: boolean;
  isSelf: boolean;
  turnLabel: string;
  position: 'opponent' | 'player';
  capturedPieces: string[];
}) {
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt || remainingMs <= 0) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active, remainingMs, startedAt]);

  const displayedMs =
    active && startedAt ? Math.max(0, remainingMs - (clockNow - startedAt)) : remainingMs;
  const totalSeconds = Math.max(0, Math.ceil(displayedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const clock = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <section
      className={`chess-player chess-player--${position} ${active ? 'active' : ''} ${!connected ? 'disconnected' : ''}`}
      data-player-color={color}
      data-player-self={isSelf}
      aria-label={`بيانات اللاعب ${name}`}
    >
      <div className="chess-player__main">
        <span className="chess-player__avatar" aria-hidden="true">
          <ChessPieceSvg piece="K" color={color} decorative />
        </span>
        <div className="chess-player__info">
          <span className="chess-player__name">{name}</span>
          <span className="chess-player__rating">غير مصنّف</span>
        </div>
      </div>
      <CapturedPiecesPanel color={color} pieces={capturedPieces} compact />
      <div className="chess-player__meta">
        {active && <span className="chess-player__turn-indicator">{turnLabel}</span>}
        {isSelf && <span className="chess-player__badge">أنت</span>}
        <span className={`chess-player__connection ${connected ? 'is-online' : ''}`}>
          <span aria-hidden="true" />
          {connected ? 'متصل' : 'غير متصل'}
        </span>
        <span
          className={`chess-player__clock ${displayedMs > 0 && displayedMs < 10_000 ? 'is-urgent' : ''}`}
          dir="ltr"
          aria-label={`الوقت المتبقي ${formatNumber(minutes)} دقيقة و${formatNumber(seconds)} ثانية`}
        >
          {clock}
        </span>
      </div>
    </section>
  );
}

export function ChessMoveHistory({
  moves,
  open,
  onToggle,
}: {
  moves: Array<{ san: string }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`chess-side-panel ${open ? 'is-open' : ''}`}
      aria-label="سجل النقلات"
    >
      <div className="chess-side-panel__header">
        <h2>
          <History aria-hidden="true" />
          سجل النقلات
        </h2>
        <button
          type="button"
          className="chess-move-history-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="chess-move-history-list"
        >
          {open ? 'إغلاق' : `عرض (${moves.length})`}
        </button>
      </div>
      <div className="chess-move-columns" aria-hidden="true">
        <span>رقم</span>
        <span>الأبيض</span>
        <span>الأسود</span>
      </div>
      {moves.length === 0 ? (
        <p className="chess-move-empty">ستظهر النقلات هنا بعد بدء اللعب.</p>
      ) : (
        <ol className="chess-move-list" id="chess-move-history-list">
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => {
            const whiteMove = moves[index * 2];
            const blackMove = moves[index * 2 + 1];
            return (
              <li key={index}>
                <span className="chess-move-number">{index + 1}</span>
                <span className="white-move">{whiteMove?.san ?? '—'}</span>
                <span className="black-move">{blackMove?.san ?? '—'}</span>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
