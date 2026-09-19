import { getSharedRedis } from '@/lib/auth/rate-limit';
import { readPresenceCounts } from './presence-store';

export type LiveStats = {
  presentNow: number;
  livePlayers: number;
};

function countPlayers(room: unknown) {
  if (!room || typeof room !== 'object') return 0;
  const value = room as {
    players?: unknown[];
    participants?: unknown[];
    teams?: unknown[];
    seats?: unknown[] | { white?: unknown; black?: unknown };
  };
  if (Array.isArray(value.players)) return value.players.length;
  if (Array.isArray(value.participants)) return value.participants.length;
  if (Array.isArray(value.teams)) return value.teams.length;
  if (Array.isArray(value.seats)) return value.seats.filter(Boolean).length;
  return Number(Boolean(value.seats?.white)) + Number(Boolean(value.seats?.black));
}

async function countRoomPlayers(prefix: string, pins: string[]) {
  const redis = getSharedRedis();
  if (!redis || pins.length === 0) return 0;

  const rooms = await Promise.all(
    pins.map((pin) =>
      redis
        .get<unknown>(`${prefix}${pin}`)
        .catch(() => null),
    ),
  );
  return rooms.reduce<number>((total, room) => total + countPlayers(room), 0);
}

export async function getLiveStats(now = Date.now()): Promise<LiveStats | null> {
  const redis = getSharedRedis();
  if (!redis) return null;

  try {
    const presence = await readPresenceCounts(now);
    const [specialPins, chessPins, balootCodes, ladderPins] = await Promise.all([
      redis.smembers<string[]>('special-game:pins:active').catch((): string[] => []),
      redis.smembers<string[]>('chess:pins:active').catch((): string[] => []),
      redis.smembers<string[]>('baloot:roomCodes:active').catch((): string[] => []),
      redis.smembers<string[]>('ladder:roomCodes:active').catch((): string[] => []),
    ]);
    const [specialPlayers, chessPlayers, balootPlayers, ladderPlayers] = await Promise.all([
      countRoomPlayers('special-game:', specialPins.map(String).map((pin) => `${pin}:room`)),
      countRoomPlayers('chess:room:', chessPins.map(String)),
      countRoomPlayers('baloot:room:', balootCodes.map(String)),
      countRoomPlayers('ladder:room:', ladderPins.map(String)),
    ]);

    return {
      presentNow: presence.presentNow,
      livePlayers: specialPlayers + chessPlayers + balootPlayers + ladderPlayers,
    };
  } catch {
    return null;
  }
}
