'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { VoiceIdentity } from '@/lib/voice/types';
import type { VoiceRoomHandle } from './voice-room';

// Load the room UI and LiveKit only after someone opens a voice room.
const PersistentRoom = dynamic(
  () => import('./voice-room').then((module) => module.VoiceRoomView),
  {
    ssr: false,
  },
);
type Session = { roomId: string; user: VoiceIdentity };
type SessionContext = {
  current: Session | null;
  open: (roomId: string, user: VoiceIdentity) => void;
  switchRoom: (roomId: string, user: VoiceIdentity) => Promise<void>;
};
const VoiceSessionContext = createContext<SessionContext | null>(null);

export function useVoiceSession() {
  return useContext(VoiceSessionContext);
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<Session | null>(null);
  const currentRef = useRef<Session | null>(null);
  const controller = useRef<VoiceRoomHandle | null>(null);
  const switching = useRef(false);
  const clear = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
  }, []);
  const open = useCallback((roomId: string, user: VoiceIdentity) => {
    // Looking at another room must never silently end the current microphone.
    if (currentRef.current) return;
    const session = { roomId, user };
    currentRef.current = session;
    setCurrent(session);
  }, []);
  const switchRoom = useCallback(async (roomId: string, user: VoiceIdentity) => {
    if (switching.current) return;
    switching.current = true;
    try {
      if (currentRef.current) {
        if (!controller.current)
          throw new Error('انتظر اكتمال فتح الجلسة الحالية ثم أعد المحاولة.');
        await controller.current.leave();
      }
      const session = { roomId, user };
      currentRef.current = session;
      setCurrent(session);
    } finally {
      switching.current = false;
    }
  }, []);
  const context = useMemo(() => ({ current, open, switchRoom }), [current, open, switchRoom]);
  const inRoom = Boolean(current && pathname?.replace(/\/$/, '') === `/voice/${current.roomId}`);
  return (
    <VoiceSessionContext.Provider value={context}>
      {current && (
        <PersistentRoom
          key={`${current.roomId}:${current.user.id}`}
          ref={controller}
          roomId={current.roomId}
          user={current.user}
          visible={inRoom}
          onLeave={clear}
        />
      )}
      {children}
    </VoiceSessionContext.Provider>
  );
}
