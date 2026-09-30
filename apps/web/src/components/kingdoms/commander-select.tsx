'use client';

import { Select } from '@/components/ui';
import type { CommanderView } from '@/lib/kingdoms/types';
import type { WorldView } from './shared';
import { commanderText, type CommanderLocale } from './commander-ui';

export function canSelectCommander(commander: CommanderView, villageId: string, now: number) {
  return (
    (commander.cooldownUntil ?? 0) <= now &&
    (commander.status === 'available' ||
      (commander.status === 'assigned' && commander.villageId === villageId))
  );
}

export function CommanderSelect({
  view,
  villageId,
  value,
  onChange,
  disabled,
  locale = 'ar',
}: {
  view: WorldView;
  villageId: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  locale?: CommanderLocale;
}) {
  const commanders = (view.commanders ?? []).filter((commander) =>
    canSelectCommander(commander, villageId, view.serverNow),
  );
  const invalid = !!value && !commanders.some((commander) => commander.id === value);
  const t = (key: string) => commanderText(key, locale);
  return (
    <Select
      name="commanderId"
      label={t('commander.select')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      description={t('commander.selectHint')}
      error={invalid ? t('commander.selectionExpired') : undefined}
    >
      <option value="">{t('commander.none')}</option>
      {invalid && (
        <option value={value} disabled>
          {t('commander.selectionExpired')}
        </option>
      )}
      {commanders.map((commander) => (
        <option key={commander.id} value={commander.id}>
          {commander.name} · {t(`commander.specialization.${commander.specialization}`)}
        </option>
      ))}
    </Select>
  );
}
