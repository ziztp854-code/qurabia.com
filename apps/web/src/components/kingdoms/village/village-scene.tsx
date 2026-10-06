'use client';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Settings2,
  Maximize,
  Pause,
  Play,
  Tags,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { buildingKeys } from '@/lib/kingdoms/types';
import { trainingBuilding } from '@/lib/kingdoms/training';
import type {
  VillageDebugOptions,
  VillageQuality,
  VillageSceneHandle,
  VillageSelection,
  VillageTarget,
} from '@/lib/kingdoms/village/types';
import { VillageActivity } from './village-activity';
import { VillageIncomingAlert } from '../incoming-alert';
import { hostileThreats, presentIncomingThreats, villageIncoming } from '@/lib/kingdoms/incoming-threats';
import { VillageDirectory } from './village-directory';
import { VillageCanvas } from './village-canvas';
import { VillageDebug } from './village-debug';
import { VillageOnboarding } from './village-onboarding';
import { VillageProgress } from './village-progress';
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
  onShowMap?: (villageId: string) => void;
  onRefresh?: () => void;
};

export function VillageScene({ view, village, selected, onSelect, onWorldMap, onShowMap, onRefresh }: VillageSceneProps) {
  const scene = useRef<VillageSceneHandle>(null);
  const [quality, setQuality] = useState<VillageQuality>('auto');
  const [labels, setLabels] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
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
  const incoming = presentIncomingThreats(view.incoming ?? [], view.serverNow);
  const hostile = hostileThreats(villageIncoming(incoming, village.id));
  const threatSeverity = hostile[0]?.severity === 'CRITICAL' || hostile[0]?.severity === 'DANGER' ? hostile[0].severity : undefined;
  const choose = (building: VillageSelection) => scene.current?.focusOn(building, () => onSelect(building));
  return (
    <section className={styles.scene} aria-label="خريطة القرية">
      <div className={styles.incoming}><VillageIncomingAlert incoming={view.incoming ?? []} village={village} view={view} onShowMap={onShowMap} onRefresh={onRefresh} /></div>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>تحدي المماليك</p>
          <h2>{village.name}</h2>
        </div>
        <span className={styles.coordinates} dir="ltr">
          X {village.x} / Y {village.y}
        </span>
      </header>
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
        showThreatMarker={hostile.length > 0}
        threatSeverity={threatSeverity}
        debug={options}
        onReady={onReady}
      />
      <div className={styles.controls} role="group" aria-label="كاميرا القرية">
        <div className={styles.presets} role="group" aria-label="مستويات عرض المملكة">
          <button type="button" onClick={() => scene.current?.zoomTo(2.8)}>المدينة</button>
          <button type="button" onClick={() => scene.current?.zoomTo(1.8)}>القرية</button>
          <button type="button" onClick={() => onWorldMap ? onWorldMap() : scene.current?.zoomTo(1)}>
            {onWorldMap ? 'الإقليم' : 'المحيط'}
          </button>
        </div>
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
        <Button variant="outline" aria-label="عرض القرية بالكامل" title="عرض القرية بالكامل" onClick={reset}>
          <Maximize size={18} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          aria-pressed={labels}
          aria-label="إظهار أسماء المباني"
          title="إظهار أسماء المباني"
          onClick={() => setLabels((shown) => !shown)}
        >
          <Tags size={18} aria-hidden="true" />
        </Button>
      </div>
      <details className={styles.preferences}>
        <summary><Settings2 size={18} aria-hidden="true" /><span>إعدادات القرية</span></summary>
        <VillageProgress village={village} config={view.config} now={view.serverNow}
          onOpenConstruction={() => choose(village.build?.building ?? 'hall')}
          onOpenMilitary={() => choose(village.training ? trainingBuilding(village.training.unit) : 'barracks')}
          onOpenActivity={() => document.querySelector<HTMLElement>('[aria-label="نشاط القرية"]')?.scrollIntoView({ block: 'nearest' })} />
        <details><summary>نشاط القرية</summary><VillageActivity view={view} village={village} onFocus={choose} onShowMap={onShowMap} onRefresh={onRefresh} /></details>
        <details><summary>دليل المباني</summary><VillageDirectory view={view} village={village} selected={selected} onSelect={choose} /></details>
        <div className={styles.advancedControls}>
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
              choose(building);
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
          <option value="rally">نقطة تجمع الجيوش</option>
        </Select>
        <Select
          label="جودة المشهد"
          value={quality}
          onChange={(event) => setQuality(event.target.value as VillageQuality)}
        >
          <option value="auto">تلقائية</option>
          <option value="ultra">فائقة</option>
          <option value="high">عالية</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </Select>
      </div>
      <p className={styles.hint}>
        اسحب للتحريك، واستخدم عجلة الماوس أو إصبعين للتكبير. لوحة المفاتيح: الأسهم للتحريك، + و−
        للتكبير، و0 لعرض القرية.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <VillageDebug view={view} options={debug} onChange={setDebug}
          getCamera={() => scene.current?.getSnapshot()} />
      )}
      </details>
      {view.player && (
        <VillageOnboarding
          key={view.player.id}
          accountId={view.player.id}
          ready={ready}
          focus={focusTour}
          onComplete={reset}
        />
      )}
    </section>
  );
}
