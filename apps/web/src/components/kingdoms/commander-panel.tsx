'use client';

import { Crown } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import {
  resourceKeys,
  type CommanderView,
  type CommanderSpecialization,
} from '@/lib/kingdoms/types';
import type { GameProps } from './shared';
import {
  commanderDate,
  commanderNumber,
  commanderText,
  type CommanderLocale,
} from './commander-ui';
import styles from './commander-panel.module.css';

type CommanderPanelProps = GameProps & { locale?: CommanderLocale };
const stats = ['attack', 'defense', 'mobility', 'siege', 'logistics'] as const;

function CommanderCard({
  commander,
  view,
  village,
  busy,
  send,
  locale = 'ar',
}: CommanderPanelProps & { commander: CommanderView }) {
  const t = (key: string) => commanderText(key, locale);
  const n = (value: number) => commanderNumber(value, locale);
  const movement = view.movements.find((item) => item.commanderId === commander.id);
  const recovering = (commander.cooldownUntil ?? 0) > view.serverNow;
  const stationed = view.map.find((item) => item.id === commander.villageId);
  const home = view.map.find((item) => item.id === commander.homeVillageId);
  const canAssign = commander.status === 'available' && !recovering && !village.commanderId;
  return (
    <article className={styles.commander} aria-label={commander.name}>
      <div className={styles.identity}>
        <Crown size={24} aria-hidden="true" />
        <div>
          <h3>
            <bdi>{commander.name}</bdi>
          </h3>
          <p>
            {t(commander.rankKey)} · {t(`commander.specialization.${commander.specialization}`)}
          </p>
        </div>
      </div>
      <p className={styles.status}>{t(`commander.status.${commander.status}`)}</p>
      <div className={styles.progress}>
        <strong>
          {t('commander.level')} <bdi>{n(commander.level)}</bdi>
        </strong>
        <span>
          {t('commander.experience')} <bdi>{n(commander.experience)}</bdi>
        </span>
        <span>
          {commander.nextLevelExperience === null
            ? t('commander.maxLevel')
            : `${t('commander.nextLevel')}: ${n(commander.nextLevelExperience)}`}
        </span>
      </div>
      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat}>
            <dt>{t(`commander.${stat}`)}</dt>
            <dd>
              <bdi>{n(commander[stat])}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {stationed && (
        <p>
          {t('commander.atVillage')}: <bdi>{stationed.name}</bdi>
        </p>
      )}
      {movement && (
        <p>
          {t(`commander.mission.${movement.mission}`)} · {t('commander.destination')}{' '}
          <bdi dir="ltr">
            ({movement.targetX}, {movement.targetY})
          </bdi>{' '}
          ·{' '}
          <time dateTime={new Date(movement.arrivesAt).toISOString()}>
            {commanderDate(movement.arrivesAt, locale)}
          </time>
        </p>
      )}
      {commander.status === 'deployed' && home && (
        <p>
          {t('commander.homeVillage')}: <bdi>{home.name}</bdi>
        </p>
      )}
      {recovering && (
        <p>
          {t('commander.recovering')}{' '}
          <time dateTime={new Date(commander.cooldownUntil!).toISOString()}>
            {commanderDate(commander.cooldownUntil!, locale)}
          </time>
        </p>
      )}
      <div className={styles.actions}>
        {commander.status === 'available' && (
          <Button
            variant="outline"
            disabled={busy || !canAssign}
            onClick={() =>
              void send({
                type: 'commanderAssign',
                commanderId: commander.id,
                villageId: village.id,
              })
            }
          >
            {t('commander.assign')}
          </Button>
        )}
        {commander.status === 'assigned' && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void send({ type: 'commanderUnassign', commanderId: commander.id })}
          >
            {t('commander.unassign')}
          </Button>
        )}
      </div>
    </article>
  );
}

export function CommanderPanel({ view, village, busy, send, locale = 'ar' }: CommanderPanelProps) {
  const id = useId();
  const [name, setName] = useState('');
  const [invalidName, setInvalidName] = useState(false);
  const t = (key: string) => commanderText(key, locale);
  const config = view.config.commanders;
  const commanders = view.commanders ?? [];
  const locked =
    busy ||
    !config ||
    view.paused ||
    view.season.status === 'ended' ||
    view.serverNow >= view.season.endsAt;
  const reason = !config
    ? t('commander.unavailable')
    : commanders.length >= config.maxPerPlayer
      ? t('commander.limit')
      : resourceKeys.some((key) => Math.floor(village.resources[key]) < config.recruitmentCost[key])
        ? t('commander.insufficient')
        : '';
  const disabled = locked || !!reason;
  return (
    <section
      className={styles.panel}
      aria-label={t('commander.title')}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      lang={locale}
    >
      <header>
        <h2>{t('commander.title')}</h2>
        <p>{t('commander.intro')}</p>
      </header>
      {!!config && (
        <form
          className={styles.recruit}
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled) return;
            const trimmed = name.trim();
            if (trimmed.length < 2 || trimmed.length > 40) {
              setInvalidName(true);
              event.currentTarget.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
              return;
            }
            setInvalidName(false);
            const data = new FormData(event.currentTarget);
            void send({
              type: 'commanderRecruit',
              villageId: village.id,
              name: trimmed,
              specialization: String(data.get('specialization')) as CommanderSpecialization,
            });
          }}
        >
          <fieldset disabled={disabled} className={styles.fields}>
            <Input
              name="name"
              label={t('commander.name')}
              required
              minLength={2}
              maxLength={40}
              autoComplete="off"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setInvalidName(false);
              }}
              error={invalidName ? t('commander.invalidName') : undefined}
            />
            <Select name="specialization" label={t('commander.specialization')}>
              {Object.entries(config.specializations).map(([key, specialization]) => (
                <option key={key} value={key}>
                  {t(specialization.key)}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              variant="gold"
              loading={busy}
              aria-describedby={`${id}-recruitment`}
            >
              {t('commander.recruit')}
            </Button>
          </fieldset>
          <p id={`${id}-recruitment`} className={styles.hint}>
            {t('commander.recruitmentCost')}:{' '}
            {resourceKeys
              .map(
                (key) =>
                  `${commanderNumber(config.recruitmentCost[key], locale)} ${t(`commander.resource.${key}`)}`,
              )
              .join(' · ')}
          </p>
        </form>
      )}
      {(reason || busy) && (
        <p role="status" className={styles.hint}>
          {busy ? t('commander.pending') : reason}
        </p>
      )}
      {village.commanderId && <p className={styles.hint}>{t('commander.defenseTaken')}</p>}
      {commanders.length ? (
        <div className={styles.roster}>
          {commanders.map((commander) => (
            <CommanderCard
              key={commander.id}
              commander={commander}
              view={view}
              village={village}
              busy={locked}
              send={send}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <p className={styles.hint}>{t('commander.empty')}</p>
      )}
      {!!config && <p className={styles.hint}>{t('commander.futureStats')}</p>}
    </section>
  );
}
