'use client';
import { VillageProgress } from './village-progress';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Pause,
  Play,
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
import { VillageIncomingAlert } from '../incoming-alert';
import { hostileThreats, presentIncomingThreats, villageIncoming } from '@/lib/kingdoms/incoming-threats';
import { villageVisualPresentation } from '@/lib/kingdoms/village/visual-tier';
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
  onShowMap?: (villageId: string) => void;
  onRefresh?: () => void;
};

export function VillageScene({ view, village, selected, onSelect, onWorldMap, onShowMap, onRefresh }: VillageSceneProps) {
  const scene = useRef<VillageSceneHandle>(null);
  const [quality, setQuality] = useState<VillageQuality>('auto');
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
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
    setDirectoryOpen(false);
    onSelect(building);
  }, [onSelect]);
  const incoming = presentIncomingThreats(view.incoming ?? [], view.serverNow);
  const hostile = hostileThreats(villageIncoming(incoming, village.id));
  const threatSeverity = hostile[0]?.severity === 'CRITICAL' || hostile[0]?.severity === 'DANGER'
    ? hostile[0].severity
    : undefined;
  const look = villageVisualPresentation(village.progression?.visualTier);
  return (
    <section
      className={styles.scene}
      aria-label="خريطة القرية"
      data-expanded="true"
      data-visual-tier={look.tier}
    >
      <div className={styles.lead}>
        <VillageIncomingAlert
          incoming={view.incoming ?? []}
          village={village}
          view={view}
          onShowMap={onShowMap}
          onRefresh={onRefresh}
        />
      </div>
      <header className={styles.header}>
        <span className={styles.coordinates} dir="ltr">X {village.x} / Y {village.y}</span>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            aria-expanded={directoryOpen}
            aria-controls="village-directory"
            onClick={() => setDirectoryOpen((open) => !open)}
          >
            دليل المباني
          </Button>
          <details className={styles.tools}>
            <summary>أدوات المشهد</summary>
            <div className={styles.toolsPanel}>
              <VillageProgress
                village={village}
                config={view.config}
                now={view.serverNow}
                onOpenConstruction={() => choose(village.build?.building ?? 'hall')}
                onOpenMilitary={() => choose(village.training?.unit === 'rider' ? 'stable' : 'barracks')}
                onOpenActivity={() => {
                  document.querySelector<HTMLElement>('[aria-label="نشاط القرية"]')?.scrollIntoView({
                    block: 'nearest',
                  });
                }}
              />
              <VillageActivity view={view} village={village} onFocus={choose} onShowMap={onShowMap} onRefresh={onRefresh} />
              <div className={styles.controls} role="group" aria-label="عرض القرية">
                <Button
                  variant="outline"
                  aria-pressed={paused}
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
                  {paused ? 'تشغيل الحركة' : 'إيقاف الحركة'}
                </Button>
              </div>
              <div className={styles.settings}>
                <Select
                  label="اختر مبنى من الخريطة"
                  value={selected ?? ''}
                  onChange={(event) => {
                    if (event.target.value) choose(event.target.value as VillageSelection);
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
                القرية ثابتة في الإطار. اختر مبنى بالضغط أو من الدليل، أو بلوحة المفاتيح عبر التركيز ثم Enter.
              </p>
              <ul className={styles.districts} aria-label="مناطق القرية">
                <li>الإدارة</li>
                <li>العسكر</li>
                <li>الاقتصاد</li>
                <li>الموارد</li>
                <li>الدفاع</li>
              </ul>
              {process.env.NODE_ENV === 'development' && (
                <VillageDebug view={view} options={debug} onChange={setDebug}
                  getCamera={() => scene.current?.getSnapshot()} />
              )}
            </div>
          </details>
        </div>
      </header>
      <div className={styles.workspace}>
        <VillageCanvas
          ref={scene}
          view={view}
          village={village}
          selected={selected}
          onSelect={choose}
          onWorldMap={onWorldMap}
          quality={quality}
          reducedMotion={reducedMotion}
          showLabels={true}
          showThreatMarker={hostile.length > 0}
          threatSeverity={threatSeverity}
          debug={options}
          onReady={onReady}
        />
        {directoryOpen && (
          <div className={styles.directoryLayer} id="village-directory">
            <VillageDirectory view={view} village={village} selected={selected} onSelect={choose} />
          </div>
        )}
      </div>
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
