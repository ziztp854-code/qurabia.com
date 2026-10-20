import 'server-only';
import { randomInt } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { hasPermission } from '@/lib/auth/authorization';
import { getUserIdentity } from '@/lib/community/service';
import type {
  VoiceCommand,
  VoiceRoomResponse,
  VoiceRoomSnapshot,
  VoiceRoomSummary,
} from './contracts';
import {
  applyVoiceCommand,
  canModerateVoice,
  newVoiceState,
  pruneVoiceState,
  publicVoiceMember,
  type VoiceActor,
  type VoiceState,
} from './engine';
import { VoiceError } from './errors';
import { voiceIceConfiguration } from './ice';
import type { VoiceIdentity } from './http';

type Tx = Prisma.TransactionClient;
type VoiceRow = {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  ownerId: string;
  status: string;
  state: unknown;
  createdAt: Date;
  updatedAt: Date;
};
const json = (state: VoiceState) => JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;

async function authorize(tx: Tx, identity: VoiceIdentity): Promise<VoiceActor> {
  const user = await tx.user.findUnique({
    where: { id: identity.userId },
    select: { id: true, status: true, tokenVersion: true, role: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new VoiceError(401, 'الجلسة غير صالحة. سجّل الدخول من جديد.', 'SESSION_REVOKED');
  return {
    userId: user.id,
    tokenVersion: user.tokenVersion,
    platformModerator: hasPermission(user.role, 'MANAGE_ROOMS'),
  };
}

function stateOf(row: VoiceRow): VoiceState {
  const state = row.state as VoiceState;
  if (
    !state ||
    state.schemaVersion !== 1 ||
    !Array.isArray(state.members) ||
    !Array.isArray(state.signals)
  )
    throw new VoiceError(503, 'بيانات الغرفة غير متاحة.');
  return state;
}

async function nowAtDatabase(tx: Tx) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now.getTime();
}

function summary(row: VoiceRow, state: VoiceState): VoiceRoomSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    imageUrl: row.imageUrl,
    ownerId: row.ownerId,
    memberCount: state.members.length,
    createdAt: row.createdAt.getTime(),
  };
}

function view(
  row: VoiceRow,
  state: VoiceState,
  actor: VoiceActor,
  cursor: number,
  now: number,
): VoiceRoomSnapshot {
  const self = state.members.find((member) => member.identity.userId === actor.userId);
  return {
    ...summary(row, state),
    status: row.status === 'OPEN' ? 'OPEN' : 'CLOSED',
    revision: state.revision,
    cursor: state.sequence,
    selfMemberId: self?.id ?? '',
    canModerate: self ? canModerateVoice(actor, self, row) : false,
    members: state.members.map(publicVoiceMember),
    messages: state.messages,
    reactions: state.reactions,
    entrances: state.entrances,
    signals: self
      ? state.signals
          .filter((signal) => signal.to === self.id && signal.sequence > cursor)
          .map((signal) => ({
            id: signal.id,
            from: signal.from,
            kind: signal.kind,
            payload: signal.payload,
            at: signal.at,
          }))
      : [],
    serverTime: now,
  };
}

/** Database row locks serialize heartbeat, seats and signaling across web instances. */
export function voiceTransaction<T>(
  work: (tx: Tx) => Promise<T>,
  db: DatabaseClient = getPrismaClient(),
) {
  return db.$transaction(work, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15_000 });
}

export async function listVoiceRooms(
  identity: VoiceIdentity,
  db?: DatabaseClient,
): Promise<VoiceRoomSummary[]> {
  return voiceTransaction(async (tx) => {
    await authorize(tx, identity);
    const rows = await tx.$queryRaw<(Omit<VoiceRoomSummary, 'createdAt'> & { createdAt: Date })[]>`
      SELECT id, code, name, "imageUrl", "ownerId", "createdAt",
        (SELECT count(*)::integer FROM jsonb_array_elements(state->'members') member
          WHERE (member->>'lastSeenAt')::bigint > EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - 45000) AS "memberCount"
      FROM "VoiceRoom" WHERE status = 'OPEN' ORDER BY "updatedAt" DESC LIMIT 24`;
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }));
  }, db);
}

export async function createVoiceRoom(
  identity: VoiceIdentity,
  input: { name: string; imageUrl?: string | null; clientId: string },
  db?: DatabaseClient,
): Promise<Omit<VoiceRoomResponse, 'ok'>> {
  return voiceTransaction(async (tx) => {
    const actor = await authorize(tx, identity);
    // Per-owner serialization enforces limits even when concurrent requests arrive on separate instances.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
    const now = await nowAtDatabase(tx);
    const [openCount, recentCount] = await Promise.all([
      tx.voiceRoom.count({ where: { ownerId: actor.userId, status: 'OPEN' } }),
      tx.voiceRoom.count({
        where: { ownerId: actor.userId, createdAt: { gt: new Date(now - 3_600_000) } },
      }),
    ]);
    if (openCount >= 1)
      throw new VoiceError(409, 'لديك غرفة مفتوحة بالفعل. أغلقها قبل إنشاء غرفة جديدة.');
    if (recentCount >= 3)
      throw new VoiceError(429, 'يمكن إنشاء ثلاث غرف في الساعة. حاول لاحقًا.', 'RATE_LIMITED');
    actor.identity = await getUserIdentity(actor.userId, tx);
    if (!actor.identity) throw new VoiceError(401, 'الحساب غير متاح.');
    let code = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = String(randomInt(100_000_000, 1_000_000_000));
      if (!(await tx.voiceRoom.findUnique({ where: { code: candidate }, select: { id: true } }))) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new VoiceError(503, 'تعذّر إنشاء رقم للغرفة. حاول مجددًا.');
    const state = newVoiceState();
    const authority = { ownerId: actor.userId, status: 'OPEN' };
    applyVoiceCommand(state, authority, actor, { type: 'join', clientId: input.clientId }, now);
    const row = await tx.voiceRoom.create({
      data: {
        code,
        name: input.name,
        imageUrl: input.imageUrl ?? null,
        ownerId: actor.userId,
        status: 'OPEN',
        state: json(state),
      },
    });
    return { room: view(row, state, actor, 0, now), ...voiceIceConfiguration(actor.userId, now) };
  }, db);
}

export async function commandVoiceRoom(
  roomId: string,
  identity: VoiceIdentity,
  command: VoiceCommand,
  db?: DatabaseClient,
): Promise<Omit<VoiceRoomResponse, 'ok'>> {
  return voiceTransaction(async (tx) => {
    const actor = await authorize(tx, identity);
    const [row] = await tx.$queryRaw<
      VoiceRow[]
    >`SELECT id, code, name, "imageUrl", "ownerId", status, state, "createdAt", "updatedAt" FROM "VoiceRoom" WHERE id = ${roomId} OR code = ${roomId} FOR UPDATE`;
    if (!row) throw new VoiceError(404, 'الغرفة غير موجودة.', 'ROOM_NOT_FOUND');
    const now = await nowAtDatabase(tx);
    const state = stateOf(row);
    pruneVoiceState(state, now);
    // Any polling participant clears suspended/deleted accounts and revoked sessions.
    if (state.members.length) {
      const active = await tx.user.findMany({
        where: { id: { in: state.members.map((member) => member.identity.userId) } },
        select: { id: true, status: true, tokenVersion: true },
      });
      state.members = state.members.filter((member) =>
        active.some(
          (user) =>
            user.id === member.identity.userId &&
            user.status === 'ACTIVE' &&
            user.tokenVersion === member.tokenVersion,
        ),
      );
    }
    if (command.type === 'join' || command.type === 'heartbeat') {
      actor.identity = await getUserIdentity(actor.userId, tx);
      if (!actor.identity) throw new VoiceError(401, 'الحساب غير متاح.', 'SESSION_REVOKED');
    }
    applyVoiceCommand(state, row, actor, command, now);
    await tx.voiceRoom.update({
      where: { id: row.id },
      data: { state: json(state), status: row.status },
    });
    return {
      room: view(row, state, actor, command.cursor ?? 0, now),
      ...voiceIceConfiguration(actor.userId, now),
    };
  }, db);
}
