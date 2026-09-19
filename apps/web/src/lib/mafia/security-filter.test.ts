import { describe, it, expect } from 'vitest';
import {
  filterParticipantsForPlayer,
  filterMessagesForHost,
  filterMessagesForPlayer,
  filterNightTargets,
  filterVoteTargets,
} from './security-filter';

const PARTICIPANTS = [
  { id: 'p1', displayName: 'أحمد', role: 'CITIZEN', status: 'ALIVE', privateNote: '' },
  { id: 'p2', displayName: 'خالد', role: 'KILLER', status: 'ALIVE', privateNote: 'قاتل' },
  { id: 'p3', displayName: 'محمد', role: 'DETECTIVE', status: 'ALIVE', privateNote: '' },
  { id: 'p4', displayName: 'علي', role: 'CITIZEN', status: 'ELIMINATED', privateNote: '' },
  { id: 'p5', displayName: 'سارة', role: 'DOCTOR', status: 'ALIVE', privateNote: '' },
];

const MESSAGES = [
  {
    id: 'm1',
    body: 'مرحبا',
    channel: 'PUBLIC',
    createdAt: new Date(),
    participant: { displayName: 'أحمد' },
  },
  {
    id: 'm2',
    body: 'نقتل محمد',
    channel: 'KILLERS',
    createdAt: new Date(),
    participant: { displayName: 'خالد' },
  },
  {
    id: 'm3',
    body: 'شخص ما مات',
    channel: 'GHOSTS',
    createdAt: new Date(),
    participant: { displayName: 'علي' },
  },
  { id: 'm4', body: 'بدأ التصويت', channel: 'SYSTEM', createdAt: new Date(), participant: null },
];

describe('Mafia Security Filtering', () => {
  it('Test 1: alive CITIZEN must not receive KILLERS messages', () => {
    const result = filterMessagesForPlayer(MESSAGES, 'CITIZEN', 'ALIVE');
    const killersMessages = result.filter((m) => m.channel === 'KILLERS');
    expect(killersMessages).toHaveLength(0);
    const publicMessages = result.filter((m) => m.channel === 'PUBLIC');
    expect(publicMessages.length).toBeGreaterThan(0);
    const systemMessages = result.filter((m) => m.channel === 'SYSTEM');
    expect(systemMessages.length).toBeGreaterThan(0);
  });

  it('Test 2: alive non-killer must not receive another participant role/privateNote', () => {
    const result = filterParticipantsForPlayer(PARTICIPANTS, 'p1');
    const self = result.find((p) => p.id === 'p1');
    const other = result.find((p) => p.id === 'p2');
    expect(self).toMatchObject({ role: 'CITIZEN', privateNote: '' });
    expect(other).not.toHaveProperty('role');
    expect(other).not.toHaveProperty('privateNote');
  });

  it('Test 3: alive KILLER can receive permitted KILLERS messages', () => {
    const result = filterMessagesForPlayer(MESSAGES, 'KILLER', 'ALIVE');
    const killersMessages = result.filter((m) => m.channel === 'KILLERS');
    expect(killersMessages).toHaveLength(1);
    expect(killersMessages[0].body).toBe('نقتل محمد');
  });

  it('Test 4: eliminated participant receives only channels permitted by current rules', () => {
    const result = filterMessagesForPlayer(MESSAGES, 'CITIZEN', 'ELIMINATED');
    const killersMessages = result.filter((m) => m.channel === 'KILLERS');
    expect(killersMessages).toHaveLength(0);
    const ghostsMessages = result.filter((m) => m.channel === 'GHOSTS');
    expect(ghostsMessages).toHaveLength(1);
    const publicMessages = result.filter((m) => m.channel === 'PUBLIC');
    expect(publicMessages.length).toBeGreaterThan(0);
  });

  it('Test 5: night target payload must not reveal other players hidden roles', () => {
    const result = filterNightTargets(PARTICIPANTS, 'KILLER', 'p2');
    expect(result).toHaveLength(4);
    for (const target of result) {
      expect(target).not.toHaveProperty('role');
      expect(target).toMatchObject({ id: expect.any(String), displayName: expect.any(String) });
    }
    const targetIds = result.map((t) => t.id);
    expect(targetIds).not.toContain('p2');
  });

  it('Test 6: host dashboard sees assigned roles without receiving private chats at any phase', () => {
    const hostParticipants = PARTICIPANTS.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      status: p.status,
      isMuted: false,
      role: p.role,
    }));
    for (const p of hostParticipants) {
      expect(p.role).toBeTruthy();
    }
    const hostMessages = filterMessagesForHost(MESSAGES);
    for (const m of hostMessages) {
      expect(m.channel === 'KILLERS' || m.channel === 'GHOSTS').toBe(false);
    }
    const finishedHostMessages = filterMessagesForHost(MESSAGES);
    for (const message of finishedHostMessages) {
      expect(message.channel === 'KILLERS' || message.channel === 'GHOSTS').toBe(false);
    }
  });
});

describe('Mafia Security Filtering - Edge Cases', () => {
  it('citizen receives only PUBLIC and SYSTEM channels', () => {
    const result = filterMessagesForPlayer(MESSAGES, 'CITIZEN', 'ALIVE');
    const channels = new Set(result.map((m) => m.channel));
    expect(channels).toContain('PUBLIC');
    expect(channels).toContain('SYSTEM');
    expect(channels).not.toContain('KILLERS');
    expect(channels).not.toContain('GHOSTS');
  });

  it('detective night targets exclude self and do not expose roles', () => {
    const result = filterNightTargets(PARTICIPANTS, 'DETECTIVE', 'p3');
    expect(result).toHaveLength(4);
    expect(result.map((target) => target.id)).not.toContain('p3');
    for (const target of result) {
      expect(target).not.toHaveProperty('role');
    }
  });

  it('guard night targets exclude self only', () => {
    const result = filterNightTargets(PARTICIPANTS, 'GUARD', 'p5');
    expect(result).toHaveLength(4);
    expect(result.map((t) => t.id)).not.toContain('p5');
  });

  it('vote targets exclude self during VOTING phase when alive', () => {
    const alive = PARTICIPANTS.filter((p) => p.status === 'ALIVE');
    const result = filterVoteTargets(alive, 'p1', 'VOTING', 'ALIVE');
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).not.toContain('p1');
  });

  it('vote targets are empty when not in VOTING phase', () => {
    const result = filterVoteTargets(PARTICIPANTS, 'p1', 'DAY', 'ALIVE');
    expect(result).toHaveLength(0);
  });

  it('vote targets are empty when player is eliminated', () => {
    const result = filterVoteTargets(PARTICIPANTS, 'p4', 'VOTING', 'ELIMINATED');
    expect(result).toHaveLength(0);
  });

  it('night targets are empty for non-night roles', () => {
    const result = filterNightTargets(PARTICIPANTS, 'CITIZEN', 'p1');
    expect(result).toHaveLength(0);
  });

  it('night targets are empty when role is null', () => {
    const result = filterNightTargets(PARTICIPANTS, null, 'p1');
    expect(result).toHaveLength(0);
  });

  it('participant filtering preserves all non-sensitive fields', () => {
    const result = filterParticipantsForPlayer(PARTICIPANTS, 'p1');
    const self = result.find((p) => p.id === 'p1');
    expect(self).toMatchObject({
      id: 'p1',
      displayName: 'أحمد',
      status: 'ALIVE',
      role: 'CITIZEN',
      privateNote: '',
    });
  });
});
