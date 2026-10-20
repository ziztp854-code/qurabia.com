// Isolated presentation fixture. No microphone capture, network room or real identities.
import { useState, type ComponentProps } from 'react';
import { EntranceEffectPreview } from '../../src/components/voice/entrance-effect';
import { VoiceRoomView } from '../../src/components/voice/voice-room';
import type { VoiceMember, VoiceRoomSnapshot } from '../../src/lib/voice/contracts';
import type { EntranceAnnouncement } from '../../src/components/voice/entrance-queue';

type Controller = ComponentProps<typeof VoiceRoomView>['controller'];
const at = 1789920000000;
const member = (
  id: string,
  name: string,
  seat: number | null,
  role: VoiceMember['role'],
  tier: 'ordinary' | 'gold' | 'diamond',
  accountNumber: number,
): VoiceMember => ({
  id,
  seat,
  role,
  muted: id !== 'speaker',
  mutedByModerator: false,
  joinedAt: at,
  connectionEpoch: 1,
  requestedSeat: id === 'listener',
  identity: {
    userId: id,
    accountNumber,
    name,
    username: `user_${id}`,
    avatarUrl: null,
    primaryBadge: null,
    badges: [],
    frame:
      tier === 'ordinary'
        ? null
        : {
            id: `frame-${tier}`,
            name: tier === 'gold' ? 'إطار ذهبي' : 'إطار ماسي',
            description: '',
            kind: 'FRAME',
            tier,
            token: tier,
            assetUrl: null,
            archived: false,
            free: false,
          },
    effect: null,
  },
});
const initial: VoiceRoomSnapshot = {
  id: 'presentation-room',
  code: '731429',
  name: 'ديوان السهر والحديث',
  imageUrl: null,
  ownerId: 'host',
  createdAt: at,
  revision: 1,
  cursor: 10,
  serverTime: at,
  status: 'OPEN',
  selfMemberId: 'host',
  canModerate: true,
  memberCount: 5,
  members: [
    member('host', 'عبدالعزيز بن سلطان العتيبي', 0, 'HOST', 'gold', 1),
    member('speaker', 'نورة', 1, 'MODERATOR', 'diamond', 123456789),
    member('guest', 'الاسم المحفوظ', 2, 'MEMBER', 'ordinary', 123456790),
    member('listener', 'سارة', null, 'MEMBER', 'ordinary', 123456791),
    member('guest2', 'سلطان', null, 'MEMBER', 'gold', 123456792),
  ],
  messages: [
    {
      id: 'message1',
      memberId: 'host',
      name: 'عبدالعزيز',
      text: 'أهلًا بأهل المجلس! كيف كانت تحديات اليوم؟',
      at,
    },
    {
      id: 'message2',
      memberId: 'speaker',
      name: 'نورة',
      text: 'مساء النور، مستعدون لجولة جديدة ✨',
      at: at + 1000,
    },
    {
      id: 'message3',
      memberId: 'listener',
      name: 'سارة',
      text: 'مساء الخير، يسعدني الانضمام إليكم.',
      at: at + 2000,
    },
  ],
  reactions: [],
  entrances: [],
  signals: [],
};
export function VoiceHarness() {
  const [room, setRoom] = useState(initial);
  const [error, setError] = useState('');
  const [microphoneActive, setMicrophone] = useState(false);
  const [effectsEnabled, setEffects] = useState(true);
  const announcement: EntranceAnnouncement | null = new URLSearchParams(location.search).has(
    'entrance',
  )
    ? {
        id: 'fixture-entrance',
        createdAt: at,
        name: 'سلطان',
        tier: 'royal',
        avatarUrl: null,
        badge: 'المضيف المميز',
      }
    : null;
  const controller: Controller = {
    room,
    status: 'connected',
    error,
    setError,
    remoteStreams: {},
    speaking: { speaker: true },
    microphoneActive,
    toggleMicrophone: async () => {
      setMicrophone((value) => !value);
    },
    resumePlayback: async () => undefined,
    leave: async () => {
      setError('هذه معاينة محلية فقط.');
    },
    effectsEnabled,
    toggleEffects: async () => {
      setEffects((value) => !value);
    },
    subduedEffects: false,
    announcement,
    turnConfigured: true,
    command: async (command) => {
      if (command.type === 'chat')
        setRoom((old) => ({
          ...old,
          messages: [
            ...old.messages,
            {
              id: `message-${old.messages.length}`,
              memberId: 'host',
              name: 'عبدالعزيز',
              text: command.text,
              at,
            },
          ],
        }));
      if (command.type === 'approve-seat')
        setRoom((old) => ({
          ...old,
          members: old.members.map((entry) =>
            entry.id === command.memberId
              ? { ...entry, seat: command.seat, requestedSeat: false }
              : entry,
          ),
        }));
      return { ok: true, room, iceServers: [], turnConfigured: true };
    },
  };
  return <VoiceRoomView controller={controller} />;
}

export function VoiceEntranceGallery() {
  const tiers = ['ordinary', 'silver', 'gold', 'diamond', 'royal', 'legend'] as const;
  const names = ['دخول عادي', 'دخول فضي', 'دخول ذهبي', 'دخول ماسي', 'دخول ملكي', 'دخول الأسطورة'];
  return (
    <section dir="rtl">
      <h1>معاينة لوحات الدخول</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: 32,
        }}
      >
        {tiers.map((tier, index) => (
          <article key={tier} style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 16, marginBlock: 16 }}>{names[index]}</h2>
            <EntranceEffectPreview tier={tier} name="عبدالعزيز بن سلطان" subdued />
          </article>
        ))}
      </div>
    </section>
  );
}
