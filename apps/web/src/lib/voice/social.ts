import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getVoicePreferences } from './repository';
import { VoiceHttpError } from './http';
import { voiceRelationship } from './social-policy';
export async function voiceContact(selfId: string, peerId: string) {
  if (selfId === peerId) throw new VoiceHttpError(400, 'اختر عضوًا آخر.');
  const [peer, self, preferences] = await Promise.all([
    getPrismaClient().user.findFirst({
      where: { id: peerId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        image: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    getVoicePreferences(selfId),
    getVoicePreferences(peerId),
  ]);
  if (!peer) throw new VoiceHttpError(404, 'العضو غير متاح.');
  const blocked = self.blockedUsers.includes(peerId) || preferences.blockedUsers.includes(selfId);
  return {
    peer: {
      id: peer.id,
      name: peer.profile?.displayName || peer.name || 'عضو تحدي',
      image: peer.profile?.avatarUrl || peer.image || null,
    },
    relationship: voiceRelationship(selfId, peerId, self, preferences),
    blocked,
  };
}
export async function voiceConversation(selfId: string, peerId: string) {
  const { peer, relationship, blocked } = await voiceContact(selfId, peerId);
  if (blocked) throw new VoiceHttpError(403, 'المحادثة غير متاحة.');
  const db = getPrismaClient();
  const messages = await db.voiceDirectMessage.findMany({
    where: {
      OR: [
        { senderId: selfId, recipientId: peerId },
        { senderId: peerId, recipientId: selfId },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 80,
    select: { id: true, senderId: true, text: true, createdAt: true, readAt: true },
  });
  await db.voiceDirectMessage.updateMany({
    where: {
      id: { in: messages.filter((m) => m.senderId === peerId && !m.readAt).map((m) => m.id) },
      recipientId: selfId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { peer, relationship, messages: messages.reverse() };
}
export async function sendVoiceDirectMessage(selfId: string, peerId: string, text: string) {
  const { relationship } = await voiceContact(selfId, peerId);
  if (!relationship.canMessage)
    throw new VoiceHttpError(
      403,
      'هذا العضو يسمح بالرسائل حسب إعدادات خصوصيته. المتابعة المتبادلة تتيح الرسائل للأصدقاء.',
    );
  await getPrismaClient().voiceDirectMessage.create({
    data: { senderId: selfId, recipientId: peerId, text },
  });
  return voiceConversation(selfId, peerId);
}
export async function voiceContacts(selfId: string) {
  const db = getPrismaClient();
  const [preferences, followers, recent] = await Promise.all([
    getVoicePreferences(selfId),
    db.voicePreference.findMany({
      where: { state: { path: ['following'], array_contains: [selfId] } },
      select: { userId: true },
      take: 100,
    }),
    db.voiceDirectMessage.findMany({
      where: { OR: [{ senderId: selfId }, { recipientId: selfId }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { senderId: true, recipientId: true },
    }),
  ]);
  const ids = [
    ...new Set([
      ...recent.map((m) => (m.senderId === selfId ? m.recipientId : m.senderId)),
      ...preferences.following,
      ...followers.map((p) => p.userId),
    ]),
  ]
    .filter((id) => id !== selfId && !preferences.blockedUsers.includes(id))
    .slice(0, 100);
  const [accounts, peerPreferences] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        image: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
    }),
    db.voicePreference.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, state: true },
    }),
  ]);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const settings = new Map(
    peerPreferences.map((pref) => [
      pref.userId,
      pref.state as Partial<import('./types').VoicePreferences>,
    ]),
  );
  return {
    contacts: ids.flatMap((id) => {
      const account = byId.get(id);
      const peer = {
        ...preferences,
        following: [],
        blockedUsers: [],
        directMessages: 'friends' as const,
        ...settings.get(id),
      };
      if (!account || peer.blockedUsers.includes(selfId)) return [];
      return [
        {
          peer: {
            id,
            name: account.profile?.displayName || account.name || 'عضو تحدي',
            image: account.profile?.avatarUrl || account.image || null,
          },
          relationship: voiceRelationship(selfId, id, preferences, peer),
        },
      ];
    }),
  };
}
