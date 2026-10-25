import Image from 'next/image';
import type { VoiceGiftId } from '@/lib/voice/gifts';
import styles from './room-effects.module.css';

/** Photographic product assets and cinematic VFX; no icon/emoji substitutes. */
export function EffectArt({
  kind,
  large = false,
}: {
  kind: VoiceGiftId | 'portal' | 'meteor';
  large?: boolean;
}) {
  const asset = kind === 'portal' ? 'fireworks' : kind === 'meteor' ? 'star' : kind;
  return (
    <span className={styles.art} data-effect-art={kind} aria-hidden="true">
      <span className={styles.halo} />
      <Image
        src={`/voice/gifts/${asset}${large ? '' : '-thumb'}.webp`}
        alt=""
        width={large ? 640 : 192}
        height={large ? 640 : 192}
        unoptimized
        loading={large ? 'eager' : 'lazy'}
      />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
