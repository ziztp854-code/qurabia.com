import { describe, expect, it } from 'vitest';
import { buildInvestigationDiscussionHint, getInvestigatedTargetIds } from './investigation';

const investigations = [
  {
    id: 'investigation-2',
    round: 2,
    targetId: 'player-2',
    targetName: 'سالم',
    resultIsKiller: true,
    createdAt: '2026-08-10T20:00:00.000Z',
  },
  {
    id: 'investigation-1',
    round: 1,
    targetId: 'player-1',
    targetName: 'ناصر',
    resultIsKiller: false,
    createdAt: '2026-08-10T19:00:00.000Z',
  },
];

describe('investigation helpers', () => {
  it('يعيد معرّفات اللاعبين الذين سبق التحقيق معهم بلا تكرار', () => {
    expect(getInvestigatedTargetIds([...investigations, investigations[0]])).toEqual([
      'player-2',
      'player-1',
    ]);
  });

  it('يصوغ تلميحًا قابلًا للمراجعة من دون كشف دور المحقق', () => {
    const hint = buildInvestigationDiscussionHint(investigations[0]);
    expect(hint).toContain('سالم');
    expect(hint).not.toContain('المحقق');
    expect(hint).not.toContain('تحقيق');
    expect(hint).not.toContain('القاتل');
  });
});
