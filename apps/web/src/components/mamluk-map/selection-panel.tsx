'use client';

import {
  Award,
  Castle,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronUp,
  Crown,
  Flag,
  Hourglass,
  MapPin,
  Search,
  Shield,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { SelectionDetails, SelectionKey } from './selection';
import styles from './mamluk-world-map.module.css';
import { VillageRelocation, type VillageRelocationProps } from './village-relocation';

const detailIcons: Readonly<Record<string, typeof Castle>> = {
  المالك: Crown,
  المملكة: Castle,
  التحالف: Shield,
  المستوى: ChartNoAxesColumn,
  الرتبة: Award,
  القوة: Swords,
  السكان: Users,
  الحالة: Hourglass,
};

interface SelectionPanelProps {
  readonly selection: SelectionDetails | null;
  readonly selectedKey?: SelectionKey | null;
  readonly features: readonly (SelectionKey & { readonly label: string })[];
  readonly overviewVillageCount?: number;
  readonly sceneStatus?: 'loading' | 'ready' | 'zoom' | 'error';
  readonly onSelect: (key: SelectionKey) => void;
  readonly onClose: () => void;
  readonly referenceOnly?: boolean;
  readonly managementHref?: string;
  readonly relocation?: VillageRelocationProps;
  readonly loading?: boolean;
  readonly pendingTitle?: string;
  readonly pickingDestination?: boolean;
  readonly targetSelection?: {
    readonly title: string;
    readonly canConfirm: boolean;
    readonly onConfirm: () => void;
    readonly onCancel?: () => void;
  };
}

export function SelectionPanel({
  selection,
  selectedKey,
  features,
  overviewVillageCount,
  sceneStatus = 'ready',
  onSelect,
  onClose,
  referenceOnly = false,
  managementHref,
  relocation,
  loading = false,
  pendingTitle,
  pickingDestination = false,
  targetSelection,
}: SelectionPanelProps) {
  const contentId = useId();
  const count = new Intl.NumberFormat('ar').format(features.length || overviewVillageCount || 0);
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(40);
  function changeQuery(value: string) {
    setQuery(value);
    setVisibleLimit(40);
  }
  const matchingFeatures = features.filter((feature) => feature.label.includes(query.trim()));
  const emptyListMessage =
    query.trim() && features.length
      ? 'لا مواقع تطابق البحث في هذا المشهد.'
      : {
          loading: 'جارٍ تحميل المواقع…',
          ready: 'قرّب الخريطة لاستكشاف المواقع.',
          zoom: 'قرّب الخريطة لاستكشاف المواقع.',
          error: 'أعد تحميل الخريطة لعرض المواقع.',
        }[sceneStatus];
  const panel = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const detailId = selection ? `${selection.layer}:${selection.id}` : null;
  useEffect(() => {
    if (!detailId || !title.current) return;
    if (window.matchMedia?.('(max-width: 62rem)').matches) {
      title.current.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    }
    title.current.focus({ preventScroll: true });
  }, [detailId]);
  const relocationContent = useRef<HTMLDivElement>(null);
  const wasPickingDestination = useRef(false);
  useEffect(() => {
    if (wasPickingDestination.current && !pickingDestination) {
      relocationContent.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
      relocationContent.current?.focus({ preventScroll: true });
    }
    wasPickingDestination.current = pickingDestination;
  }, [pickingDestination]);
  const key = selectedKey === undefined ? selection : selectedKey;
  const selectionId = key ? `${key.layer}:${key.id}` : null;
  useEffect(() => {
    if (selectionId) panel.current?.scrollTo?.({ top: 0, behavior: 'instant' });
  }, [selectionId]);
  const [expanded, setExpanded] = useState(false);
  // Selection intent survives a refresh; authorized detail data still clears.
  const sheetExpanded = expanded || Boolean(key) || Boolean(targetSelection);
  const levelDetail = selection?.details.find((detail) => detail.label === 'المستوى');
  const accessibleName =
    selection && levelDetail && levelDetail.value !== 'غير متوفر'
      ? `${selection.title}، المستوى ${levelDetail.value}`
      : selection?.title;
  const Icon =
    selection?.layer === 'castles'
      ? Castle
      : selection?.layer === 'armies'
        ? Flag
        : selection?.layer === 'sieges'
          ? Shield
          : MapPin;
  return (
    <aside
      ref={panel}
      className={styles.panel}
      aria-label="تفاصيل الخريطة"
      data-expanded={sheetExpanded}
      hidden={pickingDestination}
    >
      <button
        type="button"
        className={styles.sheetToggle}
        aria-label={sheetExpanded ? 'اطوِ تفاصيل الخريطة' : 'افتح تفاصيل الخريطة'}
        aria-controls={contentId}
        aria-expanded={sheetExpanded}
        onClick={() => {
          setExpanded(!sheetExpanded);
          if (sheetExpanded) onClose();
        }}
      >
        <MapPin size={18} aria-hidden="true" />
        <span>{referenceOnly ? 'دليل المدن' : 'المواقع في المشهد'}</span>
        <bdi className={styles.locationCount}>{count}</bdi>
        {sheetExpanded ? (
          <ChevronDown size={20} aria-hidden="true" />
        ) : (
          <ChevronUp size={20} aria-hidden="true" />
        )}
      </button>
      <div id={contentId} className={styles.panelContent}>
        {targetSelection && (
          <section className={styles.targetSelection} aria-label="اختيار هدف الحملة">
            <p className={styles.eyebrow}>{targetSelection.title}</p>
            <p>اختر قرية ثم أكّد هدفك للعودة إلى إعداد الحملة.</p>
            <p>تظهر المسافة ومدة الوصول في معاينة الحملة عند توفرها.</p>
            <button
              type="button"
              className={`${styles.control} ${styles.confirmTarget}`}
              disabled={!targetSelection.canConfirm}
              onClick={targetSelection.onConfirm}
            >
              تأكيد الهدف
            </button>
            {targetSelection.onCancel && (
              <button type="button" className={styles.control} onClick={targetSelection.onCancel}>
                إلغاء اختيار الهدف
              </button>
            )}
          </section>
        )}
        {selection ? (
          <>
            <header className={styles.selectionHeader}>
              <Icon size={24} aria-hidden="true" />
              <div>
                <p className={styles.eyebrow}>{selection.kind}</p>
                <h2 ref={title} tabIndex={-1} aria-label={accessibleName}>
                  {selection.title}
                </h2>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="أغلق تفاصيل الموقع"
                onClick={onClose}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            {managementHref && !referenceOnly && (
              <Link className={`${styles.control} ${styles.managementLink}`} href={managementHref}>
                إدارة القرية
              </Link>
            )}
            {!referenceOnly && (
              <dl className={styles.details}>
                {selection.details.map((detail) => {
                  const DetailIcon = detailIcons[detail.label];
                  return (
                    <div key={detail.label}>
                      <dt>
                        {DetailIcon && <DetailIcon size={17} aria-hidden="true" />}
                        {detail.label}
                      </dt>
                      <dd>{detail.value}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
            <div className={styles.coordinates}>
              <span>خط الطول / خط العرض</span>
              <bdi dir="ltr">{selection.coordinates}</bdi>
            </div>
            {loading && <p className={styles.pendingNote}>جارٍ تحديث تفاصيل الموقع…</p>}
          </>
        ) : loading ? (
          <div className={styles.pendingSelection}>
            <MapPin size={24} aria-hidden="true" />
            <h2>{pendingTitle ?? 'الموقع المحدد'}</h2>
            <p>جارٍ تحديث تفاصيل الموقع…</p>
          </div>
        ) : (
          !referenceOnly && (
            <div className={styles.emptySelection}>
              <MapPin size={28} aria-hidden="true" />
              <h2>اختر موقعًا على الخريطة</h2>
              <p>اختر موقعًا من الخريطة أو القائمة لعرض تفاصيله.</p>
            </div>
          )
        )}
        {relocation && !referenceOnly && (
          <div ref={relocationContent} tabIndex={-1}>
            <VillageRelocation
              key={`${relocation.worldId}:${relocation.villageId}`}
              {...relocation}
            />
          </div>
        )}
        <section className={styles.visibleLocations} aria-label="المواقع المتاحة في المشهد">
          <div className={styles.locationsHeading}>
            <h2>{referenceOnly ? 'دليل المدن' : 'المواقع في المشهد'}</h2>
            <bdi className={styles.locationCount}>{count}</bdi>
          </div>
          {overviewVillageCount !== undefined && (
            <p>
              العرض العام يضم {new Intl.NumberFormat('ar').format(overviewVillageCount)} قرية مجمعة؛
              قرّب الخريطة لعرض تفاصيلها.
            </p>
          )}
          {(features.length > 1 || Boolean(query)) && (
            <div className={styles.locationSearch}>
              <label htmlFor={searchId}>ابحث في المواقع الظاهرة</label>
              <div>
                <Search size={16} aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => changeQuery(event.target.value)}
                  placeholder={referenceOnly ? 'اسم المدينة' : 'مدينة أو قلعة'}
                />
                {query && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="امسح البحث"
                    onClick={() => changeQuery('')}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
          {matchingFeatures.length ? (
            <ul>
              {matchingFeatures.slice(0, visibleLimit).map((feature) => (
                <li key={`${feature.layer}:${feature.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(true);
                      onSelect({ layer: feature.layer, id: feature.id });
                    }}
                    aria-pressed={key?.layer === feature.layer && key.id === feature.id}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{feature.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{emptyListMessage}</p>
          )}
          {matchingFeatures.length > visibleLimit && (
            <button type="button" onClick={() => setVisibleLimit((limit) => limit + 40)}>
              اعرض المزيد من المواقع
            </button>
          )}
        </section>
        {!referenceOnly && (
          <p className={styles.panelNote}>تعرض الخريطة المواقع المسموح لك بالاطلاع عليها.</p>
        )}
      </div>
    </aside>
  );
}
