'use client';
/* Original extracted sprites have variable dimensions and are deliberately unoptimized. */
/* eslint-disable @next/next/no-img-element */
import catalogData from '@/lib/alfazaa/data/catalog.json';
import art from '@/lib/alfazaa/data/art.json';
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import type { AlfazaaState, Catalog } from '@/lib/alfazaa/domain/types';
import styles from './game.module.css';
const catalog = catalogData as unknown as Catalog;
export function CityScene({
  state,
  selected,
  select,
  busy,
}: {
  state: AlfazaaState;
  selected: number | null;
  select: (cell: number) => void;
  busy: boolean;
}) {
  const castle = catalog.buildings.find(
    (item) => item.type === 11 && item.level === state.castleLevel,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [zoom]);
  return (
    <>
      <div className={styles.cameraControls} aria-label="كاميرا المدينة">
        <span>حرّك المشهد لاستعراض مدينتك</span>
        <button
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))}
          disabled={zoom >= 1.6}
          aria-label="تقريب المدينة"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          disabled={zoom <= 0.6}
          aria-label="تصغير المدينة"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            const node = viewport.current;
            if (node) {
              node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
              node.scrollTop = 0;
            }
          }}
          aria-label="إعادة عرض المدينة"
        >
          <Scan size={18} />
        </button>
      </div>
      <div
        className={styles.sceneViewport}
        ref={viewport}
        dir="ltr"
        tabIndex={0}
        aria-label="مشهد المدينة؛ مرّر أفقيًا لاستعراض الأرض"
      >
        <div
          className={styles.cityScene}
          aria-label="مدينة الفزعة"
          style={{
            backgroundImage: `url(${art.cityGround}), url(${art.cityWater})`,
            width: `${900 * zoom}px`,
          }}
        >
          <div className={styles.sceneSky} aria-hidden="true" />
          <div className={styles.land} aria-hidden="true" />
          {[
            { x: 13, y: 36 },
            { x: 85, y: 37 },
            { x: 9, y: 62 },
            { x: 91, y: 64 },
          ].map((p, i) => (
            <img
              key={i}
              src={art.foliage}
              alt=""
              aria-hidden="true"
              className={styles.foliage}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
          <div className={styles.castle}>
            {castle?.image && <img src={castle.image} alt="" draggable={false} />}
            <span>
              قلعة الفزعة <b>{state.castleLevel}</b>
            </span>
          </div>
          <div
            className={styles.cityCells}
            role="group"
            aria-label="أرض المدينة؛ اختر وحدة ثم خانة لنقلها أو دمجها"
          >
            {state.cells.map((cell, index) => {
              const config = cell
                ? (cell.kind === 'troop' ? catalog.arms : catalog.buildings).find(
                    (item) => item.id === cell.cfgId,
                  )
                : null;
              const row = Math.floor(index / 6),
                col = index % 6;
              return (
                <button
                  key={index}
                  className={`${styles.cell} ${selected === index ? styles.selected : ''}`}
                  style={{
                    left: `${50 + (col - row) * 7.2}%`,
                    top: `${35 + (col + row) * 3.6}%`,
                    zIndex: row + col + 1,
                  }}
                  aria-label={`الخانة ${index + 1}: ${config ? `${config.name} مستوى ${config.level}` : 'فارغة'}`}
                  aria-pressed={selected === index}
                  disabled={busy}
                  onClick={() => select(index)}
                >
                  <img
                    className={styles.groundTile}
                    src={art.grassTile}
                    alt=""
                    draggable={false}
                    aria-hidden="true"
                  />
                  {config?.image && (
                    <img
                      className={`${styles.cellArt} ${cell?.kind === 'troop' ? styles.troopArt : ''}`}
                      src={config.image}
                      alt=""
                      draggable={false}
                    />
                  )}
                  {config && <span className={styles.level}>{config.level}</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.sceneCaption}>اختر وحدتين متطابقتين للدمج</div>
        </div>
      </div>
    </>
  );
}
