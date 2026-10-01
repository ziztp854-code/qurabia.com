'use client';

import { Castle, ChevronDown, ChevronUp, Flag, MapPin, Shield, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
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
            {managementHref && !referenceOnly && (
              <Link className={styles.control} href={managementHref}>
                إدارة القرية
              </Link>
            )}
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
          <h3>المواقع في المشهد</h3>
          {features.length ? (
            <ul>
              {features.slice(0, 40).map((feature) => (
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
            <p>قرّب الخريطة لاستكشاف المواقع.</p>
          )}
        </section>
        <p className={styles.panelNote}>
          {referenceOnly
            ? 'الأطلس يعرض مواقع مدن حقيقية للمرجع الجغرافي.'
            : 'تُعرض المواقع التي تسمح بها رؤيتك الحالية.'}
        </p>
      </div>
    </aside>
  );
}
