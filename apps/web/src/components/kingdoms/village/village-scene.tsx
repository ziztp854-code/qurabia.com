'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
} from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { buildingKeys } from '@/lib/kingdoms/types';
import { trainingBuilding } from '@/lib/kingdoms/training';
import type {
  VillageDebugOptions,
  VillageCanvasProps,
  VillageQuality,
  VillageSceneHandle,
  VillageSelection,
  VillageTarget,
  CameraSnapshot,
} from '@/lib/kingdoms/village/types';
import { VillageActivity } from './village-activity';
import { VillageIncomingAlert } from '../incoming-alert';
import { ControlIcon } from '../control-icon';
import { hostileThreats, presentIncomingThreats, villageIncoming } from '@/lib/kingdoms/incoming-threats';
import { VillageDirectory } from './village-directory';
import { VillageCanvas } from './village-canvas';
import { VillageDebug } from './village-debug';
import { VillageOnboarding } from './village-onboarding';
import { VillageProgress } from './village-progress';
import type { GameProps } from '../shared';
import { citySceneForBuilding, prefetchCityScene } from './city-scenes';
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
  dedicatedNavigation?: boolean;
  active?: boolean;
  onFacilitySelect?: VillageCanvasProps['onFacilitySelect'];
};

export function VillageScene({ view, village, selected, onSelect, onWorldMap, onShowMap, onRefresh, dedicatedNavigation = false, active = true, onFacilitySelect }: VillageSceneProps) {
  const scene = useRef<VillageSceneHandle>(null);
  const overview = useRef<CameraSnapshot | null>(null);
  const captureOverview = useCallback(() => {
    if (!overview.current) overview.current = scene.current?.getSnapshot() ?? null;
  }, []);
  useEffect(() => {
    if (!active) scene.current?.stop?.();
    else if (overview.current) { scene.current?.restore?.(overview.current); overview.current = null; }
  }, [active]);
  const [tourRequest, setTourRequest] = useState(0);
  const [quality, setQuality] = useState<VillageQuality>('auto');
  const [labels, setLabels] = useState(!dedicatedNavigation);
  const [focusedDistrict, setFocusedDistrict] = useState<{ target: VillageSelection; label: string } | null>(null);
  const [districtsOpen, setDistrictsOpen] = useState(false);
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
      animations: active && !paused && debug.animations !== false,
      npcs: debug.npcs !== false,
    }),
    [debug, paused, active],
  );
  const focusTour = useCallback((target: VillageTarget) => scene.current?.focusOn(target), []);
  const reset = useCallback(() => { setFocusedDistrict(null); scene.current?.reset(); }, []);
  const onReady = useCallback(() => setReady(true), []);
  const incoming = presentIncomingThreats(view.incoming ?? [], view.serverNow);
  const hostile = hostileThreats(villageIncoming(incoming, village.id));
  const threatSeverity = hostile[0]?.severity === 'CRITICAL' || hostile[0]?.severity === 'DANGER' ? hostile[0].severity : undefined;
  const choose = (building: VillageSelection) => {
    if (dedicatedNavigation) { captureOverview(); prefetchCityScene(citySceneForBuilding(building)); scene.current?.focusForScene?.(building, () => onSelect(building)); }
    else scene.current?.focusOn(building, () => onSelect(building));
  };
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
        active={active}
        dedicatedNavigation={dedicatedNavigation}
        onSelectionStart={dedicatedNavigation ? captureOverview : undefined}
        onFacilitySelect={onFacilitySelect}
        onPrefetch={dedicatedNavigation ? (building) => prefetchCityScene(citySceneForBuilding(building)) : undefined}
      />
      {dedicatedNavigation && focusedDistrict && (
        <div className={styles.districtAction} role="region" aria-label="المبنى المختار">
          <button type="button" className={styles.dismissDistrict} aria-label="إغلاق بطاقة المنطقة" onClick={() => setFocusedDistrict(null)}>×</button>
          <div><span>استكشاف المنطقة</span><strong>{focusedDistrict.label}</strong></div>
          <button type="button" onClick={() => choose(focusedDistrict.target)}>
            فتح {focusedDistrict.label}
          </button>
        </div>
      )}
      {dedicatedNavigation && (
        <nav className={styles.districts} aria-label="استكشاف مناطق القرية" data-open={districtsOpen}>
          <button type="button" className={styles.districtToggle} aria-expanded={districtsOpen} onClick={() => setDistrictsOpen((open) => !open)}>مناطق القرية</button>
          <div className={styles.districtList}>
            {([
              ['hall', 'القصر'],
              ['barracks', 'الجيش'],
              ['farm', 'المزارع'],
              ['market', 'السوق'],
            ] as const).map(([target, label]) => (
              <button key={target} type="button" aria-label={`عرض ${label}`} disabled={!ready} onClick={() => { setDistrictsOpen(false); setFocusedDistrict({ target, label }); scene.current?.focusOn(target); }}>
                <span className={styles.districtIcon} data-district-icon={target} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <div className={styles.controls} role="group" aria-label="كاميرا القرية">
        <div className={styles.presets} role="group" aria-label="مستويات عرض المملكة">
          <button type="button" onClick={() => dedicatedNavigation ? reset() : scene.current?.zoomTo(2.8)}>المدينة</button>
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
          <ControlIcon name="zoom-in" />
        </Button>
        <Button
          variant="outline"
          aria-label="تصغير القرية"
          onClick={() => scene.current?.zoomBy(0.8)}
        >
          <ControlIcon name="zoom-out" />
        </Button>
        <Button variant="outline" aria-label="عرض القرية بالكامل" title="عرض القرية بالكامل" onClick={reset}>
          <ControlIcon name="overview" />
        </Button>
        <Button
          variant="outline"
          aria-pressed={labels}
          aria-label="إظهار أسماء المباني"
          title="إظهار أسماء المباني"
          onClick={() => setLabels((shown) => !shown)}
        >
          <ControlIcon name="labels" />
        </Button>
      </div>
      <details className={styles.preferences}>
        <summary><ControlIcon name="settings" /><span>إعدادات القرية</span></summary>
        {dedicatedNavigation && <Button variant="outline" disabled={!ready} onClick={() => setTourRequest((request) => request + 1)}>جولة في المدينة</Button>}
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
        {onFacilitySelect && <Button variant="outline" onPointerEnter={() => prefetchCityScene('siege-workshop')} onFocus={() => prefetchCityScene('siege-workshop')} onClick={() => { captureOverview(); scene.current?.focusForScene?.('siege', () => onFacilitySelect('siege-workshop')); }}>ورشة الحصار</Button>}
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
      {view.player && (!dedicatedNavigation || tourRequest > 0) && (
        <VillageOnboarding
          key={`${view.player.id}:${tourRequest}`}
          accountId={view.player.id}
          ready={ready}
          focus={focusTour}
          replay={dedicatedNavigation}
          onComplete={() => { reset(); setTourRequest(0); }}
        />
      )}
    </section>
  );
}
