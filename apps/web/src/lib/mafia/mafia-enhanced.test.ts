import { describe, it, expect } from 'vitest';
import {
  buildNarrative,
  pickArchetype,
  pickEndingStyle,
  renderEliminationText,
  buildNarrativeEvent,
  ELIMINATION_NARRATIVES,
  INTRO_NARRATIVES,
  VICTORY_NARRATIVES,
  CHARACTER_ARCHETYPES,
  ROLE_FLAVOR,
  MAFIA_EPILOGUE_BADGES,
  buildTakeaways,
  pickEpilogueBadges,
  type MafiaEndingStyle,
} from './narrative';
import {
  MAFIA_GAME_MODES,
  MAFIA_SIDE_QUESTS,
  MAFIA_INVESTIGATION_TOOLS,
  pickQuestsForPlayer,
  applyModeMultipliers,
  computeSuspicionScores,
  type MafiaGameModeId,
} from './game-modes';
import {
  determineMafiaWinner,
  buildMafiaRoles,
  resolveMafiaChatChannel,
  mafiaRoleLabels,
  type MafiaRoleName,
} from './rules';

describe('Mafia Narrative Engine', () => {
  it('pickArchetype returns stable archetype for same seed', () => {
    const a = pickArchetype(42);
    const b = pickArchetype(42);
    expect(a).toBe(b);
    expect(CHARACTER_ARCHETYPES).toHaveProperty(a);
  });

  it('buildNarrative returns full persona with role, backstory, 6 quotes, flavor', () => {
    const persona = buildNarrative('يوسف', 'DETECTIVE', 17);
    expect(persona).toMatchObject({
      displayName: 'يوسف',
      role: 'DETECTIVE',
    });
    expect(persona.title.length).toBeGreaterThan(5);
    expect(persona.backstory.length).toBeGreaterThan(40);
    expect(Object.keys(persona.quotes)).toEqual([
      'intro',
      'accused',
      'defending',
      'dying',
      'victory',
      'defeat',
    ]);
    for (const q of Object.values(persona.quotes)) {
      expect(q.length).toBeGreaterThan(12);
    }
    expect(persona.roleFlavor.length).toBeGreaterThan(20);
    expect(ROLE_FLAVOR['DETECTIVE'][persona.archetype]).toBe(persona.roleFlavor);
  });

  it('all 8 archetypes exist and have all 6 roles flavor texts', () => {
    const archetypes = Object.keys(CHARACTER_ARCHETYPES) as (keyof typeof CHARACTER_ARCHETYPES)[];
    expect(archetypes).toHaveLength(8);
    const roles: MafiaRoleName[] = ['KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS', 'CITIZEN'];
    for (const role of roles) {
      for (const arch of archetypes) {
        expect(ROLE_FLAVOR[role]?.[arch]).toBeTruthy();
      }
    }
  });

  it('pickEndingStyle returns a valid ending style from the extended set (8 moods)', () => {
    const styles: MafiaEndingStyle[] = [
      'DRAMA',
      'TRAGEDY',
      'HOPE',
      'IRONY',
      'MYSTERY',
      'COMEDY',
      'EPIC',
      'FOLKLORE',
    ];
    for (let round = 1; round <= 8; round++) {
      for (let k = 1; k <= 3; k++) {
        for (let r = 2; r <= 10; r++) {
          const style = pickEndingStyle(round, k, r);
          expect(styles).toContain(style);
        }
      }
    }
    const seen = new Set<MafiaEndingStyle>();
    for (let r = 1; r < 50 && seen.size < 8; r++) seen.add(pickEndingStyle(r, 1, 5));
    expect(seen.size).toBe(8);
  });

  it('renderEliminationText returns non-empty distinct variants (extended count)', () => {
    const nightSet = new Set<string>();
    const voteSet = new Set<string>();
    for (let i = 0; i < 60; i++) {
      nightSet.add(renderEliminationText('NIGHT', 'أحمد', i));
      voteSet.add(renderEliminationText('VOTING', 'أحمد', i));
    }
    expect(nightSet.size).toBe(ELIMINATION_NARRATIVES.NIGHT.length);
    expect(voteSet.size).toBe(ELIMINATION_NARRATIVES.VOTING.length);
    expect(ELIMINATION_NARRATIVES.NIGHT.length).toBeGreaterThanOrEqual(7);
    expect(ELIMINATION_NARRATIVES.VOTING.length).toBeGreaterThanOrEqual(7);
    for (const n of nightSet) {
      expect(n).toContain('أحمد');
      expect(n.length).toBeGreaterThan(20);
    }
  });

  it('has intro + victory narratives for all extended teams/styles (9 intros, 8 endings × 2 teams)', () => {
    expect(INTRO_NARRATIVES.length).toBeGreaterThanOrEqual(9);
    for (const i of INTRO_NARRATIVES) expect(i.length).toBeGreaterThan(40);
    expect(Object.keys(VICTORY_NARRATIVES)).toEqual(['CITIZENS', 'KILLERS']);
    const endingStyles: MafiaEndingStyle[] = [
      'DRAMA',
      'TRAGEDY',
      'HOPE',
      'IRONY',
      'MYSTERY',
      'COMEDY',
      'EPIC',
      'FOLKLORE',
    ];
    for (const team of ['CITIZENS', 'KILLERS'] as const) {
      for (const s of endingStyles) {
        expect(VICTORY_NARRATIVES[team][s]?.length).toBeGreaterThan(40);
      }
    }
  });

  it('MAFIA_EPILOGUE_BADGES: 5 badges with glyphs, labels, descriptions', () => {
    expect(Object.keys(MAFIA_EPILOGUE_BADGES)).toHaveLength(5);
    for (const b of Object.values(MAFIA_EPILOGUE_BADGES)) {
      expect(b.glyph.length).toBeGreaterThanOrEqual(2);
      expect(b.label.length).toBeGreaterThan(3);
      expect(b.description.length).toBeGreaterThan(10);
    }
  });

  it('buildTakeaways surfaces elimination rate, silence, loudness, accusation fluidity, top guesser', () => {
    const counts = new Map<string, number>();
    counts.set('حسان', 2);
    counts.set('مريم', 18);
    counts.set('سامي', 40);
    const votes = [
      { voterId: 'a', targetId: 'b', round: 1 },
      { voterId: 'a', targetId: 'c', round: 2 },
      { voterId: 'a', targetId: 'd', round: 3 },
      { voterId: 'a', targetId: 'e', round: 4 },
    ];
    const guesses = new Map<string, number>();
    guesses.set('سامي', 4);
    const t = buildTakeaways({
      round: 4,
      totalPlayers: 10,
      eliminatedIds: ['b', 'c', 'd'],
      publicMessageCounts: counts,
      votedTargets: votes,
      correctGuesses: guesses,
    });
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.map((x) => x.title).some((x) => x.includes('نسبة'))).toBe(true);
    expect(t.map((x) => x.title).some((x) => x.includes('صامت'))).toBe(true);
    expect(t.map((x) => x.title).some((x) => x.includes('دولاب'))).toBe(true);
    expect(t.map((x) => x.title).some((x) => x.includes('عراف'))).toBe(true);
    expect(t.length).toBeLessThanOrEqual(5);
  });

  it('pickEpilogueBadges awards SILENT_THINKER / ACCUSATION / LUCKY / ORACLE / DETECTIVE badges', () => {
    const silent = pickEpilogueBadges({
      takeawayIds: [],
      wasAliveAtEnd: false,
      publicMessages: 1,
      correctGuesses: 0,
      investigateCount: 0,
    });
    expect(silent.map((b) => b.id)).toContain('SILENT_THINKER');

    const fluid = pickEpilogueBadges({
      takeawayIds: ['fluid-xxx'],
      wasAliveAtEnd: false,
      publicMessages: 20,
      correctGuesses: 0,
      investigateCount: 0,
    });
    expect(fluid.map((b) => b.id)).toContain('ACCUSATION_MACHINE');

    const lucky = pickEpilogueBadges({
      takeawayIds: [],
      wasAliveAtEnd: true,
      publicMessages: 20,
      correctGuesses: 0,
      investigateCount: 0,
    });
    expect(lucky.map((b) => b.id)).toContain('LUCKY_SURVIVOR');

    const oracle = pickEpilogueBadges({
      takeawayIds: [],
      wasAliveAtEnd: false,
      publicMessages: 20,
      correctGuesses: 3,
      investigateCount: 0,
    });
    expect(oracle.map((b) => b.id)).toContain('FORTUNE_TELLER');

    const detective = pickEpilogueBadges({
      takeawayIds: [],
      role: 'DETECTIVE',
      wasAliveAtEnd: false,
      publicMessages: 20,
      correctGuesses: 0,
      investigateCount: 3,
    });
    expect(detective.map((b) => b.id)).toContain('PERFECT_DETECTIVE');
  });

  it('buildNarrativeEvent returns narrative ids with the right suffixes', () => {
    const start = buildNarrativeEvent('start', null, 2, 6, 1);
    expect(start.type).toBe('narrative');
    expect(start.id.startsWith('narrative-start-')).toBe(true);
    expect(start.body.length).toBeGreaterThan(30);
    const endC = buildNarrativeEvent('end', 'CITIZENS', 3, 4, 2);
    expect(endC.id.includes('CITIZENS')).toBe(true);
    const endK = buildNarrativeEvent('end', 'KILLERS', 5, 3, 2);
    expect(endK.id.includes('KILLERS')).toBe(true);
  });
});

describe('Mafia Game Modes & Quests', () => {
  it('5 game modes exist and have correct type/id pairs', () => {
    const ids = Object.keys(MAFIA_GAME_MODES) as MafiaGameModeId[];
    expect(ids).toEqual(['CLASSIC', 'SPEED', 'BLIND', 'ASSASSIN', 'CHAOS']);
    for (const id of ids) {
      expect(MAFIA_GAME_MODES[id].id).toBe(id);
      expect(MAFIA_GAME_MODES[id].label.length).toBeGreaterThan(0);
      expect(MAFIA_GAME_MODES[id].timeMultiplier).toBeGreaterThan(0);
      expect(MAFIA_GAME_MODES[id].features.length).toBeGreaterThan(1);
    }
  });

  it('applyModeMultipliers respects mode thresholds', () => {
    const base = { nightSeconds: 45, daySeconds: 90, votingSeconds: 45, killerCount: 2, maxPlayers: 10 };
    const speed = applyModeMultipliers('SPEED', base);
    expect(speed.nightSeconds).toBe(23);
    expect(speed.daySeconds).toBe(45);
    expect(speed.votingSeconds).toBe(23);
    const classic = applyModeMultipliers('CLASSIC', base);
    expect(classic.nightSeconds).toBe(45);
    expect(classic.killerCount).toBe(2);
    const assassin = applyModeMultipliers('ASSASSIN', base);
    expect(assassin.killerCount).toBe(1);
    const chaos = applyModeMultipliers('CHAOS', base);
    expect(chaos.nightSeconds).toBe(34);
  });

  it('applyModeMultipliers clamps killers to safe lower bound', () => {
    const base = { nightSeconds: 30, daySeconds: 60, votingSeconds: 30, killerCount: 1, maxPlayers: 6 };
    const assassin = applyModeMultipliers('ASSASSIN', base);
    expect(assassin.killerCount).toBeGreaterThanOrEqual(1);
  });

  it('9 side quests exist with difficulties 1/2/3 and valid rewards', () => {
    const quests = Object.values(MAFIA_SIDE_QUESTS);
    expect(quests).toHaveLength(9);
    for (const q of quests) {
      expect([1, 2, 3]).toContain(q.difficulty);
      expect(q.title.length).toBeGreaterThan(2);
      expect(q.description.length).toBeGreaterThan(12);
      expect(q.reward.length).toBeGreaterThan(8);
    }
  });

  it('pickQuestsForPlayer returns quests filtered by role and seed-stable', () => {
    const detective = pickQuestsForPlayer('DETECTIVE', 11, 3);
    expect(detective.length).toBeGreaterThan(0);
    expect(detective.some((q) => q.id === 'GET_INVESTIGATE_3')).toBe(true);
    const citizen = pickQuestsForPlayer('CITIZEN', 5, 2);
    expect(citizen).toHaveLength(2);
    const citizen2 = pickQuestsForPlayer('CITIZEN', 5, 2);
    expect(citizen2.map((q) => q.id)).toEqual(citizen.map((q) => q.id));
  });

  it('5 investigation tools with correct unlock phases', () => {
    const tools = Object.values(MAFIA_INVESTIGATION_TOOLS);
    expect(tools).toHaveLength(5);
    for (const t of tools) {
      expect(['LOBBY', 'DAY', 'VOTING']).toContain(t.unlockPhase);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('computeSuspicionScores computes correct score ranges', () => {
    const participants = [
      { id: 'a', displayName: 'أ', status: 'ALIVE' as const },
      { id: 'b', displayName: 'ب', status: 'ALIVE' as const },
      { id: 'c', displayName: 'ج', status: 'ALIVE' as const },
      { id: 'd', displayName: 'د', status: 'ELIMINATED' as const },
    ];
    const votes = [
      { round: 1, voterId: 'a', targetId: 'b' },
      { round: 2, voterId: 'c', targetId: 'b' },
    ];
    const actions = [{ round: 1, actorId: 'a', targetId: 'c', type: 'INVESTIGATE' as const }];
    const scores = computeSuspicionScores(votes, participants, actions, ['d']);
    expect(scores.get('b')).toBe(57);
    expect(scores.get('a')).toBe(56);
    expect(scores.get('d')).toBeLessThan(40);
    expect([...scores.values()].every((s) => s >= 0 && s <= 100)).toBe(true);
  });
});

describe('Mafia Core Rules', () => {
  it('buildMafiaRoles for N players returns N roles with requested killer count + detectives', () => {
    const maxKillers = (p: number) => Math.max(1, Math.floor((p - 2) / 3));
    const tests = [
      { p: 5, k: 1, guard: 0, witness: 0 },
      { p: 8, k: 2, guard: 1, witness: 1 },
      { p: 10, k: maxKillers(10), guard: 1, witness: 1 },
      { p: 12, k: maxKillers(12), guard: 1, witness: 1 },
    ];
    for (const t of tests) {
      const r = buildMafiaRoles(t.p, t.k);
      expect(r).toHaveLength(t.p);
      const killers = r.filter((x) => x === 'KILLER');
      expect(killers).toHaveLength(t.k);
      expect(r.filter((x) => x === 'DETECTIVE').length).toBe(1);
      expect(r.filter((x) => x === 'DOCTOR').length).toBe(1);
      expect(r.filter((x) => x === 'GUARD').length).toBe(t.guard);
      expect(r.filter((x) => x === 'WITNESS').length).toBe(t.witness);
    }
  });

  it('determineMafiaWinner returns KILLERS when killers outnumber or tie remaining citizens', () => {
    expect(determineMafiaWinner(['KILLER', 'CITIZEN'])).toBe('KILLERS');
    expect(determineMafiaWinner(['KILLER', 'KILLER', 'CITIZEN'])).toBe('KILLERS');
    expect(determineMafiaWinner(['CITIZEN', 'DETECTIVE', 'DOCTOR'])).toBe('CITIZENS');
    expect(determineMafiaWinner(['KILLER', 'CITIZEN', 'CITIZEN'])).toBe(null);
    expect(determineMafiaWinner(['DETECTIVE', 'CITIZEN'])).toBe('CITIZENS');
  });

  it('resolveMafiaChatChannel lets everyone chat in FINISHED and denies ghosts public', () => {
    expect(resolveMafiaChatChannel({ gameStatus: 'FINISHED', role: 'CITIZEN', playerStatus: 'ALIVE' })).toBe(
      'PUBLIC',
    );
    expect(resolveMafiaChatChannel({ gameStatus: 'FINISHED', role: 'KILLER', playerStatus: 'ELIMINATED' })).toBe(
      'GHOSTS',
    );
    expect(resolveMafiaChatChannel({ gameStatus: 'NIGHT', role: 'KILLER', playerStatus: 'ALIVE' })).toBe(
      'KILLERS',
    );
    expect(resolveMafiaChatChannel({ gameStatus: 'NIGHT', role: 'DETECTIVE', playerStatus: 'ALIVE' })).toBe(null);
    expect(resolveMafiaChatChannel({ gameStatus: 'LOBBY', role: 'WITNESS', playerStatus: 'ALIVE' })).toBe(
      'PUBLIC',
    );
    expect(resolveMafiaChatChannel({ gameStatus: 'VOTING', role: 'GUARD', playerStatus: 'ELIMINATED' })).toBe(
      'GHOSTS',
    );
  });

  it('role labels exist for all 6 roles', () => {
    const roles: MafiaRoleName[] = ['KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS', 'CITIZEN'];
    for (const r of roles) expect(mafiaRoleLabels[r].length).toBeGreaterThan(1);
  });
});
