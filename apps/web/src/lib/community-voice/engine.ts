import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PublicIdentity } from '@/lib/community/contracts';
import {
  VOICE_MEMBER_LIMIT,
  type VoiceCommand,
  type VoiceEntrance,
  type VoiceMember,
  type VoiceMessage,
  type VoiceReactionEvent,
  type VoiceSignal,
} from './contracts';
import { VoiceError } from './errors';

export const VOICE_MEMBERSHIP_TTL = 45_000;
export type StoredVoiceMember = VoiceMember & {
  clientId: string;
  tokenVersion: number;
  lastSeenAt: number;
  signalCursor: number;
  limits: Record<string, number[]>;
};
type StoredSignal = VoiceSignal & { to: string; sequence: number };
export type VoiceState = {
  schemaVersion: 1;
  revision: number;
  sequence: number;
  members: StoredVoiceMember[];
  messages: VoiceMessage[];
  reactions: VoiceReactionEvent[];
  entrances: VoiceEntrance[];
  signals: StoredSignal[];
  negotiations: { from: string; to: string; at: number }[];
  blocked: string[];
  recentEntrances: { userId: string; at: number }[];
};
export type VoiceActor = {
  userId: string;
  tokenVersion: number;
  platformModerator: boolean;
  identity?: PublicIdentity | null;
};
export type VoiceRoomAuthority = { ownerId: string; status: string };

export function newVoiceState(): VoiceState {
  return {
    schemaVersion: 1,
    revision: 0,
    sequence: 0,
    members: [],
    messages: [],
    reactions: [],
    entrances: [],
    signals: [],
    negotiations: [],
    blocked: [],
    recentEntrances: [],
  };
}

export function pruneVoiceState(state: VoiceState, now: number) {
  state.members = state.members.filter((member) => member.lastSeenAt > now - VOICE_MEMBERSHIP_TTL);
  const present = new Set(state.members.map((member) => member.id));
  const acknowledged = new Map(state.members.map((member) => [member.id, member.signalCursor]));
  state.signals = state.signals.filter(
    (signal) =>
      signal.at > now - 40_000 &&
      present.has(signal.from) &&
      present.has(signal.to) &&
      signal.sequence > (acknowledged.get(signal.to) ?? 0),
  );
  state.negotiations = state.negotiations.filter(
    (entry) => entry.at > now - 40_000 && present.has(entry.from) && present.has(entry.to),
  );
  state.entrances = state.entrances
    .filter((event) => event.at > now - 15_000 && present.has(event.memberId))
    .slice(-24);
  state.reactions = state.reactions
    .filter((event) => event.at > now - 6000 && present.has(event.memberId))
    .slice(-24);
  state.recentEntrances = state.recentEntrances
    .filter((event) => event.at > now - 120_000)
    .slice(-128);
}

function fail(status: number, message: string, code?: string): never {
  throw new VoiceError(status, message, code);
}

function rate(member: StoredVoiceMember, key: string, limit: number, window: number, now: number) {
  const recent = (member.limits[key] ?? []).filter((at) => at > now - window);
  if (recent.length >= limit)
    fail(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'RATE_LIMITED');
  member.limits[key] = [...recent, now];
}

const iceSchema = z
  .object({
    candidate: z.string().max(1500),
    sdpMid: z.string().max(32).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(5).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  })
  .strict();

/** SDP direction is checked on the server; client claims never confer publish rights. */
export function validateVoiceSignal(
  kind: VoiceSignal['kind'],
  payload: string,
  canPublish: boolean,
) {
  if (kind === 'ice') {
    if (payload.length > 2000) fail(400, 'بيانات اتصال غير صالحة.');
    try {
      iceSchema.parse(JSON.parse(payload));
    } catch {
      fail(400, 'بيانات اتصال غير صالحة.');
    }
    return;
  }
  if (payload.length > 24_000 || payload.includes('\0') || !payload.startsWith('v=0'))
    fail(400, 'وصف الاتصال غير صالح.');
  const normalized = payload
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  if (normalized.includes('\r') || normalized.split('\n').some((line) => line !== line.trimStart()))
    fail(400, 'وصف الاتصال غير صالح.');
  if (
    normalized
      .split('\n')
      .some((line) => /^a=(?:sendrecv|sendonly|recvonly|inactive).+$/.test(line))
  )
    fail(400, 'وصف الاتصال غير صالح.');
  const sections = normalized.split(/(?=^m=)/m);
  const session = sections.shift() ?? '';
  const sessionDirections = [
    ...session.matchAll(/^a=(sendrecv|sendonly|recvonly|inactive)$/gm),
  ].map((match) => match[1]);
  if (sessionDirections.length > 1) fail(400, 'وصف الاتصال غير صالح.');
  const sessionDirection = sessionDirections[0];
  if (sections.length !== 1 || !sections[0].startsWith('m=audio '))
    fail(400, 'تسمح الغرفة بالصوت فقط.');
  for (const section of sections) {
    const directions = [...section.matchAll(/^a=(sendrecv|sendonly|recvonly|inactive)$/gm)].map(
      (match) => match[1],
    );
    if (directions.length > 1) fail(400, 'وصف الاتصال غير صالح.');
    // Require an explicit media direction for non-publishers. Browser parsers do
    // not consistently honor session-level direction and may default to sendrecv.
    const direction = directions[0] ?? (canPublish ? sessionDirection : undefined) ?? 'sendrecv';
    if (!canPublish && direction !== 'recvonly' && direction !== 'inactive')
      fail(403, 'لم يُسمح لهذا الحساب بالبث الصوتي.', 'PUBLISH_FORBIDDEN');
  }
}

export function canModerateVoice(actor: VoiceActor, member: VoiceMember, room: VoiceRoomAuthority) {
  return actor.platformModerator || actor.userId === room.ownerId || member.role === 'MODERATOR';
}

export function applyVoiceCommand(
  state: VoiceState,
  room: VoiceRoomAuthority,
  actor: VoiceActor,
  command: VoiceCommand,
  now: number,
  id = randomUUID,
): void {
  pruneVoiceState(state, now);
  if (room.status !== 'OPEN') fail(410, 'أُغلقت الغرفة.', 'ROOM_CLOSED');
  if (state.blocked.includes(actor.userId))
    fail(403, 'لا يمكنك الانضمام إلى هذه الغرفة.', 'ROOM_BLOCKED');
  let self = state.members.find((member) => member.identity.userId === actor.userId);

  if (command.type === 'join') {
    if (!actor.identity) fail(401, 'الحساب غير متاح.');
    if (!self) {
      if (state.members.length >= VOICE_MEMBER_LIMIT)
        fail(409, 'اكتمل عدد المشاركين في الغرفة.', 'ROOM_FULL');
      const isHost = actor.userId === room.ownerId;
      self = {
        id: id(),
        identity: actor.identity,
        role: isHost ? 'HOST' : 'MEMBER',
        seat: isHost && !state.members.some((member) => member.seat === 0) ? 0 : null,
        muted: true,
        mutedByModerator: false,
        requestedSeat: false,
        joinedAt: now,
        connectionEpoch: 0,
        clientId: command.clientId,
        tokenVersion: actor.tokenVersion,
        lastSeenAt: now,
        signalCursor: 0,
        limits: {},
      };
      state.members.push(self);
      if (
        !state.recentEntrances.some(
          (event) => event.userId === actor.userId && event.at > now - 60_000,
        )
      ) {
        state.entrances.push({ id: id(), memberId: self.id, identity: actor.identity, at: now });
        state.recentEntrances.push({ userId: actor.userId, at: now });
      }
    } else {
      rate(self, 'join', 8, 60_000, now);
      if (self.clientId !== command.clientId) {
        self.clientId = command.clientId;
        self.connectionEpoch += 1;
        self.muted = true;
        state.signals = state.signals.filter(
          (signal) => signal.to !== self!.id && signal.from !== self!.id,
        );
        state.negotiations = state.negotiations.filter(
          (entry) => entry.to !== self!.id && entry.from !== self!.id,
        );
      }
      self.identity = actor.identity;
      self.tokenVersion = actor.tokenVersion;
      self.lastSeenAt = now;
    }
    state.revision += 1;
    return;
  }

  if (!self || self.clientId !== command.clientId)
    fail(
      409,
      'انضم إلى الغرفة من جديد. قد يكون الحساب مفتوحًا في تبويب آخر.',
      'MEMBERSHIP_REQUIRED',
    );
  if (self.tokenVersion !== actor.tokenVersion) fail(401, 'تغيّرت جلسة الحساب.', 'SESSION_REVOKED');
  self.signalCursor = Math.max(self.signalCursor, Math.min(command.cursor ?? 0, state.sequence));
  if (!['heartbeat', 'signal', 'chat', 'reaction'].includes(command.type))
    rate(self, 'control', 30, 10_000, now);
  self.lastSeenAt = now;
  const moderate = canModerateVoice(actor, self, room);
  const target =
    'memberId' in command
      ? state.members.find((member) => member.id === command.memberId)
      : undefined;
  const requireModeration = () => {
    if (!moderate) fail(403, 'هذا الإجراء للمضيف والمشرفين.');
  };
  const requireTarget = () => {
    if (!target) fail(404, 'المشارك غير موجود.');
    return target;
  };

  if (command.type === 'heartbeat') {
    rate(self, 'heartbeat', 30, 10_000, now);
    if (actor.identity) self.identity = actor.identity;
  } else if (command.type === 'leave') {
    state.members = state.members.filter((member) => member.id !== self.id);
  } else if (command.type === 'chat') {
    rate(self, 'chat', 5, 10_000, now);
    const text = command.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text) fail(400, 'اكتب رسالة أولًا.');
    state.messages.push({ id: id(), memberId: self.id, name: self.identity.name, text, at: now });
    state.messages = state.messages.slice(-60);
  } else if (command.type === 'reaction') {
    rate(self, 'reaction', 5, 10_000, now);
    state.reactions.push({ id: id(), memberId: self.id, reaction: command.reaction, at: now });
    state.reactions = state.reactions.slice(-24);
  } else if (command.type === 'request-seat') {
    rate(self, 'control', 12, 10_000, now);
    if (self.seat === null) self.requestedSeat = true;
  } else if (command.type === 'release-seat') {
    self.seat = null;
    self.muted = true;
    self.requestedSeat = false;
  } else if (command.type === 'approve-seat') {
    requireModeration();
    const member = requireTarget();
    if (member.role === 'HOST' && actor.userId !== room.ownerId && !actor.platformModerator)
      fail(403, 'لا يمكنك نقل المضيف أو كتمه.');
    if (
      !member.requestedSeat &&
      member.id !== self.id &&
      actor.userId !== room.ownerId &&
      !actor.platformModerator
    )
      fail(409, 'لم يطلب هذا المشارك مقعدًا.');
    if (state.members.some((entry) => entry.id !== member.id && entry.seat === command.seat))
      fail(409, 'المقعد مشغول.');
    member.seat = command.seat;
    member.requestedSeat = false;
    member.muted = true;
  } else if (command.type === 'mute') {
    const member = requireTarget();
    if (member.id !== self.id) {
      requireModeration();
      if (member.role === 'HOST' && actor.userId !== room.ownerId && !actor.platformModerator)
        fail(403, 'لا يمكنك كتم المضيف.');
      member.mutedByModerator = command.muted;
      member.muted = true; // Permission to capture audio must always come from that participant.
    } else {
      if (!command.muted && (member.seat === null || member.mutedByModerator))
        fail(403, 'الميكروفون غير متاح لهذا المقعد.');
      member.muted = command.muted;
    }
  } else if (command.type === 'moderator') {
    if (actor.userId !== room.ownerId && !actor.platformModerator)
      fail(403, 'تعيين المشرفين للمضيف فقط.');
    const member = requireTarget();
    if (member.identity.userId === room.ownerId) fail(403, 'لا يمكن تغيير دور المضيف.');
    member.role = command.enabled ? 'MODERATOR' : 'MEMBER';
  } else if (command.type === 'remove' || command.type === 'block') {
    requireModeration();
    const member = requireTarget();
    if (member.identity.userId === room.ownerId || member.id === self.id)
      fail(403, 'لا يمكن تنفيذ هذا الإجراء على المضيف أو على حسابك.');
    if (member.role === 'MODERATOR' && actor.userId !== room.ownerId && !actor.platformModerator)
      fail(403, 'لا يمكنك إخراج مشرف آخر.');
    if (command.type === 'block') {
      if (state.blocked.length >= 256) fail(409, 'وصلت قائمة الحظر إلى حدها الأقصى.');
      state.blocked.push(member.identity.userId);
    }
    state.members = state.members.filter((entry) => entry.id !== member.id);
  } else if (command.type === 'close') {
    if (actor.userId !== room.ownerId && !actor.platformModerator)
      fail(403, 'إغلاق الغرفة للمضيف فقط.');
    room.status = 'CLOSED';
    state.signals = [];
    state.negotiations = [];
    for (const member of state.members) member.muted = true;
  } else if (command.type === 'signal') {
    rate(self, 'signal', 180, 10_000, now);
    const recipient = state.members.find((member) => member.id === command.targetMemberId);
    if (!recipient || recipient.id === self.id) fail(404, 'طرف الاتصال غير موجود.');
    // Either side may negotiate a pair so its stable offerer never changes when
    // seats change. This permits listening only; SDP publish rights are checked below.
    if (command.kind === 'offer' && self.seat === null && recipient.seat === null)
      fail(403, 'يجب أن يكون أحد طرفي الاتصال في مقعد صوتي.', 'PUBLISH_FORBIDDEN');
    const pending = state.negotiations.some(
      (entry) => entry.from === recipient.id && entry.to === self.id,
    );
    if (command.kind === 'answer' && !pending) fail(409, 'لا يوجد طلب اتصال صالح.');
    if (
      command.kind === 'ice' &&
      !state.negotiations.some(
        (entry) =>
          (entry.from === self.id && entry.to === recipient.id) ||
          (entry.from === recipient.id && entry.to === self.id),
      )
    )
      fail(409, 'ابدأ الاتصال الصوتي أولًا.');
    validateVoiceSignal(
      command.kind,
      command.payload,
      self.seat !== null && !self.muted && !self.mutedByModerator,
    );
    if (command.kind === 'offer') {
      state.negotiations = state.negotiations.filter(
        (entry) => entry.from !== self.id || entry.to !== recipient.id,
      );
      state.negotiations.push({ from: self.id, to: recipient.id, at: now });
    }
    // The sender and recipient come only from authenticated authoritative membership.
    state.sequence += 1;
    state.signals.push({
      id: id(),
      from: self.id,
      to: recipient.id,
      kind: command.kind,
      payload: command.payload,
      at: now,
      sequence: state.sequence,
    });
    state.signals = state.signals.slice(-768);
    while (state.signals.reduce((bytes, signal) => bytes + signal.payload.length, 0) > 1_000_000)
      state.signals.shift();
  }
  state.revision += 1;
  pruneVoiceState(state, now);
}

export function publicVoiceMember(member: StoredVoiceMember): VoiceMember {
  return {
    id: member.id,
    identity: member.identity,
    role: member.role,
    seat: member.seat,
    muted: member.muted,
    mutedByModerator: member.mutedByModerator,
    requestedSeat: member.requestedSeat,
    joinedAt: member.joinedAt,
    connectionEpoch: member.connectionEpoch,
  };
}
