import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PublicIdentity } from '@/lib/community/contracts';
import type { VoiceCommand } from './contracts';
import {
  applyVoiceCommand,
  newVoiceState,
  validateVoiceSignal,
  VOICE_MEMBERSHIP_TTL,
  type VoiceActor,
} from './engine';

const now = 1_800_000_000_000;
const sdp = (direction: string) => `v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=${direction}\r\n`;
function actor(userId: string, accountNumber = 123456789): VoiceActor {
  const identity: PublicIdentity = {
    userId,
    accountNumber,
    name: userId,
    username: null,
    avatarUrl: null,
    badges: [],
    frame: null,
    effect: null,
    primaryBadge: null,
  };
  return { userId, tokenVersion: 0, platformModerator: false, identity };
}
function setup() {
  const state = newVoiceState();
  const room = { ownerId: 'host', status: 'OPEN' };
  const host = actor('host', 1),
    participant = actor('participant');
  const hostClient = randomUUID(),
    client = randomUUID();
  const command = (
    user: VoiceActor,
    clientId: string,
    input: Omit<VoiceCommand, 'clientId'>,
    at = now,
  ) => applyVoiceCommand(state, room, user, { ...input, clientId } as VoiceCommand, at);
  command(host, hostClient, { type: 'join' });
  command(participant, client, { type: 'join' });
  return { state, room, host, participant, hostClient, client, command };
}

describe('authoritative voice room engine', () => {
  it('keeps membership and entrance stable across refresh and reconnect; invalidates the old tab', () => {
    const f = setup();
    const memberId = f.state.members[1].id;
    const entranceId = f.state.entrances[1].id;
    f.command(f.participant, f.client, { type: 'join' }, now + 1000);
    const otherClient = randomUUID();
    f.command(f.participant, otherClient, { type: 'join' }, now + 2000);
    expect(f.state.members[1].id).toBe(memberId);
    expect(f.state.members[1].connectionEpoch).toBe(1);
    expect(f.state.entrances[1].id).toBe(entranceId);
    expect(() => f.command(f.participant, f.client, { type: 'heartbeat' }, now + 3000)).toThrow(
      /انضم/,
    );
  });

  it('expires abandoned memberships without replaying recent entrance effects on an immediate rejoin', () => {
    const f = setup();
    const old = f.state.members[1].id;
    f.command(f.participant, f.client, { type: 'join' }, now + VOICE_MEMBERSHIP_TTL + 1);
    expect(f.state.members).toHaveLength(1);
    expect(f.state.members[0].id).not.toBe(old);
    expect(f.state.entrances).toHaveLength(0);
  });

  it('caps room capacity and permits a returning existing member without consuming a second place', () => {
    const f = setup();
    for (let n = 0; n < 22; n += 1) f.command(actor(`guest-${n}`), randomUUID(), { type: 'join' });
    expect(f.state.members).toHaveLength(24);
    f.command(f.participant, f.client, { type: 'join' });
    expect(() => f.command(actor('overflow'), randomUUID(), { type: 'join' })).toThrow(/اكتمل/);
  });

  it('rejects unauthorized seat approval, occupied seats, and role escalation', () => {
    const f = setup();
    const member = f.state.members[1];
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        { type: 'moderator', clientId: f.client, memberId: member.id, enabled: true },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        { type: 'approve-seat', clientId: f.client, memberId: member.id, seat: 1 },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.host,
        { type: 'approve-seat', clientId: f.hostClient, memberId: member.id, seat: 0 },
        now,
      ),
    ).toThrow(/مشغول/);
    expect(member.seat).toBeNull();
  });

  it('requires microphone consent and prevents self-unmute after a moderator mutes the seat', () => {
    const f = setup();
    const member = f.state.members[1];
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'approve-seat', clientId: f.hostClient, memberId: member.id, seat: 1 },
      now,
    );
    expect(member.muted).toBe(true);
    applyVoiceCommand(
      f.state,
      f.room,
      f.participant,
      { type: 'mute', clientId: f.client, memberId: member.id, muted: false },
      now,
    );
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'mute', clientId: f.hostClient, memberId: member.id, muted: true },
      now,
    );
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        { type: 'mute', clientId: f.client, memberId: member.id, muted: false },
        now,
      ),
    ).toThrow();
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'mute', clientId: f.hostClient, memberId: member.id, muted: false },
      now,
    );
    expect(member.mutedByModerator).toBe(false);
    expect(member.muted).toBe(true);
  });

  it('allows an authenticated speaker offer and receive-only listener answer, never listener publishing', () => {
    const f = setup();
    const [host, listener] = f.state.members;
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'mute', clientId: f.hostClient, memberId: host.id, muted: false },
      now,
    );
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      {
        type: 'signal',
        clientId: f.hostClient,
        targetMemberId: listener.id,
        kind: 'offer',
        payload: sdp('sendonly'),
      },
      now,
    );
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: host.id,
          kind: 'offer',
          payload: sdp('sendrecv'),
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: host.id,
          kind: 'answer',
          payload: sdp('sendrecv'),
        },
        now,
      ),
    ).toThrow();
    applyVoiceCommand(
      f.state,
      f.room,
      f.participant,
      {
        type: 'signal',
        clientId: f.client,
        targetMemberId: host.id,
        kind: 'answer',
        payload: sdp('recvonly'),
      },
      now,
    );
    expect(f.state.signals.map((signal) => signal.sequence)).toEqual([1, 2]);
    expect(f.state.signals[0].from).toBe(host.id);
  });

  it.each(['recvonly', 'inactive'])(
    'allows a listener to initiate %s negotiation with a seated participant',
    (direction) => {
      const f = setup();
      const [host, listener] = f.state.members;
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: host.id,
          kind: 'offer',
          payload: sdp(direction),
        },
        now,
      );
      expect(f.state.signals).toHaveLength(1);
      expect(f.state.signals[0]).toMatchObject({ from: listener.id, to: host.id, kind: 'offer' });
    },
  );

  it.each(['sendrecv', 'sendonly'])(
    'rejects a listener-originated offer that tries %s publishing',
    (direction) => {
      const f = setup();
      expect(() =>
        applyVoiceCommand(
          f.state,
          f.room,
          f.participant,
          {
            type: 'signal',
            clientId: f.client,
            targetMemberId: f.state.members[0].id,
            kind: 'offer',
            payload: sdp(direction),
          },
          now,
        ),
      ).toThrow(/البث الصوتي/);
      expect(f.state.signals).toHaveLength(0);
    },
  );

  it('rejects negotiation between two audience members even with receive-only SDP', () => {
    const f = setup();
    const second = actor('second-listener');
    const secondClient = randomUUID();
    f.command(second, secondClient, { type: 'join' });
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: f.state.members[2].id,
          kind: 'offer',
          payload: sdp('recvonly'),
        },
        now,
      ),
    ).toThrow(/مقعد صوتي/);
    expect(f.state.signals).toHaveLength(0);
  });

  it('does not accept answers or ICE outside an authorized negotiation or target room', () => {
    const f = setup();
    const target = f.state.members[0].id;
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: target,
          kind: 'answer',
          payload: sdp('recvonly'),
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        {
          type: 'signal',
          clientId: f.client,
          targetMemberId: target,
          kind: 'ice',
          payload: '{"candidate":"x"}',
        },
        now,
      ),
    ).toThrow();
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.host,
        {
          type: 'signal',
          clientId: f.hostClient,
          targetMemberId: randomUUID(),
          kind: 'offer',
          payload: sdp('recvonly'),
        },
        now,
      ),
    ).toThrow();
  });

  it('retains signaling until the addressed member acknowledges its monotonic cursor', () => {
    const f = setup();
    const [host, listener] = f.state.members;
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      {
        type: 'signal',
        clientId: f.hostClient,
        targetMemberId: listener.id,
        kind: 'offer',
        payload: sdp('recvonly'),
      },
      now,
    );
    const sequence = f.state.sequence;
    // Another participant acknowledging that global cursor cannot erase a private message.
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'heartbeat', clientId: f.hostClient, cursor: sequence },
      now + 1,
    );
    expect(f.state.signals).toHaveLength(1);
    applyVoiceCommand(
      f.state,
      f.room,
      f.participant,
      { type: 'heartbeat', clientId: f.client, cursor: sequence },
      now + 2,
    );
    expect(f.state.signals).toHaveLength(0);
    expect(host.signalCursor).toBe(sequence);
  });

  it('blocks removed users from rejoining and preserves host control', () => {
    const f = setup();
    const target = f.state.members[1].id;
    applyVoiceCommand(
      f.state,
      f.room,
      f.host,
      { type: 'block', clientId: f.hostClient, memberId: target },
      now,
    );
    expect(() => f.command(f.participant, f.client, { type: 'join' }, now + 1000)).toThrow(
      /لا يمكنك/,
    );
    expect(f.state.members).toHaveLength(1);
    f.command(f.host, f.hostClient, { type: 'close' });
    expect(f.room.status).toBe('CLOSED');
    expect(() => f.command(f.host, f.hostClient, { type: 'heartbeat' })).toThrow(/أُغلقت/);
  });

  it('refreshes only the heartbeat participant identity after badge changes', () => {
    const f = setup();
    const updated = {
      ...f.participant,
      identity: { ...f.participant.identity!, name: 'Updated name' },
    };
    f.command(updated, f.client, { type: 'heartbeat' }, now + 1000);
    expect(f.state.members[1].identity.name).toBe('Updated name');
    expect(f.state.members[0].identity.name).toBe('host');
  });

  it('persists bounded rate limits instead of trusting client animation or chat timing', () => {
    const f = setup();
    for (let n = 0; n < 5; n += 1)
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        { type: 'chat', clientId: f.client, text: 'مرحبا' },
        now,
      );
    expect(() =>
      applyVoiceCommand(
        f.state,
        f.room,
        f.participant,
        { type: 'chat', clientId: f.client, text: 'إغراق' },
        now,
      ),
    ).toThrow(/طلبات كثيرة/);
    expect(f.state.messages).toHaveLength(5);
  });

  it('rejects video, data, malformed candidates and default publishing SDP from non-publishers', () => {
    expect(() =>
      validateVoiceSignal(
        'offer',
        'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n',
        true,
      ),
    ).toThrow();
    expect(() =>
      validateVoiceSignal('answer', 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', false),
    ).toThrow();
    expect(() =>
      validateVoiceSignal('ice', '{"candidate":"x","injected":"field"}', false),
    ).toThrow();
    expect(() =>
      validateVoiceSignal('ice', JSON.stringify({ candidate: 'x'.repeat(1501) }), false),
    ).toThrow();
  });
});
