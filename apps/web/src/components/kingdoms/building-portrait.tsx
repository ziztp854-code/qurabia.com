import Image from 'next/image';
import type { Building } from '@/lib/kingdoms/types';
import { hitBox, pct, villageArt, type Box, type PlotState } from './village-layout';
import styles from './village.module.css';

/**
 * جزء من رسم القرية داخل إطار بحجم `frame`. المصدر والمقاس نفساهما في كل مكان،
 * فيعيد المتصفح استخدام الصورة المحمّلة بدل تنزيل نسخة جديدة.
 */
export function ArtCrop({ frame, className }: { frame: Box; className?: string }) {
  return (
    <span
      className={`${styles.artCrop} ${className ?? ''}`}
      style={{
        width: pct((villageArt.width / frame.w) * 100),
        transform: `translate(${pct((-frame.x / villageArt.width) * 100)}, ${pct(
          (-frame.y / villageArt.height) * 100,
        )})`,
      }}
    >
      <Image src={villageArt.src} alt="" fill sizes={villageArt.sizes} />
    </span>
  );
}

/** لقطة المبنى في لوحة الإدارة بحالة الخادم نفسها التي تظهر في المشهد. */
export function BuildingPortrait({ building, state }: { building: Building; state: PlotState }) {
  const box = hitBox(building);
  const pad = 18;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const frame = {
    x,
    y,
    w: Math.min(villageArt.width - x, box.w + pad * 2),
    h: Math.min(villageArt.height - y, box.h + pad * 2),
  };
  return (
    <span
      className={styles.portrait}
      data-visual={state.visual}
      data-constructing={state.constructing}
      data-maxed={state.maxed}
      style={{ aspectRatio: `${frame.w} / ${frame.h}` }}
      aria-hidden="true"
    >
      <ArtCrop frame={frame} />
      <span className={styles.portraitHatch} />
    </span>
  );
}
