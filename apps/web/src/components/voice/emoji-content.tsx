'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { CUSTOM_EMOJI_PATTERN } from '@/lib/voice/emojis';
import styles from './emoji.module.css';

const watchers = new Map<Element, (visible: boolean, still: boolean) => void>();
let observer: IntersectionObserver | null = null;
let motion: MediaQueryList | null = null;
const visibleElements = new Set<Element>();
function refresh() {
  for (const [element, update] of watchers)
    update(visibleElements.has(element), Boolean(motion?.matches || document.hidden));
}
function watch(element: Element, update: (visible: boolean, still: boolean) => void) {
  if (!watchers.size) {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) visibleElements.add(entry.target);
              else visibleElements.delete(entry.target);
              watchers.get(entry.target)?.(
                entry.isIntersecting,
                Boolean(motion?.matches || document.hidden),
              );
            }
          });
  }
  watchers.set(element, update);
  if (observer) observer.observe(element);
  else visibleElements.add(element);
  update(visibleElements.has(element), Boolean(motion?.matches || document.hidden));
  return () => {
    observer?.unobserve(element);
    watchers.delete(element);
    visibleElements.delete(element);
    if (!watchers.size) {
      observer?.disconnect();
      observer = null;
      motion?.removeEventListener('change', refresh);
      motion = null;
      document.removeEventListener('visibilitychange', refresh);
    }
  };
}

export const EmojiImage = memo(function EmojiImage({
  id,
  label = 'فيس تحدي لايف',
}: {
  id: string;
  label?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ref.current)
      return watch(ref.current, (onScreen, reduced) => {
        setVisible(onScreen);
        setStill(reduced);
      });
  }, []);
  return (
    <span ref={ref} className={styles.image}>
      {failed ? (
        <span role="img" aria-label={label}>
          🙂
        </span>
      ) : (
        // Already normalized server-side; keep animated WebP and authenticated poster switching intact.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visible ? `/api/voice/emojis/assets/${id}${still ? '?still=1' : ''}` : undefined}
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          alt={label}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
});

export const EmojiContent = memo(function EmojiContent({ text }: { text: string }) {
  const result = [];
  let start = 0;
  for (const match of text.matchAll(CUSTOM_EMOJI_PATTERN)) {
    result.push(text.slice(start, match.index));
    result.push(<EmojiImage key={match.index} id={match[1]} />);
    start = match.index + match[0].length;
  }
  result.push(text.slice(start));
  return <>{result}</>;
});
