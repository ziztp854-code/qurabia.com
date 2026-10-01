'use client';

import { useId, useState } from 'react';
import { useVillageRelocation, type VillageRelocationEligibility } from './use-village-relocation';
import styles from './village-relocation.module.css';

export interface VillageRelocationProps {
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
          eligibility={eligibility}
          onCancel={() => setOpen(false)}
          saving={saving}
          approved={approved}
          moveError={moveError}
          onMove={async (coordinates) => {
            if (!approved) return;
            const result = await relocate(coordinates);
            if (result) onRelocated(result);
          }}
        />
      ) : (
        <button
          className={styles.button}
          disabled={!approved}
          type="button"
          onClick={() => setOpen(true)}
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
}: {
  eligibility: VillageRelocationEligibility;
  onCancel: () => void;
  saving: boolean;
  approved: boolean;
  moveError: string;
  onMove: (coordinates: { longitude: number; latitude: number }) => Promise<void>;
}) {
  const id = useId();
  const [longitude, setLongitude] = useState(String(eligibility.longitude));
  const [latitude, setLatitude] = useState(String(eligibility.latitude));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed || saving || !approved) return;
        const lon = Number(longitude),
          lat = Number(latitude);
        const bounds = eligibility.bounds;
        if (
          !longitude.trim() ||
          !latitude.trim() ||
          !Number.isFinite(lon) ||
          !Number.isFinite(lat) ||
          lon < bounds.west ||
          lon > bounds.east ||
          lat < bounds.south ||
          lat > bounds.north ||
          (lon === eligibility.longitude && lat === eligibility.latitude)
        ) {
          setError('اختر إحداثيات صالحة داخل حدود العالم تختلف عن الموقع الحالي.');
          return;
        }
        setError('');
        void onMove({ longitude: lon, latitude: lat });
      }}
    >
      <h3>اختر موقع القرية الجديد</h3>
      <p id={`${id}-warning`}>
        النقل دائم ومتاح مرة واحدة فقط لكل قرية. يحدد الخادم الموقع النهائي وحدود القرية.
      </p>
      <label htmlFor={`${id}-longitude`}>خط الطول</label>
      <input
        id={`${id}-longitude`}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step="any"
        disabled={saving}
        min={eligibility.bounds.west}
        max={eligibility.bounds.east}
        value={longitude}
        onChange={(event) => setLongitude(event.target.value)}
      />
      <label htmlFor={`${id}-latitude`}>خط العرض</label>
      <input
        id={`${id}-latitude`}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step="any"
        disabled={saving}
        min={eligibility.bounds.south}
        max={eligibility.bounds.north}
        value={latitude}
        onChange={(event) => setLatitude(event.target.value)}
      />
      <label className={styles.confirmation}>
        <input
          type="checkbox"
          disabled={saving}
          checked={confirmed}
          aria-describedby={`${id}-warning`}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        أفهم أن نقل هذه القرية متاح مرة واحدة فقط ولا يمكن التراجع عنه.
      </label>
      {(error || moveError) && <p role="alert">{error || moveError}</p>}
      {saving && <p role="status">جارٍ نقل القرية…</p>}
      {!approved && !saving && <p role="status">جارٍ تحديث الخريطة…</p>}
      <button className={styles.button} type="submit" disabled={!confirmed || saving || !approved}>
        {saving ? 'جارٍ نقل القرية…' : 'تأكيد النقل الدائم'}
      </button>
      <button className={styles.button} type="button" disabled={saving} onClick={onCancel}>
        إلغاء النقل
      </button>
    </form>
  );
}
