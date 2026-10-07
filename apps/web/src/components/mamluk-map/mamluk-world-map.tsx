'use client';

import {
  Castle,
  Compass,
  Eye,
  Flag,
  Globe,
  Layers,
  Map,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Shield,
  Target,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { geographicMapHref, villageManagementHref } from '@/components/kingdoms/map-links';
import 'maplibre-gl/dist/maplibre-gl.css';
import { findSelection, listSelectableFeatures } from './selection';
import { SelectionPanel } from './selection-panel';
import { useWorldMap } from './use-world-map';
import { MapLayerControls } from './map-layer-controls';
import { getPlayerColor } from './player-ownership';
import styles from './mamluk-world-map.module.css';
import type { VillageRelocationEligibility } from './use-village-relocation';
import type { MapMode } from './map-mode';

export interface MamlukWorldMapProps {
  readonly mode?: MapMode;
  readonly onModeChange?: (mode: MapMode) => void;
  readonly onConfirmTarget?: (villageId: string) => void;
  readonly targetVillageIds?: readonly string[];
  readonly onCancelTarget?: () => void;
  readonly focusVillageId?: string;
  readonly worlds: readonly { readonly id: string; readonly name: string }[];
  readonly initialWorldId: string;
  readonly viewerPlayerId: string;
  readonly referenceOnly?: boolean;
  readonly initialLocation?: { readonly longitude: number; readonly latitude: number };
  readonly initialVillageId?: string;
  readonly initialOverview?: boolean;
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
const ownerColors = {
  own: 'var(--map-owner-self)',
  neutral: 'var(--map-owner-neutral)',
  selected: 'var(--map-owner-selected)',
  halo: 'var(--map-owner-halo)',
  players: Array.from({ length: 6 }, (_, index) => `var(--map-owner-${index + 1})`),
};
const number = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const modeLabels: Record<MapMode, string> = {
  WORLD: 'استكشف العالم',
  SELECT_ATTACK_TARGET: 'اختر هدف الهجوم',
  SELECT_SCOUT_TARGET: 'اختر هدف الاستطلاع',
  SELECT_REINFORCEMENT_TARGET: 'اختر هدف التعزيز',
  SELECT_SETTLEMENT_TARGET: 'اختر موقع الاستيطان',
};

export function MamlukWorldMap({
  worlds,
  initialWorldId,
  viewerPlayerId,
  referenceOnly = false,
  initialLocation,
  initialVillageId,
  villageLocations,
  ...modeProps
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
      {...modeProps}
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
  mode = 'WORLD',
  onModeChange,
  onConfirmTarget,
  targetVillageIds,
  onCancelTarget,
  focusVillageId,
  initialOverview = false,
}: Omit<MamlukWorldMapProps, 'initialWorldId'> & {
  worldId: string;
  onWorldChange: (id: string) => void;
}) {
  const router = useRouter();
  const destinationInstructionsId = useId();
  const [relocatedLocation, setRelocatedLocation] = useState<{
    longitude: number;
    latitude: number;
  } | null>(null);
  const longitude = relocatedLocation?.longitude ?? initialLocation?.longitude;
  const latitude = relocatedLocation?.latitude ?? initialLocation?.latitude;
  const cameraLocation = useMemo(
    () => (longitude === undefined || latitude === undefined ? undefined : { longitude, latitude }),
    [longitude, latitude],
  );
  const {
    container,
    visibleLayers,
    toggleLayer,
    status,
    refreshing,
    payload,
    publicPayload,
    overviewPayload,
    selected,
    setSelected,
    projection,
    setProjection,
    moveCamera,
    focusSelection,
    focusLocation,
    refresh,
    destination,
    isPickingDestination,
    manualEntryRequested,
    startPickingDestination,
    reviewDestination,
    useMapCenterDestination,
    cancelDestination,
    changeDestination,
    requestManualDestination,
  } = useWorldMap(worldId, viewerPlayerId, cameraLocation, initialVillageId, initialOverview);
  const scenePayload = payload ?? publicPayload;
  const overviewVillageCount = overviewPayload?.cells.features.reduce(
    (sum, cell) => sum + cell.properties.count,
    0,
  );
  const lastFocused = useRef<string | undefined>(undefined);
  const [locationFailure, setLocationFailure] = useState<string | null>(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const hasFocusVillage = Boolean(
    scenePayload?.layers.cities.features.some((city) => city.id === focusVillageId),
  );
  useEffect(() => {
    if (!focusVillageId) {
      lastFocused.current = undefined;
      return;
    }
    if (
      lastFocused.current === focusVillageId ||
      !scenePayload?.layers.cities.features.some((city) => city.id === focusVillageId)
    )
      return;
    lastFocused.current = focusVillageId;
    focusSelection({ layer: 'cities', id: focusVillageId });
  }, [focusVillageId, scenePayload, focusSelection]);
  useEffect(() => {
    if (
      !focusVillageId ||
      hasFocusVillage ||
      lastFocused.current === focusVillageId ||
      referenceOnly
    )
      return;
    const controller = new AbortController();
    const query = new URLSearchParams({ worldId, villageId: focusVillageId });
    void fetch(`/api/kingdoms/world-map/location?${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const location = await response.json();
        if (
          !response.ok ||
          location?.worldId !== worldId ||
          location?.villageId !== focusVillageId ||
          !Number.isFinite(location.longitude) ||
          !Number.isFinite(location.latitude) ||
          Math.abs(location.longitude) > 180 ||
          Math.abs(location.latitude) > 90
        )
          throw new Error('unavailable');
        if (controller.signal.aborted) return;
        lastFocused.current = focusVillageId;
        setLocationFailure(null);
        focusLocation({ longitude: location.longitude, latitude: location.latitude });
        setSelected({ layer: 'cities', id: focusVillageId });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocationFailure(focusVillageId);
      });
    return () => controller.abort();
  }, [
    focusVillageId,
    hasFocusVillage,
    worldId,
    referenceOnly,
    focusLocation,
    setSelected,
    locationAttempt,
  ]);
  const closeSelection = () => {
    setSelected(null);
    container.current?.focus({ preventScroll: true });
  };
  const selection = useMemo(() => {
    const current = findSelection(payload, selected, viewerPlayerId, referenceOnly);
    if (current) return current;
    if (!referenceOnly) {
      const retained = findSelection(publicPayload, selected, viewerPlayerId, false);
      if (retained?.kind === 'قرية') return retained;
    }
    const publicCity = findSelection(publicPayload, selected, viewerPlayerId, true);
    if (!publicCity) return null;
    const owner = publicPayload?.layers.cities.features.find((city) => city.id === publicCity.id)
      ?.properties.ownerPlayerId;
    return {
      ...publicCity,
      kind: referenceOnly ? 'مرجع جغرافي' : 'قرية',
      details: referenceOnly
        ? []
        : [
            {
              label: 'الملكية',
              value:
                owner === viewerPlayerId
                  ? 'تحت رايتك'
                  : owner === null
                    ? 'مستقلة'
                    : 'تحت راية أخرى',
            },
          ],
    };
  }, [payload, publicPayload, selected, viewerPlayerId, referenceOnly]);
  const features = useMemo(
    () =>
      listSelectableFeatures(scenePayload, referenceOnly).filter(
        (feature) => visibleLayers[feature.layer === 'sieges' ? 'armies' : feature.layer],
      ),
    [scenePayload, referenceOnly, visibleLayers],
  );
  const ownerGroups = useMemo(() => {
    if (referenceOnly || !scenePayload) return [];
    const owners = [
      ...new Set(
        scenePayload.layers.territories.features.map((feature) =>
          typeof feature.properties.ownerPlayerId === 'string'
            ? feature.properties.ownerPlayerId
            : null,
        ),
      ),
    ];
    return owners
      .sort((left, right) =>
        left === viewerPlayerId
          ? -1
          : right === viewerPlayerId
            ? 1
            : (left ?? '').localeCompare(right ?? ''),
      )
      .map((ownerPlayerId) => {
        const cities = scenePayload.layers.cities.features.filter(
          (city) => city.properties.ownerPlayerId === ownerPlayerId,
        );
        const names = cities
          .map((city) => String(city.properties.name))
          .slice(0, 2)
          .join('، ');
        const label =
          ownerPlayerId === viewerPlayerId
            ? `مملكتك${names ? `: ${names}` : ''}`
            : ownerPlayerId === null
              ? 'قرى مستقلة'
              : names
                ? `قرى ${names}`
                : 'حدود لاعب آخر';
        return {
          ownerPlayerId,
          label,
          cityId: cities[0]?.id,
          selected: selected?.layer === 'cities' && cities.some((city) => city.id === selected.id),
          color: getPlayerColor(ownerPlayerId, { viewerPlayerId, colors: ownerColors }),
          count: scenePayload.layers.territories.features.filter(
            (feature) => feature.properties.ownerPlayerId === ownerPlayerId,
          ).length,
        };
      });
  }, [referenceOnly, scenePayload, viewerPlayerId, selected]);
  const pendingTitle =
    selected?.layer === 'cities'
      ? scenePayload?.layers.cities.features.find((city) => city.id === selected.id)?.properties
          .name
      : undefined;
  const ownVillage =
    selection?.layer === 'cities' &&
    villageLocations?.find((village) => village.villageId === selection.id);
  const approvedCity = payload?.layers.cities.features.find(
    (feature) => feature.id === selection?.id,
  );
  const publicCity = scenePayload?.layers.cities.features.find(
    (feature) => feature.id === selection?.id,
  );
  const managementHref =
    !referenceOnly && ownVillage && publicCity?.properties.ownerPlayerId === viewerPlayerId
      ? villageManagementHref(worldId, ownVillage.villageId)
      : undefined;
  const relocationVillage =
    !referenceOnly && selected?.layer === 'cities'
      ? villageLocations?.find((village) => village.villageId === selected.id)
      : undefined;
  const onRelocated = (result: VillageRelocationEligibility) => {
    cancelDestination();
    setRelocatedLocation({ longitude: result.longitude, latitude: result.latitude });
    router.replace(geographicMapHref(worldId, result.villageId));
    router.refresh();
    refresh();
  };
  const statusMessage =
    refreshing && scenePayload
      ? 'جارٍ تحديث المشهد…'
      : referenceOnly
        ? status === 'ready'
          ? 'مدن الأطلس الجغرافي'
          : status === 'loading'
            ? 'جارٍ تحميل الأطلس…'
            : messages[status]
        : messages[status];
  const canConfirm =
    !referenceOnly &&
    mode !== 'WORLD' &&
    mode !== 'SELECT_SETTLEMENT_TARGET' &&
    selection?.layer === 'cities' &&
    Boolean(approvedCity) &&
    Boolean(onConfirmTarget) &&
    Boolean(targetVillageIds?.includes(selection.id));
  return (
    <section
      className={styles.root}
      dir="rtl"
      aria-label={referenceOnly ? 'أطلس جغرافي' : 'خريطة حروب المماليك'}
      data-map-mode={mode}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (isPickingDestination) cancelDestination();
          else closeSelection();
        }
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
      {!referenceOnly && (
        <div className={styles.modeBar}>
          {onModeChange ? (
            <label>
              وضع الخريطة
              <select
                value={mode}
                onChange={(event) => onModeChange(event.target.value as MapMode)}
              >
                {Object.entries(modeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>{mode === 'WORLD' ? modeLabels.WORLD : 'اختيار هدف الحملة'}</span>
          )}
          {mode === 'SELECT_SETTLEMENT_TARGET' && (
            <p>
              اختيار أرض الاستيطان متاح في نموذج الإحداثيات الحالي؛ لا تتوفر معاينة جغرافية معتمدة
              للأرض الخالية.
            </p>
          )}
          {locationFailure === focusVillageId && locationFailure && (
            <p role="alert">
              تعذر تحديد موقع القرية.
              <button
                type="button"
                className={styles.control}
                onClick={() => setLocationAttempt((attempt) => attempt + 1)}
              >
                أعد تحديد الموقع
              </button>
            </p>
          )}
        </div>
      )}
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
      <div className={styles.sceneOverview} aria-label="المشهد الحالي">
        <div className={styles.sceneCount}>
          <MapPin size={16} aria-hidden="true" />
          <span>
            {number(overviewVillageCount ?? scenePayload?.layers.cities.features.length ?? 0)}
          </span>
          {referenceOnly ? 'مدينة في المشهد' : 'قرية في المشهد'}
        </div>
        {!referenceOnly && (
          <div className={styles.sceneCount}>
            <Flag size={16} aria-hidden="true" />
            <span>
              {overviewPayload && !scenePayload
                ? '—'
                : number(ownerGroups.filter((owner) => owner.ownerPlayerId !== null).length)}
            </span>
            ممالك ظاهرة
          </div>
        )}
        <p>اسحب للاستكشاف · قرّب لرؤية الحدود · اختر موقعًا للتفاصيل</p>
      </div>
      {!referenceOnly && (
        <details className={styles.layersDisclosure}>
          <summary>
            <Layers size={18} aria-hidden="true" />
            حدود الممالك
          </summary>
          <section className={styles.ownerLegend} aria-label="حدود الممالك">
            <div className={styles.ownerHeading}>
              <Layers size={20} aria-hidden="true" />
              <div>
                <h2>حدود الممالك</h2>
                <p>كل لون يجمع قرى اللاعب وحدودها. اختر راية لتفقد حدودها.</p>
              </div>
            </div>
            {ownerGroups.length ? (
              <ul className={styles.ownerList}>
                {ownerGroups.map((owner) => (
                  <li
                    key={owner.ownerPlayerId ?? 'neutral'}
                    style={{ '--owner-color': owner.color } as CSSProperties}
                  >
                    {owner.cityId ? (
                      <button
                        type="button"
                        aria-label={`استكشف حدود ${owner.label}`}
                        aria-pressed={owner.selected}
                        onClick={() => focusSelection({ layer: 'cities', id: owner.cityId! }, 11)}
                      >
                        <span className={styles.ownerSwatch} aria-hidden="true">
                          <Flag size={14} />
                        </span>
                        <span>{owner.label}</span>
                        <span className={styles.ownerCount}>{number(owner.count)} نطاق</span>
                        <Target size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className={styles.ownerItem}>
                        <span className={styles.ownerSwatch} aria-hidden="true">
                          <Flag size={14} />
                        </span>
                        <span>{owner.label}</span>
                        <span className={styles.ownerCount}>{number(owner.count)} نطاق</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.boundaryEmpty}>تظهر حدود الممالك مع القرى المتاحة في المشهد.</p>
            )}
          </section>
        </details>
      )}
      <div className={styles.workspace} data-picking-destination={isPickingDestination}>
        <div className={styles.mapFrame}>
          <div
            ref={container}
            className={styles.canvas}
            role="region"
            tabIndex={0}
            aria-label={referenceOnly ? 'الخريطة الجغرافية' : 'الخريطة الاستراتيجية'}
            aria-describedby={isPickingDestination ? destinationInstructionsId : undefined}
          />
          <div className={styles.toolbar} role="group" aria-label="عرض الخريطة">
            <MapLayerControls
              layers={visibleLayers}
              onChange={toggleLayer}
              villageWorld={Boolean(villageLocations)}
            />
            <button type="button" className={styles.control} onClick={() => moveCamera('kingdom')}>
              <Flag size={18} aria-hidden="true" />
              مملكتي
            </button>
            <details className={styles.displayOptions}>
              <summary className={styles.control}>
                <Layers size={18} aria-hidden="true" />
                عرض الخريطة
              </summary>
              <div className={styles.displayChoices}>
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
            </details>
            <button className={styles.control} type="button" onClick={() => moveCamera('overview')}>
              <Globe size={18} aria-hidden="true" />
              عرض الكرة بالكامل
            </button>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="حدّث الخريطة"
              disabled={status === 'loading'}
              onClick={refresh}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.navigation} role="group" aria-label="التنقل على الخريطة">
            <button
              type="button"
              className={styles.iconButton}
              aria-label="اضبط اتجاه الشمال"
              onClick={() => moveCamera('north')}
            >
              <Compass size={20} aria-hidden="true" />
            </button>
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
            data-state={status}
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
          {isPickingDestination && (
            <section className={styles.destinationPicker} aria-label="اختيار وجهة القرية">
              <div className={styles.destinationHeading}>
                <MapPin size={22} aria-hidden="true" />
                <h2>اختر الوجهة الجديدة</h2>
              </div>
              <p id={destinationInstructionsId}>
                اضغط على الخريطة لتحديد الوجهة، ثم راجعها قبل الموافقة.
              </p>
              <p className={styles.destinationSummary} role="status">
                {destination ? (
                  <>
                    <span>معاينة الوجهة</span>
                    <bdi dir="ltr">
                      {destination.longitude.toFixed(6)} / {destination.latitude.toFixed(6)}
                    </bdi>
                  </>
                ) : (
                  'لم تُحدد وجهة بعد. يمكنك أيضًا تحريك الخريطة بالأسهم واستخدام مركزها.'
                )}
              </p>
              <div className={styles.destinationActions}>
                <button
                  className={`${styles.control} ${styles.destinationReview}`}
                  type="button"
                  disabled={!destination}
                  onClick={reviewDestination}
                >
                  راجع الوجهة
                </button>
                <button className={styles.control} type="button" onClick={useMapCenterDestination}>
                  استخدم مركز الخريطة
                </button>
                <button className={styles.control} type="button" onClick={requestManualDestination}>
                  إدخال الإحداثيات يدويًا
                </button>
                <button className={styles.control} type="button" onClick={cancelDestination}>
                  إلغاء اختيار الوجهة
                </button>
              </div>
            </section>
          )}
        </div>
        <SelectionPanel
          selection={managementHref && selection ? { ...selection, kind: 'قرية' } : selection}
          managementHref={managementHref}
          referenceOnly={referenceOnly}
          selectedKey={selected}
          loading={(refreshing || status === 'loading') && Boolean(selected)}
          pendingTitle={typeof pendingTitle === 'string' ? pendingTitle : undefined}
          features={features}
          overviewVillageCount={overviewVillageCount}
          onSelect={focusSelection}
          onClose={closeSelection}
          targetSelection={
            !referenceOnly && mode !== 'WORLD'
              ? {
                  title: modeLabels[mode],
                  canConfirm: Boolean(canConfirm),
                  onConfirm: () => {
                    if (canConfirm && selection) onConfirmTarget?.(selection.id);
                  },
                  onCancel: onCancelTarget,
                }
              : undefined
          }
          pickingDestination={isPickingDestination}
          relocation={
            relocationVillage
              ? {
                  worldId,
                  villageId: relocationVillage.villageId,
                  approved: approvedCity?.properties.ownerPlayerId === viewerPlayerId,
                  onRelocated,
                  destination,
                  isPickingDestination,
                  manualEntryRequested,
                  onStartPickingDestination: startPickingDestination,
                  onDestinationChange: changeDestination,
                  onCancelDestination: cancelDestination,
                }
              : undefined
          }
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
        <p className={styles.help}>
          إحداثيات المدن: <a href="https://www.geonames.org/">GeoNames</a> ·{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
        </p>
      </footer>
    </section>
  );
}
