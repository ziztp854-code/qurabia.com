'use client';
import { VillageProgress } from './village-progress';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Maximize,
  Minimize2,
  Pause,
  Play,
  Tags,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { buildingKeys } from '@/lib/kingdoms/types';
import type {
  VillageDebugOptions,
  VillageQuality,
  VillageSceneHandle,
  VillageSelection,
  VillageTarget,
} from '@/lib/kingdoms/village/types';
import { VillageCanvas } from './village-canvas';
import { VillageActivity } from './village-activity';
import { VillageDirectory } from './village-directory';
import { VillageDebug } from './village-debug';
import { VillageOnboarding } from './village-onboarding';
import type { GameProps } from '../shared';
import styles from './village-scene.module.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
export type VillageSceneProps = Pick<GameProps, 'view' | 'village'> & {
  selected: VillageSelection | null;
  onSelect: (building: VillageSelection) => void;
  onWorldMap?: () => void;
};

export function VillageScene({ view, village, selected, onSelect, onWorldMap }: VillageSceneProps) {
  const scene = useRef<VillageSceneHandle>(null);
  const [quality, setQuality] = useState<VillageQuality>('auto');
  const [labels, setLabels] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [debug, setDebug] = useState<VillageDebugOptions>({});
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => true,
  );
  const options = useMemo(
    () => ({
      ...debug,
      animations: !paused && debug.animations !== false,
      npcs: debug.npcs !== false,
    }),
    [debug, paused],
  );
  const focusTour = useCallback((target: VillageTarget) => scene.current?.focusOn(target), []);
  const reset = useCallback(() => scene.current?.reset(), []);
  const onReady = useCallback(() => setReady(true), []);
  const choose = useCallback((building: VillageSelection) => {
    scene.current?.focusOn(building, () => onSelect(building));
  }, [onSelect]);
  return (
    <section className={styles.scene} aria-label="خريطة القرية" data-expanded={expanded}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>مشهد القرية · اختر مبنى لإدارته</p>
          <h2>{village.name}</h2>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.coordinates} dir="ltr">X {village.x} / Y {village.y}</span>
          <Button variant="outline" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
            {expanded ? 'العرض العادي' : 'توسيع المشهد'}
          </Button>
        </div>
      </header>
      <VillageProgress village={village} config={view.config} />
      <div className={styles.workspace}>
        <VillageCanvas
          ref={scene}
          view={view}
          village={village}
          selected={selected}
          onSelect={onSelect}
          onWorldMap={onWorldMap}
          quality={quality}
          reducedMotion={reducedMotion}
          showLabels={labels}
          debug={options}
          onReady={onReady}
        />
        <VillageDirectory view={view} village={village} selected={selected} onSelect={choose} />
      </div>
      <VillageActivity view={view} village={village} onFocus={choose} />
      <div className={styles.controls} role="group" aria-label="كاميرا القرية">
        <Button
          variant="outline"
          aria-label="تكبير القرية"
          onClick={() => scene.current?.zoomBy(1.25)}
        >
          <ZoomIn size={18} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          aria-label="تصغير القرية"
          onClick={() => scene.current?.zoomBy(0.8)}
        >
          <ZoomOut size={18} aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={reset}>
          <Maximize size={18} aria-hidden="true" />
          عرض القرية بالكامل
        </Button>
        <Button
          variant="outline"
          aria-pressed={labels}
          onClick={() => setLabels((shown) => !shown)}
        >
          <Tags size={18} aria-hidden="true" />
          إظهار أسماء المباني
        </Button>
        <Button
          variant="outline"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          {paused ? 'تشغيل الحركة' : 'إيقاف الحركة'}
        </Button>
        <details>
          <summary>تحريك الخريطة</summary>
          <div className={styles.pan}>
            <Button
              variant="outline"
              aria-label="تحريك القرية يمينًا"
              onClick={() => scene.current?.panBy(-100, 0)}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              aria-label="تحريك القرية يسارًا"
              onClick={() => scene.current?.panBy(100, 0)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              aria-label="تحريك القرية للأعلى"
              onClick={() => scene.current?.panBy(0, 100)}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              aria-label="تحريك القرية للأسفل"
              onClick={() => scene.current?.panBy(0, -100)}
            >
              <ArrowDown size={18} aria-hidden="true" />
            </Button>
          </div>
        </details>
      </div>
      <div className={styles.settings}>
        <Select
          label="اختر مبنى من الخريطة"
          value={selected ?? ''}
          onChange={(event) => {
            if (event.target.value) {
              const building = event.target.value as VillageSelection;
              scene.current?.focusOn(building, () => onSelect(building));
            }
          }}
        >
          <option value="" disabled>
            اختر مبنى
          </option>
          {buildingKeys.map((building) => (
            <option key={building} value={building}>
              {view.config.buildings[building].name} · {village.buildings[building]}
            </option>
          ))}
          <option value="stable">
            الإسطبل · مستوى الثكنة {village.buildings.barracks}
          </option>
        </Select>
        <Select
          label="جودة المشهد"
          value={quality}
          onChange={(event) => setQuality(event.target.value as VillageQuality)}
        >
          <option value="auto">تلقائية</option>
          <option value="high">عالية</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </Select>
      </div>
      <p className={styles.hint}>
        اسحب للتحريك، واستخدم عجلة الماوس أو إصبعين للتكبير. لوحة المفاتيح: الأسهم للتحريك، + و−
        للتكبير، و0 لعرض القرية.
      </p>
      {view.player && (
        <VillageOnboarding
          key={view.player.id}
          accountId={view.player.id}
          ready={ready}
          focus={focusTour}
          onComplete={reset}
        />
      )}
      {process.env.NODE_ENV === 'development' && (
        <VillageDebug view={view} options={debug} onChange={setDebug}
          getCamera={() => scene.current?.getSnapshot()} />
      )}
    </section>
  );
}
