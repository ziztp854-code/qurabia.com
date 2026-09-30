import type {
  AllianceEventStamp,
  AllianceEventTheme,
  AllianceEventView,
  KingdomsWorld,
} from './types';

export const ALLIANCE_EVENT_DURATION = 7 * 86400000;
export const ALLIANCE_EVENT_TARGET = 30;
export const ALLIANCE_EVENT_MEMBER_CAP = 20;
const themes: { theme: AllianceEventTheme; title: string; description: string }[] = [
  {
    theme: 'build',
    title: 'نهضة التحالف',
    description: 'أكملوا تطوير المباني؛ كل بناء مكتمل يمنح ٥ نقاط.',
  },
  {
    theme: 'train',
    title: 'راية التحالف',
    description: 'أكملوا تدريب القوات؛ كل وحدة مدرّبة تمنح نقطة.',
  },
  {
    theme: 'trade',
    title: 'طرق التجارة',
    description: 'أتموا تبادلات مع ممالك مختلفة؛ كل شريك جديد يمنح ٥ نقاط عند تبادل ١٠٠ مورد على الأقل في كل اتجاه.',
  },
];
export function allianceEventPeriod(w: KingdomsWorld, at: number) {
  if (w.season.status !== 'active' || at < w.season.startsAt || at >= w.season.endsAt) return null;
  const week = Math.floor((at - w.season.startsAt) / ALLIANCE_EVENT_DURATION);
  const startsAt = w.season.startsAt + week * ALLIANCE_EVENT_DURATION;
  return {
    ...themes[week % themes.length],
    week,
    startsAt,
    endsAt: Math.min(startsAt + ALLIANCE_EVENT_DURATION, w.season.endsAt),
    eventKey: `s${w.season.number}-w${week}`,
  };
}
export function projectAllianceEvent(
  w: KingdomsWorld,
  actor: string,
  at: number,
): AllianceEventView | null {
  const period = allianceEventPeriod(w, at);
  if (!period) return null;
  const player = w.players[actor];
  const alliance = player?.allianceId ? w.alliances[player.allianceId] : undefined;
  const allianceId = alliance?.members[actor] ? alliance.id : undefined;
  const record = player?.allianceEvent?.eventKey === period.eventKey ? player.allianceEvent : undefined;
  const lockedToOtherAlliance = Boolean(record && record.allianceId !== allianceId);
  // Earned contributions stay with their original alliance after membership changes.
  const contributors = allianceId
    ? Object.values(w.players)
        .filter((p) =>
          p.allianceEvent?.eventKey === period.eventKey &&
          p.allianceEvent.allianceId === allianceId &&
          p.allianceEvent.points > 0,
        )
        .map((p) => ({ id: p.id, name: p.name, points: p.allianceEvent!.points }))
        .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
    : [];
  const points = contributors.reduce((sum, p) => sum + p.points, 0);
  const ownPoints = record && !lockedToOtherAlliance ? record.points : 0;
  const claimed = Boolean(record?.claimed);
  return {
    ...period,
    allianceId,
    target: ALLIANCE_EVENT_TARGET,
    memberCap: ALLIANCE_EVENT_MEMBER_CAP,
    points,
    ownPoints,
    claimed,
    lockedToOtherAlliance,
    canClaim: Boolean(
      allianceId && !lockedToOtherAlliance && ownPoints > 0 &&
      points >= ALLIANCE_EVENT_TARGET && !claimed,
    ),
    reward: { ...w.config.questReward },
    contributors,
  };
}
export function stampAllianceEvent(w: KingdomsWorld, actor: string, at: number) {
  const period = allianceEventPeriod(w, at);
  const player = w.players[actor];
  const allianceId = player?.allianceId;
  return period && allianceId && w.alliances[allianceId]?.members[actor]
    ? { eventKey: period.eventKey, allianceId }
    : undefined;
}
/** Mutates only the engine's freshly cloned draft; never a caller-owned world. */
export function creditAllianceEvent(
  w: KingdomsWorld,
  actor: string,
  theme: AllianceEventTheme,
  points: number,
  at: number,
  stamp?: AllianceEventStamp,
  partner?: string,
) {
  const period = allianceEventPeriod(w, at);
  const membership = stampAllianceEvent(w, actor, at);
  if (!period || period.theme !== theme || !membership || points <= 0) return;
  if (stamp && (
    stamp.eventKey !== period.eventKey || stamp.allianceId !== membership.allianceId
  )) return;
  const player = w.players[actor];
  const existing = player.allianceEvent?.eventKey === period.eventKey ? player.allianceEvent : undefined;
  if (existing && existing.allianceId !== membership.allianceId) return;
  const record = existing ?? { ...membership, points: 0, claimed: false, tradedWith: [] };
  if (record.points >= ALLIANCE_EVENT_MEMBER_CAP || (
    partner && record.tradedWith.includes(partner)
  )) return;
  player.allianceEvent = {
    ...record,
    points: Math.min(ALLIANCE_EVENT_MEMBER_CAP, record.points + points),
    tradedWith: partner ? [...record.tradedWith, partner].slice(0, 4) : record.tradedWith,
  };
}
