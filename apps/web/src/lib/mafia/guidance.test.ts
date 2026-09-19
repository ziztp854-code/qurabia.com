import { describe, expect, it } from 'vitest';
import { getMafiaMission, mafiaPhaseGuides, mafiaRoleGuides } from './guidance';
import type { MafiaRoleName } from './rules';

const roles: MafiaRoleName[] = ['KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS', 'CITIZEN'];

describe('mafia guidance', () => {
  it('defines an objective and an actionable mission for every role and active phase', () => {
    for (const role of roles) {
      expect(mafiaRoleGuides[role].objective.length).toBeGreaterThan(20);
      for (const phase of ['NIGHT', 'DAY', 'VOTING'] as const) {
        const mission = getMafiaMission(role, phase);
        expect(mission.title).not.toBe('');
        expect(mission.summary).not.toBe('');
        expect(mission.steps).toHaveLength(3);
      }
    }
  });

  it('gives eliminated players a non-interactive mission', () => {
    expect(getMafiaMission('KILLER', 'NIGHT', true).title).toContain('المستبعدين');
  });

  it('describes the automatic destination after every phase', () => {
    expect(mafiaPhaseGuides.NIGHT.next).toContain('النهار');
    expect(mafiaPhaseGuides.DAY.next).toBe('التصويت');
    expect(mafiaPhaseGuides.VOTING.next).toContain('الليل');
  });
});
