'use client';

import { useId, useState } from 'react';
import { parseCoordinate } from './coordinate-draft';
import { useVillageRelocation, type VillageRelocationEligibility } from './use-village-relocation';
import styles from './village-relocation.module.css';

export interface VillageRelocationDestination {
  readonly longitude: number;
  readonly latitude: number;
}

interface DestinationPickerProps {
  readonly destination?: VillageRelocationDestination | null;
  readonly isPickingDestination?: boolean;
  readonly manualEntryRequested?: boolean;
  readonly onStartPickingDestination?: () => void;
  readonly onDestinationChange?: (destination: VillageRelocationDestination | null) => void;
  readonly onCancelDestination?: () => void;
}

export interface VillageRelocationProps extends DestinationPickerProps {
  readonly worldId: string;
  readonly villageId: string;
  readonly approved: boolean;
  readonly onRelocated: (result: VillageRelocationEligibility) => void;
}

export function VillageRelocation({
  worldId,
  villageId,
  approved,
  onRelocated,
  ...picker
}: VillageRelocationProps) {
  const { eligibility, error, retry, relocate, saving, saved, moveError } = useVillageRelocation(
    worldId,
    villageId,
  );
  const [open, setOpen] = useState(false);
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button className={styles.button} type="button" onClick={retry}>
          أعد التحقق من النقل
        </button>
      </div>
    );
  if (!eligibility) return <p role="status">جارٍ التحقق من إمكانية نقل القرية…</p>;
  if (saved) return <p role="status">تم نقل القرية إلى موقعها الجديد.</p>;
  if (eligibility.relocationUsed)
    return <p className={styles.note}>استُخدمت فرصة نقل هذه القرية.</p>;
  if (!eligibility.canRelocate) return <p className={styles.note}>نقل القرية غير متاح حاليًا.</p>;
  return (
    <section className={styles.root} aria-label="نقل القرية مرة واحدة">
      {open ? (
        <RelocationForm
          {...picker}
          eligibility={eligibility}
          onCancel={() => {
            setOpen(false);
            picker.onCancelDestination?.();
          }}
          saving={saving}
          approved={approved}
          moveError={moveError}
          onMove={async (coordinates) => {
            if (!approved) return;
            const result = await relocate(coordinates);
            if (result) {
              picker.onCancelDestination?.();
              onRelocated(result);
            }
          }}
        />
      ) : (
        <button
          className={styles.button}
          disabled={!approved}
          type="button"
          onClick={() => {
            setOpen(true);
            picker.onStartPickingDestination?.();
          }}
        >
          نقل القرية
        </button>
      )}
    </section>
  );
}

function RelocationForm({
  eligibility,
  onCancel,
  saving,
  approved,
  moveError,
  onMove,
  destination = null,
  isPickingDestination = false,
  manualEntryRequested = false,
  onStartPickingDestination,
  onDestinationChange,
}: DestinationPickerProps & {
  eligibility: VillageRelocationEligibility;
  onCancel: () => void;
  saving: boolean;
  approved: boolean;
  moveError: string;
  onMove: (coordinates: { longitude: number; latitude: number }) => Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState({
    longitude: String(destination?.longitude ?? eligibility.longitude),
    latitude: String(destination?.latitude ?? eligibility.latitude),
    source: destination,
    manual: !onStartPickingDestination || manualEntryRequested,
    confirmed: false,
    error: '',
  });
  if (
    !sameDestination(draft.source, destination) ||
    (manualEntryRequested && !isPickingDestination && !draft.manual) ||
    (isPickingDestination && (draft.confirmed || draft.manual))
  ) {
    // Sync picked coordinates before rendering while preserving equivalent typed drafts.
    setDraft({
      ...draft,
      source: destination,
      longitude:
        destination && parseCoordinate(draft.longitude) !== destination.longitude
          ? String(destination.longitude)
          : draft.longitude,
      latitude:
        destination && parseCoordinate(draft.latitude) !== destination.latitude
          ? String(destination.latitude)
          : draft.latitude,
      manual: isPickingDestination ? false : manualEntryRequested || draft.manual,
      confirmed: false,
      error: '',
    });
  }
  const target = readCoordinates(draft.longitude, draft.latitude, eligibility.bounds);
  const needsMapSelection = !draft.manual && !destination;
  const updateCoordinate = (field: 'longitude' | 'latitude', value: string) => {
    const next = { ...draft, [field]: value, confirmed: false, error: '' };
    setDraft(next);
    onDestinationChange?.(readCoordinates(next.longitude, next.latitude, eligibility.bounds));
  };
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.confirmed || saving || !approved || isPickingDestination || needsMapSelection)
          return;
        if (
          !target ||
          (target.longitude === eligibility.longitude && target.latitude === eligibility.latitude)
        ) {
          setDraft({
            ...draft,
            error: 'اختر إحداثيات صالحة داخل حدود العالم تختلف عن الموقع الحالي.',
          });
          return;
        }
        setDraft({ ...draft, error: '' });
        void onMove(target);
      }}
    >
      <h3>اختر موقع القرية الجديد</h3>
      <p id={`${id}-warning`}>
        النقل دائم ومتاح مرة واحدة فقط لكل قرية. يحدد الخادم الموقع النهائي وحدود القرية.
      </p>
      {onStartPickingDestination && (
        <button
          className={styles.button}
          type="button"
          disabled={saving || !approved}
          onClick={() => {
            setDraft({ ...draft, manual: false, confirmed: false, error: '' });
            onStartPickingDestination();
          }}
        >
          غيّر الموقع على الخريطة
        </button>
      )}
      {!draft.manual && (
        <button
          className={styles.button}
          type="button"
          disabled={saving}
          onClick={() => {
            setDraft({ ...draft, manual: true, confirmed: false, error: '' });
            onDestinationChange?.(target);
          }}
        >
          إدخال الإحداثيات يدويًا
        </button>
      )}
      {target && !needsMapSelection && (
        <section className={styles.destination} aria-label="الموقع الجديد للقرية">
          <strong>الموقع الجديد للقرية</strong>
          <p>
            خط الطول: <bdi dir="ltr">{target.longitude}</bdi>
            {' · '}
            خط العرض: <bdi dir="ltr">{target.latitude}</bdi>
          </p>
        </section>
      )}
      {draft.manual && (
        <CoordinateFields
          id={id}
          longitude={draft.longitude}
          latitude={draft.latitude}
          saving={saving}
          updateCoordinate={updateCoordinate}
        />
      )}
      <label className={styles.confirmation}>
        <input
          type="checkbox"
          disabled={saving || isPickingDestination || needsMapSelection}
          checked={draft.confirmed}
          aria-describedby={`${id}-warning`}
          onChange={(event) => setDraft({ ...draft, confirmed: event.target.checked })}
        />
        أفهم أن نقل هذه القرية متاح مرة واحدة فقط ولا يمكن التراجع عنه.
      </label>
      {(draft.error || moveError) && <p role="alert">{draft.error || moveError}</p>}
      {saving && <p role="status">جارٍ نقل القرية…</p>}
      {!approved && !saving && <p role="status">جارٍ تحديث الخريطة…</p>}
      <button
        className={styles.button}
        type="submit"
        disabled={
          !draft.confirmed || saving || !approved || isPickingDestination || needsMapSelection
        }
      >
        {saving ? 'جارٍ نقل القرية…' : 'تأكيد النقل الدائم'}
      </button>
      <button className={styles.button} type="button" disabled={saving} onClick={onCancel}>
        إلغاء النقل
      </button>
    </form>
  );
}

function sameDestination(
  left: VillageRelocationDestination | null,
  right: VillageRelocationDestination | null,
) {
  return (
    left === right ||
    (!!left && !!right && left.longitude === right.longitude && left.latitude === right.latitude)
  );
}

function readCoordinates(
  longitude: string,
  latitude: string,
  bounds: VillageRelocationEligibility['bounds'],
): VillageRelocationDestination | null {
  const lon = parseCoordinate(longitude),
    lat = parseCoordinate(latitude);
  return lon !== null &&
    lat !== null &&
    lon >= bounds.west &&
    lon <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
    ? { longitude: lon, latitude: lat }
    : null;
}

function CoordinateFields({
  id,
  longitude,
  latitude,
  saving,
  updateCoordinate,
}: {
  id: string;
  longitude: string;
  latitude: string;
  saving: boolean;
  updateCoordinate: (field: 'longitude' | 'latitude', value: string) => void;
}) {
  return (
    <div className={styles.coordinateFields}>
      {(['longitude', 'latitude'] as const).map((field) => (
        <label key={field} htmlFor={`${id}-${field}`}>
          {field === 'longitude' ? 'خط الطول' : 'خط العرض'}
          <input
            id={`${id}-${field}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            disabled={saving}
            value={field === 'longitude' ? longitude : latitude}
            onChange={(event) => updateCoordinate(field, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
