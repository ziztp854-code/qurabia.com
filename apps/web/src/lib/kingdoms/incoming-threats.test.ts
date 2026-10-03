import { describe, expect, it } from 'vitest';
import type { IncomingMovementView } from './types';
import {
  formatCountdown,
  hostileThreats,
  incomingCriticalMs,
  incomingSeverity,
  presentIncomingThreats,
  summarizeVillageThreats,
} from './incoming-threats';

const now = 1_800_000_000_000;
function row(
  id: string,
  mission: IncomingMovementView['mission'],
  arrivesAt: number,
  targetVillageId = 'capital',
): IncomingMovementView {
  return { id, mission, targetVillageId, arrivesAt };
}

describe('incoming threat presentation', () => {
  it('maps missions to severity and promotes a near attack to critical', () => {
    expect(incomingSeverity('attack', now + incomingCriticalMs + 1, now)).toBe('DANGER');
    expect(incomingSeverity('raid', now + incomingCriticalMs + 1, now)).toBe('DANGER');
    expect(incomingSeverity('attack', now + incomingCriticalMs, now)).toBe('CRITICAL');
    expect(incomingSeverity('raid', now + 1_000, now)).toBe('CRITICAL');
    expect(incomingSeverity('scout', now + 1_000, now)).toBe('WARNING');
    expect(incomingSeverity('reinforce', now + 1_000, now)).toBe('INFO');
  });

  it('sorts critical before danger before warning before info, then earliest arrival', () => {
    const presented = presentIncomingThreats(
      [
        row('info', 'reinforce', now + 1_000),
        row('warn', 'scout', now + 2_000),
        row('danger-late', 'raid', now + incomingCriticalMs + 20_000),
        row('danger-soon', 'attack', now + incomingCriticalMs + 10_000),
        row('critical', 'attack', now + 30_000),
      ],
      now,
    );
    expect(presented.map((item) => item.id)).toEqual([
      'critical',
      'danger-soon',
      'danger-late',
      'warn',
      'info',
    ]);
  });

  it('counts only attack and raid as hostile threats', () => {
    const presented = presentIncomingThreats(
      [row('a', 'attack', now + 9_000), row('s', 'scout', now + 8_000), row('r', 'reinforce', now + 7_000)],
      now,
    );
    expect(hostileThreats(presented)).toHaveLength(1);
    expect(hostileThreats(presented)[0]?.mission).toBe('attack');
  });

  it('groups multiple villages including a safe village', () => {
    const presented = presentIncomingThreats(
      [
        row('a1', 'attack', now + incomingCriticalMs + 8_000, 'a'),
        row('a2', 'raid', now + incomingCriticalMs + 9_000, 'a'),
        row('b1', 'scout', now + 12_000, 'b'),
      ],
      now,
    );
    const summary = summarizeVillageThreats(presented, [
      { id: 'a', name: 'العاصمة' },
      { id: 'b', name: 'قرية الحدود' },
      { id: 'c', name: 'قرية الشمال' },
    ]);
    expect(summary.map((item) => ({ id: item.villageId, hostile: item.hostile, scouts: item.scouts, safe: item.safe }))).toEqual([
      { id: 'a', hostile: 2, scouts: 0, safe: false },
      { id: 'b', hostile: 0, scouts: 1, safe: false },
      { id: 'c', hostile: 0, scouts: 0, safe: true },
    ]);
  });

  it('formats countdown without inventing arrival', () => {
    expect(formatCountdown(4 * 60_000 + 32_000)).toBe('04:32');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('copies only contract fields onto presented threats', () => {
    const presented = presentIncomingThreats(
      [
        {
          id: 'm1',
          mission: 'attack',
          targetVillageId: 'v',
          arrivesAt: now + 9_000,
          source: {
            id: 's',
            name: 'معسكر',
            x: 1,
            y: 2,
            kingdomName: 'الظل',
            ownerId: 'bob',
            protectedUntil: 0,
          },
        },
      ],
      now,
    );
    expect(JSON.stringify(presented)).not.toContain('troops');
    expect(JSON.stringify(presented)).not.toContain('commanderId');
    expect(JSON.stringify(presented)).not.toContain('loot');
  });
});
