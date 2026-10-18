'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { VoiceIdentity } from '@/lib/voice/types';
import { VoiceShell } from './voice-ui';
import { captureInvite } from './voice-client';
import { useVoiceSession } from './voice-session-provider';

function SignedInRoomEntry({ roomId, user }: { roomId: string; user: VoiceIdentity }) {
  const session = useVoiceSession();
  const open = session?.open;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    open?.(roomId, user);
    // Opening is tied to the destination/account, not changes in the active session.
    // Explicit leave must not immediately auto-join the room being left.
  }, [open, roomId, user]);
  if (session?.current?.roomId === roomId && session.current.user.id === user.id) return null;
  if (session?.current)
    return (
      <VoiceShell user={user} room>
        <div className="v-join-panel">
          <h1>أنت متصل بغرفة صوتية أخرى</h1>
          <p>
            يبقى المايك متصلًا أثناء اللعب. الانضمام إلى هذه الغرفة يتطلب مغادرة الجلسة الحالية.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="v-button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError('');
              void session
                .switchRoom(roomId, user)
                .catch((cause) =>
                  setError(cause instanceof Error ? cause.message : 'تعذر تبديل الغرفة.'),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'جارٍ تبديل الغرفة…' : 'مغادرة الحالية والانضمام'}
          </button>
          <Link href={`/voice/${session.current.roomId}`}>العودة إلى الجلسة الحالية</Link>
          <Link href="/games/">متابعة اللعب بالمايك الحالي</Link>
        </div>
      </VoiceShell>
    );
  return <p role="status">جارٍ فتح الغرفة الصوتية…</p>;
}

export function VoiceRoomEntry({ roomId, user }: { roomId: string; user: VoiceIdentity | null }) {
  const [inviteWarning, setInviteWarning] = useState(false);
  useEffect(() => {
    if (user) return;
    const invite = captureInvite(roomId);
    if (invite) {
      try {
        if (!sessionStorage.getItem(`tahaddi:voice-invite:${roomId}`))
          queueMicrotask(() => setInviteWarning(true));
      } catch {
        queueMicrotask(() => setInviteWarning(true));
      }
    }
  }, [roomId, user]);
  if (user) return <SignedInRoomEntry roomId={roomId} user={user} />;
  return (
    <VoiceShell user={null} room>
      <div className="v-join-panel">
        <h1>حسابك هو صوتك</h1>
        <p>سجّل الدخول للانضمام إلى الغرفة وحماية خصوصية المشاركين.</p>
        {inviteWarning && (
          <p role="status">لم يتمكن المتصفح من حفظ الدعوة. أعد فتح رابط الدعوة بعد تسجيل الدخول.</p>
        )}
        <Link
          className="v-button"
          href={`/auth/sign-in?next=${encodeURIComponent(`/voice/${roomId}`)}`}
        >
          تسجيل الدخول والانضمام
        </Link>
        <Link href="/voice">استكشاف الغرف</Link>
      </div>
    </VoiceShell>
  );
}
