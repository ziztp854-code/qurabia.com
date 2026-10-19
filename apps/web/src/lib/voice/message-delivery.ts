import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { pruneVoicePresence } from './room-state';
import type { VoicePreferences, VoiceRoomState } from './types';

/** Server data must follow the same membership and per-viewer block rules as HTTP chat. */
export async function voiceMessageDelivery(roomId: string, messageId: string) {
  const db = getPrismaClient();
  const record = await db.voiceRoom.findUnique({ where: { id: roomId } });
  if (!record?.active) return null;
  const state = structuredClone(record.state) as VoiceRoomState;
  pruneVoicePresence(state, Date.now());
  const message = state.messages.find((message) => message.id === messageId);
  if (!state.active || !message) return null;
  const accounts = await db.user.findMany({
    where: {
      id: {
        in: state.participants.filter((p) => !state.bannedUsers.includes(p.id)).map((p) => p.id),
      },
      status: 'ACTIVE',
    },
    select: { id: true, tokenVersion: true, voicePreference: { select: { state: true } } },
  });
  const recipients = accounts
    .filter((account) => {
      const member = state.participants.find((p) => p.id === account.id);
      const preferences = account.voicePreference?.state as Partial<VoicePreferences> | undefined;
      return (
        member &&
        (member.tokenVersion ?? 0) === account.tokenVersion &&
        !preferences?.blockedUsers?.includes(message.userId)
      );
    })
    .map((account) => account.id);
  return { message, recipients, cursor: record.revision };
}
