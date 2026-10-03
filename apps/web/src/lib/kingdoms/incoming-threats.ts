import type { IncomingMission, IncomingMovementView, Village } from './types';

/** MISSING_ASSET — RALLY / MILITARY ALERT: presentation uses the existing Lucide icon set. */

export const incomingCriticalMs = 5 * 60 * 1000;
export const threatSeverityRank = {
  CRITICAL: 0,
  DANGER: 1,
  WARNING: 2,
  INFO: 3,
} as const;
export type ThreatSeverity = keyof typeof threatSeverityRank;
export type ThreatKind = 'hostile' | 'intelligence' | 'friendly';

export type IncomingThreat = IncomingMovementView & {
  severity: ThreatSeverity;
  kind: ThreatKind;
};

export type VillageThreatSummary = {
  villageId: string;
  name: string;
  hostile: number;
  scouts: number;
  reinforcements: number;
  soonestHostile?: IncomingThreat;
  safe: boolean;
};

const missionKind: Record<IncomingMission, ThreatKind> = {
  attack: 'hostile',
  raid: 'hostile',
  scout: 'intelligence',
  reinforce: 'friendly',
};

export function incomingKind(mission: IncomingMission): ThreatKind {
  return missionKind[mission];
}

export function incomingSeverity(
  mission: IncomingMission,
  arrivesAt: number,
  serverNow: number,
): ThreatSeverity {
  if (mission === 'scout') return 'WARNING';
  if (mission === 'reinforce') return 'INFO';
  const remaining = arrivesAt - serverNow;
  return remaining > 0 && remaining <= incomingCriticalMs ? 'CRITICAL' : 'DANGER';
}

export function presentIncomingThreats(
  incoming: readonly IncomingMovementView[],
  serverNow: number,
): IncomingThreat[] {
  return incoming
    .map((row) => ({
      id: row.id,
      mission: row.mission,
      targetVillageId: row.targetVillageId,
      arrivesAt: row.arrivesAt,
      ...(row.source ? { source: row.source } : {}),
      severity: incomingSeverity(row.mission, row.arrivesAt, serverNow),
      kind: incomingKind(row.mission),
    }))
    .sort((left, right) => {
      const rank = threatSeverityRank[left.severity] - threatSeverityRank[right.severity];
      return rank || left.arrivesAt - right.arrivesAt || left.id.localeCompare(right.id, 'en');
    });
}

export function hostileThreats(threats: readonly IncomingThreat[]) {
  return threats.filter((threat) => threat.kind === 'hostile');
}

export function villageIncoming(threats: readonly IncomingThreat[], villageId: string) {
  return threats.filter((threat) => threat.targetVillageId === villageId);
}

export function summarizeVillageThreats(
  threats: readonly IncomingThreat[],
  villages: readonly Pick<Village, 'id' | 'name'>[],
): VillageThreatSummary[] {
  return villages.map((village) => {
    const rows = villageIncoming(threats, village.id);
    const hostile = rows.filter((row) => row.kind === 'hostile');
    return {
      villageId: village.id,
      name: village.name,
      hostile: hostile.length,
      scouts: rows.filter((row) => row.kind === 'intelligence').length,
      reinforcements: rows.filter((row) => row.kind === 'friendly').length,
      soonestHostile: hostile[0],
      safe: rows.length === 0,
    };
  });
}

export function remainingMs(arrivesAt: number, now: number) {
  return Math.max(0, arrivesAt - now);
}

export function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export const incomingMissionLabels: Record<IncomingMission, string> = {
  attack: 'هجوم قادم',
  raid: 'غارة قادمة',
  scout: 'استطلاع قادم',
  reinforce: 'تعزيزات قادمة',
};

export const threatSeverityLabels: Record<ThreatSeverity, string> = {
  CRITICAL: 'وشيك',
  DANGER: 'خطر',
  WARNING: 'تحذير',
  INFO: 'معلومة',
};
