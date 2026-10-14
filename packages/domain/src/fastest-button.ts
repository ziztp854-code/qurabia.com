/** Authoritative rules. Call only with server/store timestamps and atomic press records. */
export type FastestMode = 'classic' | 'elimination' | 'points';
export type FastestSettings = {
  mode: FastestMode;
  totalRounds: number;
  responseSeconds: number;
  countdownSeconds: number;
};
export type FastestPlayer = {
  id: string;
  name: string;
  score: number;
  eliminated: boolean;
  removed: boolean;
  tokenHash: string;
  connections: Record<string, number>;
};
export type FastestPress = { playerId: string; sequence: number; receivedAt: number };
export type FastestAward = { playerId: string; points: number; rank: number | null };
export type FastestRound = {
  id: string;
  number: number;
  isTiebreak: boolean;
  isFinal: boolean;
  eligibleIds: string[];
  startAt: number;
  endAt: number;
  presses: FastestPress[];
  winnerId: string | null;
  cancelled: boolean;
  closedAt: number | null;
  eliminatedIds: string[];
  awards: FastestAward[];
};
export type FastestRoom = {
  code: string;
  hostId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  settings: FastestSettings;
  phase: 'lobby' | 'countdown' | 'active' | 'results' | 'finished';
  players: FastestPlayer[];
  round: FastestRound | null;
  rounds: FastestRound[];
  regularCompleted: number;
  tiebreakIds: string[];
  championId: string | null;
  notice: string | null;
};
export class FastestRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new FastestRuleError(code, message);
}
export const FASTEST_MAX_PLAYERS = 64;
export const FASTEST_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export function createFastestRoom(
  code: string,
  hostId: string,
  settings: FastestSettings,
  now: number,
): FastestRoom {
  return {
    code,
    hostId,
    settings,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    phase: 'lobby',
    players: [],
    round: null,
    rounds: [],
    regularCompleted: 0,
    tiebreakIds: [],
    championId: null,
    notice: null,
  };
}
export function addFastestPlayer(room: FastestRoom, player: FastestPlayer): FastestRoom {
  if (room.players.filter((p) => !p.removed).length >= FASTEST_MAX_PLAYERS)
    fail('ROOM_FULL', 'الغرفة ممتلئة (64 لاعبًا).');
  if (room.phase !== 'lobby' && !(room.settings.mode === 'classic' && room.phase === 'results'))
    fail('MATCH_STARTED', 'بدأت المنافسة. انتظر إعادة ضبط الغرفة للانضمام.');
  if (
    room.players.some(
      (p) => !p.removed && p.name.toLocaleLowerCase('ar') === player.name.toLocaleLowerCase('ar'),
    )
  )
    fail('NAME_TAKEN', 'هذا الاسم مستخدم. اختر اسمًا آخر.');
  return { ...room, players: [...room.players, player] };
}
export function startFastestRound(room: FastestRoom, id: string, now: number): FastestRoom {
  if (!['lobby', 'results'].includes(room.phase)) fail('INVALID_PHASE', 'لا يمكن بدء جولة الآن.');
  if (room.rounds.length >= 200) fail('ROUND_LIMIT', 'بلغت الغرفة حد الجولات. أعد ضبط المنافسة.');
  const eligibleIds = room.tiebreakIds.length
    ? room.tiebreakIds
    : room.players.filter((p) => !p.eliminated && !p.removed).map((p) => p.id);
  const minimum = room.settings.mode === 'classic' ? 1 : 2;
  if (eligibleIds.length < minimum)
    fail('NOT_ENOUGH_PLAYERS', `يلزم ${minimum === 1 ? 'لاعب واحد' : 'لاعبان'} لبدء المنافسة.`);
  if (room.round && !room.rounds.some((r) => r.id === room.round!.id))
    fail('RESULT_PENDING', 'انتظر تثبيت نتيجة الجولة.');
  const startAt = now + room.settings.countdownSeconds * 1000;
  return {
    ...room,
    phase: 'countdown',
    notice: null,
    round: {
      id,
      number: room.rounds.length + 1,
      isTiebreak: room.tiebreakIds.length > 0,
      isFinal: room.settings.mode === 'elimination' && eligibleIds.length === 2,
      eligibleIds,
      startAt,
      endAt: startAt + room.settings.responseSeconds * 1000,
      presses: [],
      winnerId: null,
      cancelled: false,
      closedAt: null,
      eliminatedIds: [],
      awards: [],
    },
  };
}
export function cancelFastestRound(room: FastestRoom, now: number): FastestRoom {
  if (!room.round || !['countdown', 'active'].includes(room.phase))
    fail('INVALID_PHASE', 'لا توجد جولة نشطة لإيقافها.');
  const round = { ...room.round, cancelled: true, closedAt: now, awards: [], eliminatedIds: [] };
  return {
    ...room,
    phase: 'results',
    round,
    rounds: [...room.rounds, round],
    notice: 'أوقف المضيف الجولة. لا تُحتسب نقاط أو إقصاءات؛ يمكنك إعادة الجولة.',
  };
}
export function finishFastestRound(room: FastestRoom, now: number): FastestRoom {
  const current = room.round;
  if (!current || room.rounds.some((r) => r.id === current.id)) return room;
  const presses = [...current.presses].sort((a, b) => a.sequence - b.sequence);
  const winnerId = presses[0]?.playerId ?? null;
  const round: FastestRound = {
    ...current,
    presses,
    winnerId,
    closedAt: now,
    awards: [],
    eliminatedIds: [],
  };
  let players = room.players;
  let phase: FastestRoom['phase'] = 'results';
  let championId = room.championId;
  let tiebreakIds = room.tiebreakIds;
  let regularCompleted = room.regularCompleted;
  let notice: string | null = null;
  if (current.isTiebreak) {
    if (winnerId) {
      championId = winnerId;
      phase = 'finished';
      tiebreakIds = [];
    } else notice = 'لم يضغط أحد في الجولة الفاصلة. أعد الجولة بين المتعادلين أنفسهم.';
  } else if (room.settings.mode === 'elimination') {
    if (!presses.length) {
      round.cancelled = true;
      notice = 'لم يضغط أحد. تُعاد الجولة دون إقصاء.';
    } else {
      const pressed = new Set(presses.map((p) => p.playerId));
      const missing = current.eligibleIds.filter((id) => !pressed.has(id));
      round.eliminatedIds = missing.length ? missing : [presses[presses.length - 1]!.playerId];
      const eliminated = new Set(round.eliminatedIds);
      players = players.map((p) => (eliminated.has(p.id) ? { ...p, eliminated: true } : p));
      const remaining = players.filter((p) => !p.eliminated && !p.removed);
      if (remaining.length === 1) {
        championId = remaining[0]!.id;
        phase = 'finished';
      }
    }
  } else if (room.settings.mode === 'points') {
    regularCompleted++;
    const scoring = [10, 7, 5];
    round.awards = current.eligibleIds.map((playerId) => {
      const index = presses.findIndex((p) => p.playerId === playerId);
      return {
        playerId,
        rank: index < 0 ? null : index + 1,
        points: index < 0 ? 0 : (scoring[index] ?? 1),
      };
    });
    players = players.map((p) => ({
      ...p,
      score: p.score + (round.awards.find((a) => a.playerId === p.id)?.points ?? 0),
    }));
    if (regularCompleted >= room.settings.totalRounds) {
      const contenders = players.filter((p) => !p.removed);
      const highest = Math.max(...contenders.map((p) => p.score));
      tiebreakIds = contenders.filter((p) => p.score === highest).map((p) => p.id);
      if (tiebreakIds.length === 1) {
        championId = tiebreakIds[0]!;
        phase = 'finished';
        tiebreakIds = [];
      } else
        notice =
          'تعادل الصدارة. الجولة القادمة فاصلة بين المتعادلين فقط، وأول ضغطة صالحة تحسم البطولة.';
    }
  }
  return {
    ...room,
    phase,
    round,
    players,
    championId,
    tiebreakIds,
    regularCompleted,
    notice,
    rounds: [...room.rounds, round],
  };
}
export function tickFastestRoom(room: FastestRoom, now: number): FastestRoom {
  if (!room.round) return room;
  if (room.phase === 'countdown' && now >= room.round.startAt) room = { ...room, phase: 'active' };
  if (
    (room.phase === 'active' && now >= room.round!.endAt) ||
    (room.phase === 'results' && !room.rounds.some((r) => r.id === room.round!.id))
  )
    return finishFastestRound(room, now);
  return room;
}
export function resetFastestRoom(room: FastestRoom): FastestRoom {
  if (['active', 'countdown'].includes(room.phase))
    fail('ROUND_ACTIVE', 'أوقف الجولة قبل إعادة ضبط المنافسة.');
  return {
    ...room,
    phase: 'lobby',
    round: null,
    rounds: [],
    regularCompleted: 0,
    championId: null,
    tiebreakIds: [],
    notice: null,
    players: room.players
      .filter((p) => !p.removed)
      .map((p) => ({ ...p, score: 0, eliminated: false })),
  };
}
