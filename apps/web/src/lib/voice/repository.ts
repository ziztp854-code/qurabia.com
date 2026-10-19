import { voiceAccountBadges, voiceBadgeAccountSelect } from './account-badges';
import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPrismaClient } from '@/lib/auth/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { VoiceHttpError } from './http';
import {
  applyVoiceEvent,
  joinVoiceState,
  leaveVoiceState,
  pruneVoicePresence,
  requireParticipant,
  voiceSnapshot,
} from './room-state';
import type {
  VoiceCreateInput,
  VoiceEvent,
  VoiceIdentity,
  VoiceJoinInput,
  VoiceList,
  VoiceMediaLedger,
  VoicePreferences,
  VoicePreferencesAction,
  VoiceRoomSettings,
  VoiceRoomState,
  VoiceSnapshot,
} from './types';
import type { Prisma } from '@tahaddi/database';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const stateOf = (value: unknown) => structuredClone(value) as VoiceRoomState;
async function pruneInactiveAccounts(state: VoiceRoomState) {
  if (!state.participants.length) return;
  const accounts = await getPrismaClient().user.findMany({
    where: { id: { in: state.participants.map((p) => p.id) }, status: 'ACTIVE' },
    select: { id: true, tokenVersion: true, ...voiceBadgeAccountSelect },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const member of state.participants) {
    const account = byId.get(member.id);
    member.accountBadges = account ? voiceAccountBadges(account) : [];
  }
  const versions = new Map(accounts.map((account) => [account.id, account.tokenVersion]));
  state.participants = state.participants.filter(
    (participant) => versions.get(participant.id) === (participant.tokenVersion ?? 0),
  );
}
const defaultPreferences = (): VoicePreferences => ({
  favorites: [],
  following: [],
  history: [],
  blockedUsers: [],
  mutedUsers: [],
  privateProfile: false,
  notifyFavorites: true,
});
function missing(): never {
  throw new VoiceHttpError(404, 'الغرفة غير موجودة.', 'NOT_FOUND');
}
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
function equalHash(value: string, stored: string) {
  const candidate = Buffer.from(hashToken(value));
  const original = Buffer.from(stored);
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}
async function assertCoverOwner(cover: string, ownerId: string) {
  if (!cover.startsWith('/api/voice/covers/')) return;
  const id = cover.slice('/api/voice/covers/'.length);
  if (
    !(await getPrismaClient().voiceCover.findFirst({
      where: { id, ownerId },
      select: { id: true },
    }))
  )
    throw new VoiceHttpError(403, 'اختر غلافًا رفعته من حسابك.', 'COVER_FORBIDDEN');
}
export async function getVoicePreferences(userId: string): Promise<VoicePreferences> {
  const stored = await getPrismaClient().voicePreference.findUnique({ where: { userId } });
  return stored ? { ...defaultPreferences(), ...(stored.state as object) } : defaultPreferences();
}
async function mutatePreferences(userId: string, mutate: (preferences: VoicePreferences) => void) {
  const db = getPrismaClient();
  await db.voicePreference.upsert({
    where: { userId },
    create: { userId, state: json(defaultPreferences()) },
    update: {},
  });
  for (let attempt = 0; attempt < 8; attempt++) {
    const stored = await db.voicePreference.findUniqueOrThrow({ where: { userId } });
    const state = { ...defaultPreferences(), ...(stored.state as object) };
    mutate(state);
    const updated = await db.voicePreference.updateMany({
      where: { userId, revision: stored.revision },
      data: { state: json(state), revision: { increment: 1 } },
    });
    if (updated.count) return state;
  }
  throw new VoiceHttpError(409, 'تغيرت الإعدادات. حاول مجددًا.', 'CONFLICT');
}
export async function updateVoicePreferences(userId: string, action: VoicePreferencesAction) {
  if (action.type !== 'privacy') {
    if (action.id === userId && action.type !== 'favorite')
      throw new VoiceHttpError(400, 'هذا الإجراء يتطلب عضوًا آخر.');
    if (action.type === 'favorite' && action.enabled) {
      const snapshot = await getVoiceSnapshot(action.id, userId);
      if (!snapshot.room.active) throw new VoiceHttpError(410, 'انتهى البث في هذه الغرفة.');
    }
    if (
      action.type !== 'favorite' &&
      !(await getPrismaClient().user.findFirst({
        where: { id: action.id, status: 'ACTIVE' },
        select: { id: true },
      }))
    )
      throw new VoiceHttpError(404, 'العضو غير موجود.');
  }
  if (action.type === 'follow' && action.enabled) {
    const [self, target] = await Promise.all([
      getVoicePreferences(userId),
      getVoicePreferences(action.id),
    ]);
    if (self.blockedUsers.includes(action.id) || target.blockedUsers.includes(userId))
      throw new VoiceHttpError(403, 'المتابعة غير متاحة لهذا العضو.');
  }
  return mutatePreferences(userId, (state) => {
    if (action.type === 'privacy') {
      if (action.privateProfile !== undefined) state.privateProfile = action.privateProfile;
      if (action.notifyFavorites !== undefined) state.notifyFavorites = action.notifyFavorites;
      if (action.directMessages !== undefined) state.directMessages = action.directMessages;
      return;
    }
    const field = {
      favorite: 'favorites',
      follow: 'following',
      block: 'blockedUsers',
      mute: 'mutedUsers',
    }[action.type] as 'favorites' | 'following' | 'blockedUsers' | 'mutedUsers';
    const existing = state[field].filter((id) => id !== action.id);
    if (action.enabled && existing.length >= 500)
      throw new VoiceHttpError(409, 'وصلت إلى الحد الأقصى لهذه القائمة.');
    state[field] = action.enabled ? [...existing, action.id] : existing;
    if (action.type === 'block' && action.enabled)
      state.following = state.following.filter((id) => id !== action.id);
  });
}
export async function listVoiceRooms(userId: string): Promise<VoiceList> {
  const preferences = await getVoicePreferences(userId);
  const records = await getPrismaClient().voiceRoom.findMany({
    where: { active: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const aggregates = records.map((record) => ({ record, state: stateOf(record.state) }));
  const accountIds = [
    ...new Set(aggregates.flatMap(({ state }) => state.participants.map((p) => p.id))),
  ];
  const accounts = accountIds.length
    ? await getPrismaClient().user.findMany({
        where: { id: { in: accountIds }, status: 'ACTIVE' },
        select: { id: true, tokenVersion: true },
      })
    : [];
  const versions = new Map(accounts.map((account) => [account.id, account.tokenVersion]));
  const rooms = aggregates.flatMap(({ record, state }) => {
    pruneVoicePresence(state, Date.now());
    state.participants = state.participants.filter(
      (participant) => versions.get(participant.id) === (participant.tokenVersion ?? 0),
    );
    if (state.bannedUsers.includes(userId) || preferences.blockedUsers.includes(state.host.id))
      return [];
    if (
      record.isPrivate &&
      record.hostId !== userId &&
      !state.participants.some((p) => p.id === userId)
    )
      return [];
    return [
      voiceSnapshot(record.id, state, record.revision, userId, Boolean(record.passwordHash)).room,
    ];
  });
  return {
    rooms,
    stats: {
      activeRooms: rooms.filter((room) => room.participantCount > 0).length,
      listeners: rooms.reduce((n, room) => n + room.listenerCount, 0),
      participants: rooms.reduce((n, room) => n + room.participantCount, 0),
    },
  };
}
export async function createVoiceRoom(
  user: VoiceIdentity,
  input: VoiceCreateInput,
): Promise<VoiceSnapshot> {
  const db = getPrismaClient();
  if ((await db.voiceRoom.count({ where: { hostId: user.id, active: true } })) >= 5)
    throw new VoiceHttpError(409, 'لديك خمس غرف نشطة. أغلق غرفة قبل إنشاء أخرى.');
  await assertCoverOwner(input.cover, user.id);
  const { password, ...settings } = input;
  const now = Date.now();
  const state: VoiceRoomState = {
    settings,
    host: user,
    createdAt: now,
    active: true,
    lockedSeats: [],
    participants: [],
    messages: [],
    bannedUsers: [],
  };
  joinVoiceState(state, user, now);
  const room = await db.voiceRoom.create({
    data: {
      hostId: user.id,
      state: json(state),
      isPrivate: settings.isPrivate,
      passwordHash: password ? await hashPassword(password) : null,
    },
  });
  await addHistory(user.id, room.id, settings.name);
  return voiceSnapshot(room.id, state, room.revision, user.id, Boolean(room.passwordHash));
}
// Every state mutation uses compare-and-swap. Two independent servers cannot allocate
// the same seat or silently overwrite a concurrently posted message.
async function mutateRoom(
  roomId: string,
  userId: string,
  mutate: (
    state: VoiceRoomState,
    record: {
      passwordHash: string | null;
      inviteHash: string | null;
      inviteExpiresAt: Date | null;
    },
  ) => Promise<void> | void,
  extra?: { passwordHash?: string | null; inviteHash?: string; inviteExpiresAt?: Date },
  report?: Extract<VoiceEvent, { type: 'report' }>,
) {
  const db = getPrismaClient();
  for (let attempt = 0; attempt < 8; attempt++) {
    const record = await db.voiceRoom.findUnique({ where: { id: roomId } });
    if (!record) missing();
    const state = stateOf(record.state);
    pruneVoicePresence(state, Date.now());
    await pruneInactiveAccounts(state);
    await mutate(state, record);
    const changed = await db.$transaction(async (tx) => {
      // State changes and Cloud token issuance/revocation share one room lock.
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`voice-media:${roomId}`}, 0))`;
      const result = await tx.voiceRoom.updateMany({
        where: { id: roomId, revision: record.revision },
        data: {
          state: json(state),
          revision: { increment: 1 },
          active: state.active,
          isPrivate: state.settings.isPrivate,
          ...extra,
        },
      });
      if (result.count && report) {
        const message = report.messageId
          ? state.messages.find((m) => m.id === report.messageId)
          : undefined;
        await tx.voiceReport.create({
          data: {
            roomId,
            reporterId: userId,
            targetUserId: report.userId ?? message?.userId,
            messageId: report.messageId,
            reason: report.reason,
            evidence: json(message ?? { roomName: state.settings.name }),
          },
        });
      }
      return result.count;
    });
    if (changed) {
      const preferences = await getVoicePreferences(userId);
      return voiceSnapshot(
        roomId,
        state,
        record.revision + 1,
        userId,
        Boolean(extra?.passwordHash === undefined ? record.passwordHash : extra.passwordHash),
        preferences.blockedUsers,
      );
    }
  }
  throw new VoiceHttpError(409, 'حدث تغيير متزامن. حاول مجددًا.', 'CONFLICT');
}
export async function getVoiceSnapshot(
  roomId: string,
  userId: string,
  heartbeat = false,
): Promise<VoiceSnapshot> {
  if (heartbeat)
    return mutateRoom(roomId, userId, (state) => {
      const me = requireParticipant(state, userId);
      me.lastSeenAt = Date.now();
    });
  const record = await getPrismaClient().voiceRoom.findUnique({ where: { id: roomId } });
  if (!record) missing();
  const state = stateOf(record.state);
  pruneVoicePresence(state, Date.now());
  await pruneInactiveAccounts(state);
  if (state.bannedUsers.includes(userId))
    throw new VoiceHttpError(403, 'لا يمكنك دخول هذه الغرفة.', 'FORBIDDEN');
  if (
    record.isPrivate &&
    record.hostId !== userId &&
    !state.participants.some((p) => p.id === userId)
  )
    throw new VoiceHttpError(
      403,
      'هذه غرفة خاصة. استخدم رابط الدعوة أو كلمة المرور.',
      'PRIVATE_ROOM',
    );
  const preferences = await getVoicePreferences(userId);
  const snapshot = voiceSnapshot(
    roomId,
    state,
    record.revision,
    userId,
    Boolean(record.passwordHash),
    preferences.blockedUsers,
  );
  // A public preview contains no chat or participant list before joining.
  if (!snapshot.me && state.host.id !== userId) {
    snapshot.messages = [];
    snapshot.participants = [];
  }
  return snapshot;
}
export async function requireVoiceMembership(
  roomId: string,
  userId: string,
): Promise<VoiceSnapshot> {
  const snapshot = await getVoiceSnapshot(roomId, userId, true);
  if (!snapshot.me || !snapshot.room.active)
    throw new VoiceHttpError(403, 'انضم إلى الغرفة أولًا.', 'NOT_JOINED');
  return snapshot;
}
async function addHistory(userId: string, roomId: string, name: string) {
  await mutatePreferences(userId, (state) => {
    state.history = [
      { roomId, name, visitedAt: Date.now() },
      ...state.history.filter((entry) => entry.roomId !== roomId),
    ].slice(0, 100);
  });
}
export async function joinVoiceRoom(roomId: string, user: VoiceIdentity, input: VoiceJoinInput) {
  const snapshot = await mutateRoom(roomId, user.id, async (state, record) => {
    if (
      state.settings.isPrivate &&
      state.host.id !== user.id &&
      !state.participants.some((p) => p.id === user.id)
    ) {
      const invited = Boolean(
        input.invite &&
        record.inviteHash &&
        record.inviteExpiresAt &&
        record.inviteExpiresAt.getTime() > Date.now() &&
        equalHash(input.invite, record.inviteHash),
      );
      const password = Boolean(
        input.password &&
        record.passwordHash &&
        (await verifyPassword(input.password, record.passwordHash)),
      );
      if (!invited && !password)
        throw new VoiceHttpError(403, 'رابط الدعوة أو كلمة المرور غير صالحة.', 'PRIVATE_ROOM');
    }
    const hostPreferences = await getVoicePreferences(state.host.id);
    if (hostPreferences.blockedUsers.includes(user.id))
      throw new VoiceHttpError(403, 'لا يمكنك دخول هذه الغرفة.', 'FORBIDDEN');
    joinVoiceState(state, user, Date.now());
  });
  await addHistory(user.id, roomId, snapshot.room.name);
  return snapshot;
}
export async function sendVoiceEvent(roomId: string, userId: string, event: VoiceEvent) {
  const now = Date.now();
  const messageId = randomUUID();
  return mutateRoom(
    roomId,
    userId,
    (state) => applyVoiceEvent(state, userId, event, now, messageId),
    undefined,
    event.type === 'report' ? event : undefined,
  );
}
export async function leaveVoiceRoom(roomId: string, userId: string) {
  return mutateRoom(roomId, userId, (state) => {
    leaveVoiceState(state, userId);
  });
}
export async function updateVoiceRoom(
  roomId: string,
  userId: string,
  input: Partial<VoiceRoomSettings> & { password?: string | null },
) {
  if (input.cover) await assertCoverOwner(input.cover, userId);
  const { password, ...settings } = input;
  const passwordHash =
    password === undefined ? undefined : password === null ? null : await hashPassword(password);
  return mutateRoom(
    roomId,
    userId,
    (state) => {
      if (state.host.id !== userId)
        throw new VoiceHttpError(403, 'تعديل الغرفة متاح للمضيف فقط.', 'FORBIDDEN');
      if (!state.active) throw new VoiceHttpError(410, 'انتهى البث في هذه الغرفة.');
      const merged = { ...state.settings, ...settings };
      if (password && !merged.isPrivate)
        throw new VoiceHttpError(400, 'كلمة المرور متاحة للغرف الخاصة فقط.');
      if (state.participants.some((p) => p.seatIndex !== null && p.seatIndex >= merged.seatCount))
        throw new VoiceHttpError(409, 'أفرغ المقاعد الزائدة قبل تقليل عددها.');
      state.settings = merged;
      state.lockedSeats = state.lockedSeats.filter((i) => i < merged.seatCount);
    },
    {
      ...(passwordHash === undefined ? {} : { passwordHash }),
      ...(input.isPrivate === false ? { passwordHash: null } : {}),
    },
  );
}
export async function createVoiceInvite(roomId: string, userId: string, origin: string) {
  const invite = randomBytes(32).toString('base64url');
  await mutateRoom(
    roomId,
    userId,
    (state) => {
      if (state.host.id !== userId || !state.active)
        throw new VoiceHttpError(403, 'روابط الدعوة متاحة للمضيف فقط.', 'FORBIDDEN');
    },
    { inviteHash: hashToken(invite), inviteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  );
  return {
    invite,
    url: `${origin}/voice/${encodeURIComponent(roomId)}#invite=${encodeURIComponent(invite)}`,
  };
}

/** Serialize SFU permission writes and read fresh, unfiltered authoritative membership. */
export async function withVoiceMediaSnapshot<T>(
  roomId: string,
  work: (
    snapshot: VoiceSnapshot,
    ledger: VoiceMediaLedger,
    checkpoint: { checkedAt: number },
  ) => Promise<T>,
): Promise<T> {
  return getPrismaClient().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`voice-media:${roomId}`}, 0))`;
      const record = await tx.voiceRoom.findUnique({ where: { id: roomId } });
      if (!record) missing();
      const state = stateOf(record.state);
      pruneVoicePresence(state, Date.now());
      const accounts = await tx.user.findMany({
        where: { id: { in: state.participants.map((p) => p.id) }, status: 'ACTIVE' },
        select: { id: true, tokenVersion: true },
      });
      const versions = new Map(accounts.map((account) => [account.id, account.tokenVersion]));
      state.participants = state.participants.filter(
        (participant) => versions.get(participant.id) === (participant.tokenVersion ?? 0),
      );
      const snapshot = voiceSnapshot(
        roomId,
        state,
        record.revision,
        '',
        Boolean(record.passwordHash),
      );
      // This callback is server-only: admission compares signed JWT session versions.
      // Public repository snapshots continue to strip this internal account field.
      snapshot.participants = state.participants;
      const ledger = state.mediaGrants ?? {};
      const before = JSON.stringify(ledger);
      const checkpoint = { checkedAt: state.mediaReconciledAt ?? 0 };
      const result = await work(snapshot, ledger, checkpoint);
      if (
        JSON.stringify(ledger) !== before ||
        checkpoint.checkedAt !== (state.mediaReconciledAt ?? 0)
      ) {
        state.mediaReconciledAt = checkpoint.checkedAt;
        state.mediaGrants = ledger;
        await tx.voiceRoom.update({
          where: { id: roomId },
          data: { state: json(state), revision: { increment: 1 } },
        });
      }
      return result;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
