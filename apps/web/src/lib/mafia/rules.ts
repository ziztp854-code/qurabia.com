export type MafiaRoleName = 'KILLER' | 'DETECTIVE' | 'DOCTOR' | 'GUARD' | 'WITNESS' | 'CITIZEN';

export type MafiaGameModeId = 'CLASSIC' | 'SPEED' | 'BLIND' | 'ASSASSIN' | 'CHAOS';

export type MafiaEndingStyle = 'DRAMA' | 'TRAGEDY' | 'HOPE' | 'IRONY' | 'MYSTERY';

export type MafiaCharacterArchetype =
  | 'SCHOLAR'
  | 'MERCHANT'
  | 'FARMER'
  | 'NOBLE'
  | 'ARTISAN'
  | 'SERVANT'
  | 'OFFICER'
  | 'TRAVELER';

export const mafiaRoleLabels: Record<MafiaRoleName, string> = {
  KILLER: 'القاتل',
  DETECTIVE: 'المحقق',
  DOCTOR: 'الطبيب',
  GUARD: 'الحارس',
  WITNESS: 'الشاهد',
  CITIZEN: 'مواطن',
};

export const mafiaPhaseLabels = {
  LOBBY: 'غرفة الانتظار',
  NIGHT: 'الليل',
  DAY: 'النقاش النهاري',
  VOTING: 'التصويت',
  FINISHED: 'انتهت اللعبة',
} as const;

export function buildMafiaRoles(playerCount: number, requestedKillerCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 5) {
    throw new RangeError('تحتاج اللعبة إلى 5 لاعبين على الأقل.');
  }

  const maxKillers = Math.max(1, Math.floor((playerCount - 2) / 3));
  const killerCount = Math.min(Math.max(1, requestedKillerCount), maxKillers);
  const roles: MafiaRoleName[] = [
    ...Array.from({ length: killerCount }, () => 'KILLER' as const),
    'DETECTIVE',
    'DOCTOR',
  ];

  if (playerCount >= 7) roles.push('GUARD');
  if (playerCount >= 8) roles.push('WITNESS');
  while (roles.length < playerCount) roles.push('CITIZEN');
  return roles;
}

export function shuffled<T>(values: readonly T[], random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function determineMafiaWinner(roles: MafiaRoleName[]) {
  const killers = roles.filter((role) => role === 'KILLER').length;
  const citizens = roles.length - killers;
  if (killers === 0) return 'CITIZENS' as const;
  if (killers >= citizens) return 'KILLERS' as const;
  return null;
}

export function resolveMafiaChatChannel({
  gameStatus,
  role,
  playerStatus,
}: {
  gameStatus: 'LOBBY' | 'NIGHT' | 'DAY' | 'VOTING' | 'FINISHED';
  role: MafiaRoleName | null;
  playerStatus: 'ALIVE' | 'ELIMINATED';
}) {
  if (playerStatus === 'ELIMINATED') return 'GHOSTS' as const;
  if (gameStatus === 'FINISHED') return 'PUBLIC' as const;
  if (gameStatus === 'NIGHT' && role === 'KILLER') return 'KILLERS' as const;
  if (gameStatus === 'LOBBY' || gameStatus === 'DAY' || gameStatus === 'VOTING') {
    return 'PUBLIC' as const;
  }
  return null;
}
