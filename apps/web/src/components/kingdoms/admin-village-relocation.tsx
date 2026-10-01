'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import type { KingdomsWorld } from '@/lib/kingdoms/types';
import type { MamlukMapState } from '@/lib/mamluk-map/storage';
import { parseCoordinate } from '../mamluk-map/coordinate-draft';
import styles from './kingdoms.module.css';

interface AdminRelocationCommand {
  readonly action: 'relocate';
  readonly worldId: string;
  readonly villageId: string;
  readonly expectedOwnerId: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly confirmed: true;
}

export function AdminVillageRelocation({
  world,
  paused,
  busy,
  onSubmit,
}: {
  readonly world: {
    readonly id: string;
    readonly state: KingdomsWorld & { readonly geography?: MamlukMapState };
  };
  readonly paused: boolean;
  readonly busy: boolean;
  readonly onSubmit: (command: AdminRelocationCommand) => void;
}) {
  const [villageId, setVillageId] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const village = Object.hasOwn(world.state.villages, villageId)
    ? world.state.villages[villageId]
    : undefined;
  const city = world.state.geography?.cities.find(({ value }) => value.id === villageId)?.value;
  const used = Object.hasOwn(world.state.geography?.villageRelocations ?? {}, villageId);
  const unavailable =
    busy || paused || used || !city || !village || world.state.season.status !== 'active';
  function editDraft(setDraft: (value: string) => void, draft: string) {
    setDraft(draft);
    setConfirmed(false);
    setError('');
  }
  return (
    <section className={styles.panel} aria-label="نقل قرية بإذن الإدارة">
      <h2>نقل قرية بإذن الإدارة</h2>
      <p className={styles.muted}>
        نقل جغرافي دائم لمرة واحدة. تبقى ملكية القرية، وتُطبق شروط النقل نفسها.
      </p>
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          if (unavailable || !confirmed || !village) return;
          const lon = parseCoordinate(longitude),
            lat = parseCoordinate(latitude);
          if (
            lon === null ||
            lat === null ||
            lon < -179.9 ||
            lon > 179.9 ||
            lat < -85 ||
            lat > 85 ||
            (lon === city!.longitude && lat === city!.latitude)
          ) {
            setError('اختر إحداثيات صالحة داخل حدود العالم تختلف عن الموقع الحالي.');
            return;
          }
          onSubmit({
            action: 'relocate',
            worldId: world.id,
            villageId,
            expectedOwnerId: village.ownerId,
            longitude: lon,
            latitude: lat,
            confirmed: true,
          });
        }}
        noValidate
      >
        <Select
          label="القرية المطلوب نقلها"
          disabled={busy}
          value={villageId}
          onChange={(event) => {
            setVillageId(event.target.value);
            setConfirmed(false);
            setError('');
          }}
        >
          <option value="">اختر القرية</option>
          {Object.values(world.state.villages).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {world.state.players[entry.ownerId]?.name ?? 'مملكة غير متاحة'}
            </option>
          ))}
        </Select>
        {village && (
          <dl>
            <dt>المملكة</dt>
            <dd>{world.state.players[village.ownerId]?.name ?? 'غير متاحة'}</dd>
            <dt>الموقع الحالي</dt>
            <dd dir="ltr">{city ? `${city.longitude} / ${city.latitude}` : 'غير متاح'}</dd>
          </dl>
        )}
        {used && <p role="status">استُخدمت فرصة نقل هذه القرية.</p>}
        {paused && <p role="status">نقل القرية غير متاح في عالم موقوف.</p>}
        <Input
          label="خط طول الوجهة"
          type="text"
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          disabled={busy}
          value={longitude}
          onChange={(event) => editDraft(setLongitude, event.target.value)}
        />
        <Input
          label="خط عرض الوجهة"
          type="text"
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          disabled={busy}
          value={latitude}
          onChange={(event) => editDraft(setLatitude, event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={unavailable}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{' '}
          أوافق على نقل هذه القرية لمرة واحدة إلى الإحداثيات المحددة.
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={unavailable || !confirmed} loading={busy}>
          تأكيد النقل الإداري
        </Button>
      </form>
    </section>
  );
}
