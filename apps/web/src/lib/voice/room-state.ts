import { VoiceHttpError } from './http';
import { voiceGift, VOICE_GIFT_INTERVAL } from './gifts';
import {
  customEmojiIds,
  isUnicodeReaction,
  isCustomReaction,
  messageEmojiCount,
  MAX_MESSAGE_EMOJIS,
} from './emojis';
import type {
  VoiceEvent,
  VoiceIdentity,
  VoiceParticipant,
  VoiceRoomState,
  VoiceSnapshot,
} from './types';
export const VOICE_PRESENCE_TTL = 90_000;
export function pruneVoicePresence(state: VoiceRoomState, now: number) {
  state.participants = state.participants.filter((p) => now - p.lastSeenAt <= VOICE_PRESENCE_TTL);
}
export function canManageVoice(state: VoiceRoomState, actor: VoiceParticipant) {
  return (
    actor.role === 'host' || (actor.role === 'moderator' && state.settings.moderatorsCanManage)
  );
}
function forbidden() {
  throw new VoiceHttpError(403, 'لا تملك صلاحية تنفيذ هذا الإجراء.', 'FORBIDDEN');
}
export function requireParticipant(state: VoiceRoomState, userId: string) {
  const actor = state.participants.find((p) => p.id === userId);
  if (!state.active) throw new VoiceHttpError(410, 'انتهى البث في هذه الغرفة.', 'ROOM_CLOSED');
  if (!actor) throw new VoiceHttpError(403, 'انضم إلى الغرفة أولًا.', 'NOT_JOINED');
  return actor;
}
export function joinVoiceState(state: VoiceRoomState, user: VoiceIdentity, now: number) {
  if (!state.active) throw new VoiceHttpError(410, 'انتهى البث في هذه الغرفة.', 'ROOM_CLOSED');
  if (state.bannedUsers.includes(user.id)) forbidden();
  let participant = state.participants.find((p) => p.id === user.id);
  if (participant) {
    participant.lastSeenAt = now;
    participant.name = user.name;
    participant.image = user.image;
    participant.accountBadges = user.accountBadges ?? [];
    return;
  }
  participant = {
    ...user,
    role: user.id === state.host.id ? 'host' : 'listener',
    seatIndex: user.id === state.host.id ? 0 : null,
    handRaised: false,
    requestedSeat: null,
    muted: true,
    moderatorMuted: false,
    joinedAt: now,
    lastSeenAt: now,
  };
  if (state.participants.length >= 250)
    throw new VoiceHttpError(409, 'الغرفة ممتلئة حاليًا.', 'ROOM_FULL');
  // A returning host must not displace an occupied seat.
  if (
    participant.seatIndex !== null &&
    state.participants.some((p) => p.seatIndex === participant!.seatIndex)
  )
    participant.seatIndex = null;
  state.participants.push(participant);
}
export function leaveVoiceState(state: VoiceRoomState, userId: string) {
  state.participants = state.participants.filter((p) => p.id !== userId);
}
export function applyVoiceEvent(
  state: VoiceRoomState,
  userId: string,
  event: VoiceEvent,
  now: number,
  messageId: string,
  allowedEmojiIds: ReadonlySet<string> = new Set(),
) {
  const actor = requireParticipant(state, userId);
  actor.lastSeenAt = now;
  const manage = () => {
    if (!canManageVoice(state, actor)) forbidden();
  };
  const target = (id: string, protect = true) => {
    const participant = requireParticipant(state, id);
    if (
      protect &&
      participant.id !== actor.id &&
      (participant.role === 'host' || (participant.role === 'moderator' && actor.role !== 'host'))
    )
      forbidden();
    return participant;
  };
  const validSeat = (index: number) => {
    if (index < 0 || index >= state.settings.seatCount)
      throw new VoiceHttpError(400, 'المقعد غير موجود.', 'INVALID_SEAT');
  };
  const setSeat = (participant: VoiceParticipant, index: number) => {
    validSeat(index);
    if (
      state.lockedSeats.includes(index) ||
      state.participants.some((p) => p.seatIndex === index && p.id !== participant.id)
    )
      throw new VoiceHttpError(409, 'المقعد مشغول أو مقفل.', 'SEAT_UNAVAILABLE');
    participant.seatIndex = index;
    if (participant.role === 'listener') participant.role = 'speaker';
    participant.requestedSeat = null;
    participant.handRaised = false;
    participant.muted = true;
  };
  switch (event.type) {
    case 'gift': {
      if (!state.settings.chatEnabled)
        throw new VoiceHttpError(403, 'الهدايا متوقفة أثناء إغلاق الدردشة.', 'CHAT_DISABLED');
      const gift = voiceGift(event.giftId);
      if (!gift) throw new VoiceHttpError(400, 'الهدية غير متاحة.', 'INVALID_GIFT');
      const recipient = target(event.recipientId, false);
      if (actor.lastGiftAt !== undefined && now - actor.lastGiftAt < VOICE_GIFT_INTERVAL)
        throw new VoiceHttpError(429, 'انتظر خمس ثوانٍ بين الهدايا التجريبية.', 'GIFT_SLOW_MODE');
      state.messages.push({
        id: messageId,
        userId: actor.id,
        name: actor.name,
        image: actor.image,
        text: `${gift.emoji} أرسل ${actor.name} ${gift.name} إلى ${recipient.name} · هدية تجريبية مجانية`,
        createdAt: now,
        replyTo: null,
        pinned: false,
        reactions: {},
        gift: {
          id: gift.id,
          recipientId: recipient.id,
          recipientName: recipient.name,
        },
      });
      actor.lastGiftAt = now;
      state.messages = state.messages.slice(-200);
      break;
    }
    case 'request-seat': {
      if (!state.settings.allowMicRequests && !canManageVoice(state, actor)) forbidden();
      const index =
        event.seatIndex ??
        state.participants.reduce(
          (available, p) => (p.seatIndex === available ? available + 1 : available),
          0,
        );
      if (event.seatIndex !== undefined) validSeat(index);
      if (event.seatIndex !== undefined && state.lockedSeats.includes(index))
        throw new VoiceHttpError(409, 'المقعد مقفل.', 'SEAT_UNAVAILABLE');
      if (canManageVoice(state, actor)) {
        const free =
          event.seatIndex ??
          Array.from({ length: state.settings.seatCount }, (_, i) => i).find(
            (i) =>
              !state.lockedSeats.includes(i) && !state.participants.some((p) => p.seatIndex === i),
          );
        if (free === undefined)
          throw new VoiceHttpError(409, 'لا يوجد مقعد متاح.', 'SEAT_UNAVAILABLE');
        setSeat(actor, free);
      } else {
        actor.handRaised = true;
        actor.requestedSeat = event.seatIndex ?? -1;
      }
      break;
    }
    case 'give-mic': {
      manage();
      const participant = target(event.userId);
      if (participant.role !== 'listener' || participant.seatIndex !== null)
        throw new VoiceHttpError(409, 'هذا العضو ليس مستمعًا خارج المنصة.', 'NOT_LISTENER');
      const free = Array.from({ length: state.settings.seatCount }, (_, i) => i).find(
        (i) => !state.lockedSeats.includes(i) && !state.participants.some((p) => p.seatIndex === i),
      );
      if (free === undefined)
        throw new VoiceHttpError(409, 'لا يوجد مقعد متاح لإعطاء المايك.', 'SEAT_UNAVAILABLE');
      // Grant a seat/publication capability, never capture or unmute the device remotely.
      setSeat(participant, free);
      break;
    }
    case 'approve-seat': {
      manage();
      const participant = target(event.userId);
      if (participant.requestedSeat === null && participant.role === 'listener')
        throw new VoiceHttpError(409, 'لم يطلب هذا العضو الميكروفون.', 'NO_REQUEST');
      setSeat(participant, event.seatIndex);
      break;
    }
    case 'deny-seat': {
      manage();
      const participant = target(event.userId);
      participant.requestedSeat = null;
      participant.handRaised = false;
      break;
    }
    case 'leave-seat':
      actor.seatIndex = null;
      actor.muted = true;
      actor.handRaised = false;
      actor.requestedSeat = null;
      if (actor.role === 'speaker') actor.role = 'listener';
      break;
    case 'hand':
      actor.handRaised = event.raised;
      if (!event.raised) actor.requestedSeat = null;
      break;
    case 'mute':
      if (
        !event.muted &&
        (actor.seatIndex === null || actor.role === 'listener' || actor.moderatorMuted)
      )
        forbidden();
      actor.muted = event.muted;
      break;
    case 'moderator-mute': {
      manage();
      const participant = target(event.userId);
      if (participant.role === 'host' && participant.id !== actor.id) forbidden();
      participant.moderatorMuted = event.muted;
      if (event.muted) participant.muted = true;
      break;
    }
    case 'lock-seat':
      manage();
      validSeat(event.seatIndex);
      if (event.locked && state.participants.some((p) => p.seatIndex === event.seatIndex))
        throw new VoiceHttpError(409, 'أفرغ المقعد قبل قفله.', 'SEAT_OCCUPIED');
      state.lockedSeats = [
        ...state.lockedSeats.filter((i) => i !== event.seatIndex),
        ...(event.locked ? [event.seatIndex] : []),
      ];
      break;
    case 'remove': {
      manage();
      const participant = target(event.userId);
      if (participant.role === 'host' || participant.id === actor.id) forbidden();
      state.bannedUsers.push(participant.id);
      state.participants = state.participants.filter((p) => p.id !== participant.id);
      break;
    }
    case 'role': {
      if (actor.role !== 'host') forbidden();
      const participant = target(event.userId);
      if (participant.role === 'host') forbidden();
      if (event.role === 'speaker' && participant.seatIndex === null) {
        if (participant.requestedSeat === null)
          throw new VoiceHttpError(409, 'يجب طلب المقعد أولًا.', 'NO_REQUEST');
        const free = Array.from({ length: state.settings.seatCount }, (_, i) => i).find(
          (i) =>
            !state.lockedSeats.includes(i) && !state.participants.some((p) => p.seatIndex === i),
        );
        if (free === undefined)
          throw new VoiceHttpError(409, 'لا يوجد مقعد متاح.', 'SEAT_UNAVAILABLE');
        setSeat(participant, free);
      }
      participant.role = event.role;
      if (event.role === 'listener') {
        participant.seatIndex = null;
        participant.muted = true;
        participant.handRaised = false;
        participant.requestedSeat = null;
      }
      break;
    }
    case 'message': {
      if (
        messageEmojiCount(event.text) > MAX_MESSAGE_EMOJIS ||
        customEmojiIds(event.text).some((id) => !allowedEmojiIds.has(id))
      )
        throw new VoiceHttpError(
          400,
          'تجاوزت حد الفيسات أو اخترت فيسًا غير متاح.',
          'INVALID_EMOJI',
        );
      if (!state.settings.chatEnabled)
        throw new VoiceHttpError(403, 'الدردشة معطلة في هذه الغرفة.', 'CHAT_DISABLED');
      if (event.replyTo && !state.messages.some((m) => m.id === event.replyTo))
        throw new VoiceHttpError(404, 'الرسالة الأصلية غير موجودة.');
      if (state.messages.some((m) => m.userId === userId && now - m.createdAt < 1000))
        throw new VoiceHttpError(429, 'انتظر لحظة بين الرسائل.', 'SLOW_MODE');
      state.messages.push({
        id: messageId,
        userId,
        ...(event.requestId ? { clientId: event.requestId } : {}),
        name: actor.name,
        image: actor.image,
        text: event.text,
        createdAt: now,
        replyTo: event.replyTo ?? null,
        pinned: false,
        reactions: {},
      });
      state.messages = state.messages.slice(-200);
      break;
    }
    case 'reaction': {
      if (!state.settings.chatEnabled)
        throw new VoiceHttpError(403, 'الدردشة معطلة في هذه الغرفة.', 'CHAT_DISABLED');
      if (
        (!isUnicodeReaction(event.emoji) && !isCustomReaction(event.emoji)) ||
        customEmojiIds(event.emoji).some((id) => !allowedEmojiIds.has(id))
      )
        throw new VoiceHttpError(400, 'هذا التفاعل غير متاح.', 'INVALID_EMOJI');
      const message = state.messages.find((m) => m.id === event.messageId);
      if (!message) throw new VoiceHttpError(404, 'الرسالة غير موجودة.');
      const ids = message.reactions[event.emoji] ?? [];
      if (
        !ids.includes(userId) &&
        !message.reactions[event.emoji] &&
        Object.keys(message.reactions).length >= 20
      )
        throw new VoiceHttpError(429, 'وصلت الرسالة إلى حد أنواع التفاعلات.', 'REACTION_LIMIT');
      message.reactions[event.emoji] = ids.includes(userId)
        ? ids.filter((id) => id !== userId)
        : [...ids, userId];
      if (!message.reactions[event.emoji].length) delete message.reactions[event.emoji];
      break;
    }
    case 'pin-message': {
      manage();
      const message = state.messages.find((m) => m.id === event.messageId);
      if (!message) throw new VoiceHttpError(404, 'الرسالة غير موجودة.');
      for (const m of state.messages) m.pinned = false;
      message.pinned = event.pinned;
      break;
    }
    case 'delete-message': {
      const message = state.messages.find((m) => m.id === event.messageId);
      if (!message) throw new VoiceHttpError(404, 'الرسالة غير موجودة.');
      if (message.userId !== userId) manage();
      state.messages = state.messages.filter((m) => m.id !== event.messageId);
      break;
    }
    case 'report':
      if (event.messageId && !state.messages.some((m) => m.id === event.messageId))
        throw new VoiceHttpError(404, 'الرسالة غير موجودة.');
      if (event.userId) target(event.userId, false);
      break;
    case 'close':
      if (actor.role !== 'host') forbidden();
      state.active = false;
      state.participants = [];
      break;
  }
}
function publicParticipant(participant: VoiceParticipant): VoiceParticipant {
  const publicValue = { ...participant };
  delete publicValue.tokenVersion;
  delete publicValue.lastGiftAt;
  return publicValue;
}
export function voiceSnapshot(
  id: string,
  state: VoiceRoomState,
  revision: number,
  userId: string,
  passwordRequired = false,
  blocked: string[] = [],
): VoiceSnapshot {
  return {
    room: {
      ...state.settings,
      id,
      hostId: state.host.id,
      hostName: state.host.name,
      hostImage: state.host.image,
      createdAt: state.createdAt,
      active: state.active,
      lockedSeats: state.lockedSeats,
      participantCount: state.participants.length,
      listenerCount: state.participants.filter((p) => p.seatIndex === null).length,
      speakers: state.participants.filter((p) => p.seatIndex !== null).map(publicParticipant),
      passwordRequired,
    },
    participants: state.participants.map(publicParticipant),
    messages: state.messages.filter((m) => !blocked.includes(m.userId)),
    me: state.participants.find((p) => p.id === userId)
      ? publicParticipant(state.participants.find((p) => p.id === userId)!)
      : null,
    cursor: revision,
  };
}
