'use client';

import { Castle, ChevronDown, ChevronUp, Flag, MapPin, Search, Shield, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { SelectionDetails, SelectionKey } from './selection';
import styles from './mamluk-world-map.module.css';

interface SelectionPanelProps {
  readonly selection: SelectionDetails | null;
  readonly selectedKey?: SelectionKey | null;
  readonly features: readonly (SelectionKey & { readonly label: string })[];
  readonly onSelect: (key: SelectionKey) => void;
  readonly onClose: () => void;
  readonly referenceOnly?: boolean;
  readonly managementHref?: string;
}

export function SelectionPanel({
  selection,
  selectedKey,
  features,
  onSelect,
  onClose,
  referenceOnly = false,
  managementHref,
}: SelectionPanelProps) {
  const contentId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const matchingFeatures = features.filter((feature) => feature.label.includes(query.trim()));
  const panel = useRef<HTMLElement>(null);
  const key = selectedKey === undefined ? selection : selectedKey;
  const selectionId = key ? `${key.layer}:${key.id}` : null;
  useEffect(() => {
    if (selectionId) panel.current?.scrollTo?.({ top: 0, behavior: 'instant' });
  }, [selectionId]);
  const [expanded, setExpanded] = useState(false);
  const sheetExpanded = expanded || Boolean(selection);
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
    >
      <div className={styles.panelHandle} aria-hidden="true" />
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
        <span>المواقع في المشهد</span>
        {sheetExpanded ? (
          <ChevronDown size={20} aria-hidden="true" />
        ) : (
          <ChevronUp size={20} aria-hidden="true" />
        )}
      </button>
      <div id={contentId} className={styles.panelContent}>
        {selection ? (
          <>
            <header className={styles.selectionHeader}>
              <Icon size={24} aria-hidden="true" />
              <div>
                <p className={styles.eyebrow}>{selection.kind}</p>
                <h2>{selection.title}</h2>
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
            {(selection.layer === 'cities' || selection.layer === 'castles') && (
              <div className={styles.selectionArt} aria-hidden="true">
                <Image
                  src={
                    selection.layer === 'castles'
                      ? '/game-art/mamluk-map/castle.png'
                      : '/game-art/mamluk-map/village.png'
                  }
                  alt=""
                  width={240}
                  height={168}
                  draggable={false}
                />
              </div>
            )}
            {managementHref && !referenceOnly && (
              <Link className={`${styles.control} ${styles.managementLink}`} href={managementHref}>
                إدارة القرية
              </Link>
            )}
            {!referenceOnly && (
              <dl className={styles.details}>
                {selection.details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className={styles.coordinates}>
              <span>خط الطول / خط العرض</span>
              <bdi dir="ltr">{selection.coordinates}</bdi>
            </div>
          </>
        ) : (
          <div className={styles.emptySelection}>
            <MapPin size={28} aria-hidden="true" />
            <h2>اختر موقعًا على الخريطة</h2>
            <p>
              {referenceOnly
                ? 'اختر مدينة لعرض اسمها وإحداثياتها الجغرافية.'
                : 'افتح مدينة أو قلعة أو جيشًا للاطلاع على معلوماته المتاحة.'}
            </p>
          </div>
        )}
        <section className={styles.visibleLocations} aria-label="المواقع المتاحة في المشهد">
          <div className={styles.locationsHeading}>
            <h3>المواقع في المشهد</h3>
            <span>{new Intl.NumberFormat('ar').format(features.length)}</span>
          </div>
          {(features.length > 1 || Boolean(query)) && (
            <div className={styles.locationSearch}>
              <label htmlFor={searchId}>ابحث في المواقع الظاهرة</label>
              <div>
                <Search size={16} aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="مدينة أو قلعة"
                />
                {query && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="امسح البحث"
                    onClick={() => setQuery('')}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
          {matchingFeatures.length ? (
            <ul>
              {matchingFeatures.slice(0, 40).map((feature) => (
                <li key={`${feature.layer}:${feature.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(true);
                      onSelect({ layer: feature.layer, id: feature.id });
                    }}
                    aria-pressed={selection?.layer === feature.layer && selection.id === feature.id}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{feature.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {query.trim() && features.length
                ? 'لا مواقع تطابق البحث في هذا المشهد.'
                : 'قرّب الخريطة لاستكشاف المواقع.'}
            </p>
          )}
        </section>
        <p className={styles.panelNote}>
          {referenceOnly
            ? 'الأطلس يعرض مواقع مدن حقيقية للمرجع الجغرافي.'
            : 'تعرض الخريطة المواقع المسموح لك بالاطلاع عليها.'}
        </p>
      </div>
    </aside>
  );
}
