'use client';
import { formatNumber } from '@/lib/utils';

import {
  Check,
  Crown,
  DoorOpen,
  LoaderCircle,
  Play,
  UsersRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SpecialGameMeta } from '@tahaddi/domain';
import { Button } from '@/components/ui';
import type { GameSocket, Player, Room } from './use-special-game-socket';

interface WaitingRoomProps {
  room: Room;
  socketId: string;
  isHost: boolean;
  meta: SpecialGameMeta;
  busy: boolean;
  socketRef: RefObject<GameSocket | null>;
  setBusy: (v: boolean) => void;
}

/** Auto-start countdown seconds once all minimum players are ready. */
const AUTO_START_SECONDS = 10;

export function WaitingRoom({
  room,
  socketId,
  isHost,
  meta,
  busy,
  socketRef,
  setBusy,
}: WaitingRoomProps) {
  const minimumReached = room.players.length >= meta.minimumPlayers;
  const readyIds = room.readyPlayerIds ?? [];
  const isReady = readyIds.includes(socketId);
  const allReady =
    room.players.length > 0 && room.players.every((p) => readyIds.includes(p.id));

  // Auto-start countdown; state is only updated from timer callbacks to
  // satisfy react-hooks/set-state-in-effect.
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    if (!(isHost && minimumReached && allReady)) return;

    let seconds = AUTO_START_SECONDS;
    const initTimeout = window.setTimeout(() => setCountdown(seconds), 0);
    const interval = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        window.clearInterval(interval);
        countdownRef.current = null;
        setCountdown(null);
        setBusy(true);
        socketRef.current?.emit('special:game:start', { pin: room.pin });
      } else {
        setCountdown(seconds);
      }
    }, 1000);
    countdownRef.current = interval;

    return () => {
      window.clearTimeout(initTimeout);
      window.clearInterval(interval);
      countdownRef.current = null;
    };
  }, [isHost, minimumReached, allReady, room.pin, setBusy, socketRef]);

  const activeCountdown =
    isHost && minimumReached && allReady ? countdown : null;

  const handleLeave = () => {
    setBusy(true);
    socketRef.current?.emit('special:room:leave', { pin: room.pin });
  };

  const handleReady = () => {
    if (isReady || busy) return;
    setBusy(true);
    socketRef.current?.emit('special:player:ready', { pin: room.pin });
  };

  return (
    <div className="waiting-room">
      <PlayerList players={room.players} hostId={room.hostId} readyIds={readyIds} socketId={socketId} />

      <div className="waiting-room__actions">
        <p
          className="waiting-room__status"
          data-ready={minimumReached || undefined}
          role="status"
        >
          {minimumReached
          ? allReady
            ? isHost
              ? activeCountdown !== null
                ? `تبدأ اللعبة خلال ${formatNumber(activeCountdown)} ثانية…`
                : 'الكل جاهز. يمكنك البدء الآن.'
              : 'اكتمل العدد. انتظر المضيف.'
              : `اكتمل الحد الأدنى. اضغط «جاهز» للمتابعة.`
            : `بانتظار ${formatNumber(Math.max(0, meta.minimumPlayers - room.players.length))} لاعبين على الأقل.`}
        </p>

        {isHost ? (
          <Button
            variant="gold"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!minimumReached || busy}
            onClick={() => {
              if (countdownRef.current !== null) {
                window.clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              setCountdown(null);
              setBusy(true);
              socketRef.current?.emit('special:game:start', { pin: room.pin });
            }}
          >
            <Play aria-hidden="true" />
            ابدأ الجولة
          </Button>
        ) : (
          <Button
            variant={isReady ? 'outline' : 'gold'}
            size="lg"
            fullWidth
            disabled={isReady || busy}
            onClick={handleReady}
          >
            <Check aria-hidden="true" />
            {isReady ? 'أنت جاهز' : 'جاهز'}
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={handleLeave} disabled={busy}>
          <DoorOpen aria-hidden="true" />
          مغادرة الغرفة
        </Button>
      </div>
    </div>
  );
}

function PlayerList({
  players,
  hostId,
  readyIds,
  socketId,
}: {
  players: Player[];
  hostId: string;
  readyIds: string[];
  socketId: string;
}) {
  return (
    <div className="waiting-room__player-list">
      <div className="waiting-room__player-list-title">
        <UsersRound aria-hidden="true" />
        <strong>{formatNumber(players.length)} لاعبين في الغرفة</strong>
      </div>

      {players.length === 0 ? (
        <div className="waiting-room__empty">
          <LoaderCircle className="spin" aria-hidden="true" />
          <span className="muted">بانتظار أول لاعب…</span>
        </div>
      ) : (
        <ul className="waiting-room__players">
          {players.map((player) => (
            <li
              key={player.id}
              className="waiting-room__player"
              data-current={player.id === socketId || undefined}
              data-ready={readyIds.includes(player.id) || undefined}
            >
              <span className="waiting-room__player-name">
                {player.id === hostId && (
                  <Crown
                    aria-label="المضيف"
                    className="waiting-room__crown"
                  />
                )}
                {player.name}
                {player.id === socketId && (
                  <small className="waiting-room__you"> (أنت)</small>
                )}
              </span>
              {readyIds.includes(player.id) ? (
                <span className="waiting-room__ready-badge" aria-label="جاهز">
                  <Check aria-hidden="true" />
                  جاهز
                </span>
              ) : (
                <span className="waiting-room__waiting-badge" aria-hidden="true">
                  <LoaderCircle className="spin" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
