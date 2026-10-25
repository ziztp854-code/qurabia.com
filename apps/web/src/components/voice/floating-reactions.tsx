'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomReaction } from '@/lib/voice/types';
import styles from './room-effects.module.css';

/** One bounded rail, outside seats/chat. Initial history and reconnect replays are consumed silently. */
export function FloatingReactions({
  events,
  reduced,
  visible,
}: {
  events: RoomReaction[];
  reduced: boolean;
  visible: boolean;
}) {
  const seen = useRef(new Set<string>());
  const initial = useRef(true);
  const [active, setActive] = useState<RoomReaction[]>([]);
  useEffect(() => {
    const fresh = events.filter(
      (event) => !seen.current.has(event.id) && Date.now() - event.createdAt < 5000,
    );
    events.forEach((event) => seen.current.add(event.id));
    if (seen.current.size > 256) seen.current = new Set([...seen.current].slice(-128));
    if (!initial.current && !reduced && visible && !document.hidden)
      setActive((current) =>
        [...current, ...fresh.map((event) => ({ ...event, createdAt: Date.now() }))].slice(-6),
      );
    initial.current = false;
  }, [events, reduced, visible]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setActive((current) => {
          const next = current.filter((event) => Date.now() - event.createdAt < 2500);
          return next.length === current.length ? current : next;
        }),
      300,
    );
    return () => clearInterval(timer);
  }, []);
  if (reduced || !visible) return null;
  return (
    <div className={styles.reactionRail} aria-hidden="true" data-room-reactions>
      {active.map((event) => (
        <span key={event.id}>{event.emoji}</span>
      ))}
    </div>
  );
}
