'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import catalogData from '@/lib/alfazaa/data/catalog.json';
import art from '@/lib/alfazaa/data/art.json';
import type { Catalog, Command, TowerBattle } from '@/lib/alfazaa/domain/types';
import styles from './game.module.css';
const catalog = catalogData as unknown as Catalog;
export function TowerScene({
  battle,
  send,
  busy,
}: {
  battle: TowerBattle;
  send: (command: Command) => Promise<void>;
  busy: boolean;
}) {
  const [source, setSource] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.25);
  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (height > 0) setAspect(width / height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const level = catalog.levels.find((item) => item.id === battle.levelId)!;
  const points = [...battle.buildings, ...level.barriers];
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const scale = Math.min(76 / Math.max(1, maxX - minX), 70 / (Math.max(1, maxY - minY) * aspect));
  const point = (p: { x: number; y: number }) => ({
    x: 50 + (p.x - (minX + maxX) / 2) * scale,
    y: 51 - (p.y - (minY + maxY) / 2) * scale * aspect,
  });
  const towerArt = (camp: number, type: number, hp: number) => {
    const family = type === 2 ? 'defense' : type === 3 ? 'attack' : 'neutral';
    const key = `img_building_${family}_${camp}_${hp >= 30 ? 3 : hp >= 10 ? 2 : 1}`;
    return (art.towers as Record<string, string>)[key] || art.towers.img_building_neutral_0_1;
  };
  const choose = async (id: string, camp: number) => {
    if (source && source !== id) {
      await send({ type: 'tower-route', from: source, to: id });
      setSource(null);
    } else if (camp === catalog.meta.blueCamp) setSource(source === id ? null : id);
  };
  return (
    <section
      className={styles.battleSection}
      aria-label={`تدريب الأبراج المرحلة ${battle.levelId}`}
    >
      <div className={styles.battleInfo}>
        <span>
          المرحلة {battle.levelId} من {catalog.levels.length}
        </span>
        <b>
          {battle.status === 'won'
            ? 'انتصار!'
            : battle.status === 'lost'
              ? 'انتهت المحاولة'
              : `الوقت ${Math.floor(battle.elapsedMs / 1000)} ث`}
        </b>
      </div>
      <p className={styles.hint}>
        اختر برجك الأزرق، ثم برجًا آخر لإرسال الجنود. احتلّ جميع الأبراج للفوز.
      </p>
      <div className={styles.battleMap} ref={mapRef}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={styles.paths}
          aria-hidden="true"
        >
          {battle.routes.map((route) => {
            const from = battle.buildings.find((b) => b.id === route.from),
              to = battle.buildings.find((b) => b.id === route.to);
            if (!from || !to) return null;
            const a = point(from),
              b = point(to);
            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={from.camp === catalog.meta.blueCamp ? styles.bluePath : styles.redPath}
              />
            );
          })}
          {battle.troops.slice(0, 150).map((t) => {
            const from = battle.buildings.find((b) => b.id === t.from),
              to = battle.buildings.find((b) => b.id === t.to);
            if (!from || !to) return null;
            const a = point(from),
              b = point(to);
            return (
              <circle
                key={t.id}
                cx={a.x + (b.x - a.x) * t.progress}
                cy={a.y + (b.y - a.y) * t.progress}
                r=".65"
                className={t.camp === catalog.meta.blueCamp ? styles.blueTroop : styles.redTroop}
              />
            );
          })}
        </svg>
        {level.barriers.map((barrier, i) => {
          const p = point(barrier);
          return (
            <span
              key={i}
              className={styles.barrier}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden="true"
            />
          );
        })}
        {battle.buildings.map((node, index) => {
          const p = point(node),
            owned = node.camp === catalog.meta.blueCamp;
          return (
            <button
              key={node.id}
              className={`${styles.tower} ${owned ? styles.blueTower : node.camp === catalog.meta.neutralCamp ? styles.neutralTower : styles.redTower} ${source === node.id ? styles.selectedTower : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onClick={() => void choose(node.id, node.camp)}
              disabled={busy || battle.status === 'won' || battle.status === 'lost'}
              aria-pressed={source === node.id}
              aria-label={`البرج ${index + 1}، ${owned ? 'ملكك' : node.camp === catalog.meta.neutralCamp ? 'محايد' : 'الخصم'}، ${Math.floor(node.hp)} جندي`}
            >
              <img src={towerArt(node.camp, node.buildingType, node.hp)} alt="" />
              <b>{Math.floor(node.hp)}</b>
              <small>{index + 1}</small>
            </button>
          );
        })}
      </div>
      {source && (
        <button className={styles.secondary} onClick={() => setSource(null)}>
          إلغاء اختيار البرج
        </button>
      )}
      <div className={styles.routeList}>
        {battle.routes
          .filter(
            (r) => battle.buildings.find((b) => b.id === r.from)?.camp === catalog.meta.blueCamp,
          )
          .map((r) => (
            <button
              key={`${r.from}-${r.to}`}
              className={styles.secondary}
              disabled={busy}
              onClick={() => void send({ type: 'tower-disconnect', from: r.from, to: r.to })}
            >
              إيقاف المسار {battle.buildings.findIndex((b) => b.id === r.from) + 1} ←{' '}
              {battle.buildings.findIndex((b) => b.id === r.to) + 1}
            </button>
          ))}
      </div>
      <div className={styles.battleActions}>
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void send({ type: 'tower-start', levelId: battle.levelId })}
        >
          إعادة المحاولة
        </button>
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => void send({ type: 'tower-quit' })}
        >
          خريطة المراحل
        </button>
      </div>
      <p className={styles.hint}>تدريب فردي بلا جوائز مالية أو نقاط تصنيف.</p>
    </section>
  );
}
