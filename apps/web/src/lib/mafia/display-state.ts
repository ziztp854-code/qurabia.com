import type { MafiaDisplayState, MafiaDisplayStatePayload } from '@tahaddi/contracts';

type MafiaDisplayGameInput = {
  id: string;
  roomCode: string;
  status: MafiaDisplayState['phase'];
  currentRound: number;
  phaseEndsAt: Date | string | null;
  winner: MafiaDisplayState['winner'];
  chatEnabled: boolean;
  updatedAt: Date | string;
  participants: Array<{
    id: string;
    displayName: string;
    status: MafiaDisplayState['players'][number]['status'];
  }>;
};

const phaseSummaries: Record<MafiaDisplayState['phase'], string> = {
  LOBBY: 'الغرفة تنتظر اكتمال اللاعبين قبل توزيع الأدوار.',
  NIGHT: 'مرحلة الليل جارية. الشاشة تعرض الحالة العامة فقط.',
  DAY: 'مرحلة النقاش مفتوحة أمام اللاعبين الأحياء.',
  VOTING: 'التصويت جارٍ لاختيار المشتبه به.',
  FINISHED: 'انتهت الجولة وتم إعلان النتيجة.',
};

export function buildMafiaDisplayState(
  game: MafiaDisplayGameInput,
  serverAt = new Date(),
): MafiaDisplayStatePayload {
  const players = game.participants.map(({ id, displayName, status }) => ({ id, displayName, status }));
  const aliveCount = players.filter((player) => player.status === 'ALIVE').length;

  return {
    roomCode: game.roomCode,
    mode: 'mafia',
    stateVersion: new Date(game.updatedAt).getTime(),
    serverAt: serverAt.toISOString(),
    state: {
      title: 'القاتل',
      gameId: game.id,
      roomCode: game.roomCode,
      phase: game.status,
      round: game.currentRound,
      phaseEndsAt: game.phaseEndsAt ? new Date(game.phaseEndsAt).toISOString() : null,
      winner: game.winner,
      chatEnabled: game.chatEnabled,
      participantCount: players.length,
      aliveCount,
      eliminatedCount: players.length - aliveCount,
      players,
      publicSummary: phaseSummaries[game.status],
    },
  };
}

