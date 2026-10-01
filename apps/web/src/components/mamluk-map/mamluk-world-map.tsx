'use client';

import {
  Castle,
  Compass,
  Eye,
  Flag,
  Globe,
  Map,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Shield,
  Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { geographicMapHref, villageManagementHref } from '@/components/kingdoms/map-links';
import 'maplibre-gl/dist/maplibre-gl.css';
import { findSelection, listSelectableFeatures } from './selection';
import { SelectionPanel } from './selection-panel';
import { useWorldMap } from './use-world-map';
import styles from './mamluk-world-map.module.css';

export interface MamlukWorldMapProps {
  readonly worlds: readonly { readonly id: string; readonly name: string }[];
  readonly initialWorldId: string;
  readonly viewerPlayerId: string;
  readonly referenceOnly?: boolean;
  readonly initialLocation?: { readonly longitude: number; readonly latitude: number };
  readonly initialVillageId?: string;
  readonly villageLocations?: readonly {
    readonly villageId: string;
    readonly name: string;
    readonly longitude: number;
    readonly latitude: number;
  }[];
}
const messages = {
  loading: 'جارٍ استطلاع المشهد…',
  ready: 'رؤيتك الحالية',
  zoom: 'قرّب الخريطة لعرض المواقع',
  error: 'تعذر تحديث الخريطة. أعد المحاولة.',
};

export function MamlukWorldMap({
  worlds,
  initialWorldId,
  viewerPlayerId,
  referenceOnly = false,
  initialLocation,
  initialVillageId,
  villageLocations,
}: MamlukWorldMapProps) {
  const router = useRouter();
  const [worldId, setWorldId] = useState(initialWorldId);
  return (
    <WorldScene
      key={`${worldId}:${viewerPlayerId}:${referenceOnly}`}
      worlds={worlds}
      worldId={worldId}
      viewerPlayerId={viewerPlayerId}
      referenceOnly={referenceOnly}
      initialLocation={initialLocation}
      initialVillageId={initialVillageId}
      villageLocations={villageLocations}
      onWorldChange={(id) =>
        villageLocations ? router.push(geographicMapHref(id)) : setWorldId(id)
      }
    />
  );
}

function WorldScene({
  worlds,
  worldId,
  viewerPlayerId,
  referenceOnly = false,
  initialLocation,
  initialVillageId,
  villageLocations,
  onWorldChange,
}: Omit<MamlukWorldMapProps, 'initialWorldId'> & {
  worldId: string;
  onWorldChange: (id: string) => void;
}) {
  const {
    container,
    status,
    payload,
    selected,
    setSelected,
    projection,
    setProjection,
    moveCamera,
    refresh,
  } = useWorldMap(worldId, viewerPlayerId, initialLocation, initialVillageId);
  const selection = useMemo(
    () => findSelection(payload, selected, viewerPlayerId, referenceOnly),
    [payload, selected, viewerPlayerId, referenceOnly],
  );
  const features = useMemo(
    () => listSelectableFeatures(payload, referenceOnly),
    [payload, referenceOnly],
  );
  const ownVillage =
    selection?.layer === 'cities' &&
    villageLocations?.find((village) => village.villageId === selection.id);
  const approvedCity = payload?.layers.cities.features.find(
    (feature) => feature.id === selection?.id,
  );
  const managementHref =
    !referenceOnly && ownVillage && approvedCity?.properties.ownerPlayerId === viewerPlayerId
      ? villageManagementHref(worldId, ownVillage.villageId)
      : undefined;
  const statusMessage = referenceOnly
    ? status === 'ready'
      ? 'مدن الأطلس الجغرافي'
      : status === 'loading'
        ? 'جارٍ تحميل الأطلس…'
        : messages[status]
    : messages[status];
  return (
    <section
      className={styles.root}
      dir="rtl"
      aria-label={referenceOnly ? 'أطلس جغرافي' : 'خريطة حروب المماليك'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelected(null);
      }}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <Compass size={32} aria-hidden="true" />
          <div>
            <p className={styles.eyebrow}>
              {referenceOnly
                ? 'أطلس جغرافي · مدن مصر والشام والحجاز'
                : 'حروب المماليك · أطلس العالم'}
            </p>
            <h1>خريطة العالم</h1>
          </div>
        </div>
        <label className={styles.worldSelect}>
          العالم
          <select value={worldId} onChange={(event) => onWorldChange(event.target.value)}>
            {worlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {!referenceOnly && Boolean(villageLocations?.length) && (
        <nav className={styles.villageNavigation} aria-label="قراي">
          <span className={styles.villageCaption}>
            <Castle size={18} aria-hidden="true" /> قراي
          </span>
          <div className={styles.villageLinks}>
            {villageLocations?.map((village) => (
              <Link
                key={village.villageId}
                href={geographicMapHref(worldId, village.villageId)}
                aria-current={village.villageId === initialVillageId ? 'location' : undefined}
              >
                <MapPin size={16} aria-hidden="true" />
                {village.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
      {referenceOnly && (
        <p className={styles.referenceNotice}>
          لا توجد حملة متصلة. استكشف مواقع المدن بإحداثياتها الجغرافية.
        </p>
      )}
      <div className={styles.workspace}>
        <div className={styles.mapFrame}>
          <div
            ref={container}
            className={styles.canvas}
            role="region"
            aria-label={referenceOnly ? 'الخريطة الجغرافية' : 'الخريطة الاستراتيجية'}
          />
          <div className={styles.toolbar} role="group" aria-label="عرض الخريطة">
            <button
              className={styles.control}
              type="button"
              aria-pressed={projection === 'globe'}
              onClick={() => setProjection('globe')}
            >
              <Globe size={18} aria-hidden="true" />
              الكرة الأرضية
            </button>
            <button
              className={styles.control}
              type="button"
              aria-pressed={projection === 'mercator'}
              onClick={() => setProjection('mercator')}
            >
              <Map size={18} aria-hidden="true" />
              خريطة مسطحة
            </button>
          </div>
          <div className={styles.navigation} role="group" aria-label="التنقل على الخريطة">
            <button
              className={styles.iconButton}
              type="button"
              aria-label="قرّب الخريطة"
              onClick={() => moveCamera('in')}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="أبعد الخريطة"
              onClick={() => moveCamera('out')}
            >
              <Minus size={20} aria-hidden="true" />
            </button>
            <button
              className={styles.iconButton}
              type="button"
              aria-label={initialLocation ? 'انتقل إلى قريتك' : 'انتقل إلى القاهرة'}
              onClick={() => moveCamera('home')}
            >
              <Target size={20} aria-hidden="true" />
            </button>
          </div>
          <div
            className={`${styles.status} ${status === 'error' ? styles.error : ''}`}
            role={status === 'error' ? 'alert' : 'status'}
          >
            {referenceOnly ? (
              <MapPin size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
            <span>{statusMessage}</span>
            {status === 'error' && (
              <button
                className={styles.iconButton}
                type="button"
                aria-label="أعد محاولة تحميل الخريطة"
                onClick={refresh}
              >
                <RefreshCw size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <SelectionPanel
          selection={managementHref && selection ? { ...selection, kind: 'قرية' } : selection}
          managementHref={managementHref}
          referenceOnly={referenceOnly}
          selectedKey={selected}
          features={features}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      </div>
      <footer className={styles.legend} aria-label="مفتاح الخريطة">
        <span>
          <MapPin size={16} aria-hidden="true" />
          المدن
        </span>
        {!referenceOnly && (
          <>
            <span>
              <Map size={16} aria-hidden="true" />
              حدود القرى
            </span>
            <span>
              <Castle size={16} aria-hidden="true" />
              القلاع
            </span>
            <span>
              <Flag size={16} aria-hidden="true" />
              الجيوش
            </span>
            <span>
              <Shield size={16} aria-hidden="true" />
              الحصار
            </span>
          </>
        )}
        <p className={styles.help}>حرّك الخريطة بالأسهم، أو اختر موقعًا من القائمة.</p>
        <p className={styles.help}>الخلفية من خريطتك المرجعية، وحدود القرى باللون الذهبي.</p>
        <p className={styles.help}>
          إحداثيات المدن: <a href="https://www.geonames.org/">GeoNames</a> ·{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
        </p>
      </footer>
    </section>
  );
}
