'use client';

import { ArrowLeft, Crown, Hammer, Timer } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { buildingStage, maxLevelLabel, supremeStage } from '@/lib/kingdoms/stages';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { resourceKeys, type Building } from '@/lib/kingdoms/types';
import { BuildingPortrait } from './building-portrait';
import { date, labels, number, type GameProps } from './shared';
import { buildingEffect, duration, upgradeCost, upgradeSeconds } from './village-effects';
import { plotState, resourceIcons, villagePlots } from './village-layout';
import styles from './village.module.css';

type Request = { building: Building; level: number };

/**
 * لوحة المبنى المختار: الحالة والمرحلة وأثر المستوى التالي وتكلفته ومدته من إعدادات الخادم،
 * وزر أمر واحد. نتيجة الأمر تُقرأ من لقطة الخادم بعد الرد، لا من افتراض في المتصفح.
 */
export function BuildingCard({
  building: key,
  view,
  village,
  busy,
  send,
}: GameProps & { building: Building }) {
  const [request, setRequest] = useState<Request | null>(null);
  const spec = view.config.buildings[key];
  const state = plotState(key, village, spec.maxLevel);
  const { level } = state;
  const stage = buildingStage(level, spec.maxLevel);
  const nextStage = state.maxed ? null : buildingStage(level + 1, spec.maxLevel);
  const topStage = stage?.key === supremeStage.key;
  const Icon = villagePlots[key].Icon;
  const cost = upgradeCost(view.config, key, level);
  const capacity = storageCapacity(view.config, village);
  const missing = resourceKeys.filter((resource) => village.resources[resource] < cost[resource]);
  const overCapacity = resourceKeys.filter((resource) => cost[resource] > capacity);
  const effect = buildingEffect(key, view.config, village);
  const current = village.build;
  const blocker = state.maxed
    ? `${spec.name} في ${maxLevelLabel} لهذا العالم.`
    : current
      ? current.building === key
        ? `يُبنى المستوى ${number(current.level)} الآن.`
        : `البناء مشغول بـ${view.config.buildings[current.building].name} حتى ${date(current.endsAt)}.`
      : null;
  const pending = request?.building === key ? request : null;
  const feedback = !pending
    ? null
    : busy
      ? { tone: 'wait', text: 'جارٍ إرسال الأمر إلى الخادم…' }
      : current?.building === key && current.level === pending.level
        ? {
            tone: 'ok',
            text: `بدأ بناء المستوى ${number(pending.level)}، ويكتمل ${date(current.endsAt)}.`,
          }
        : level >= pending.level
          ? { tone: 'ok', text: `اكتمل المستوى ${number(pending.level)}.` }
          : {
              tone: 'fail',
              text: 'لم يبدأ البناء. راجع رسالة الخادم أعلى الصفحة ثم أعد المحاولة.',
            };

  return (
    <article
      className={`${styles.card} ${styles.buildingCard}`}
      aria-label={`المبنى المختار: ${spec.name}`}
      data-visual={state.visual}
    >
      <div className={styles.cardMeta}>
        <p className={styles.cardEyebrow}>المبنى المختار</p>
        <span className={styles.ribbon} data-tone={topStage || state.maxed ? 'gold' : undefined}>
          {state.maxed && <Crown size={12} aria-hidden="true" />}
          {stage ? stage.name : 'أرض شاغرة'}
        </span>
      </div>
      <BuildingPortrait building={key} state={state} />
      <div className={styles.cardHead}>
        <span className={styles.medallion} aria-hidden="true">
          <Icon size={18} />
        </span>
        <div>
          <h3 className={styles.cardTitle}>{spec.name}</h3>
          <p className={styles.cardMeta}>
            <span>
              {level > 0
                ? `مستوى ${number(level)} من ${number(spec.maxLevel)}`
                : `لم يُبنَ بعد · الحد الأعلى ${number(spec.maxLevel)}`}
            </span>
          </p>
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span>{number(state.percent)}٪ من الحد الأعلى</span>
        <span>
          {topStage
            ? `المبنى في ${supremeStage.name}.`
            : `المرحلة العليا للمبنى تبدأ عند ${number(
                Math.round(supremeStage.fraction * spec.maxLevel),
              )} مستوى.`}
        </span>
      </div>
      <span
        role="progressbar"
        aria-label={`تقدم ${spec.name} نحو ${supremeStage.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
        aria-valuetext={`${number(state.percent)}٪ من الحد الأعلى للمبنى`}
        className={`${styles.bar} ${styles.barWide}`}
      >
        <span style={{ width: `${state.percent}%` }} />
      </span>
      <dl className={styles.effect}>
        <dt>{effect.label}</dt>
        <dd>
          <bdi>{effect.now}</bdi>
          {effect.next !== null && (
            <>
              <ArrowLeft size={14} aria-hidden="true" />
              <span className={styles.srOnly}>بعد التطوير</span>
              <bdi className={styles.effectNext}>{effect.next}</bdi>
            </>
          )}
        </dd>
        {effect.note && <dd className={styles.effectNote}>{effect.note}</dd>}
      </dl>
      {!state.maxed && (
        <>
          <div className={styles.cardMeta}>
            <h4 className={styles.subTitle}>
              {level > 0 ? `تكلفة المستوى ${number(level + 1)}` : 'تكلفة البناء'}
            </h4>
            <span className={styles.duration}>
              <Timer size={13} aria-hidden="true" />
              {duration(upgradeSeconds(view.config, key, level))}
            </span>
          </div>
          {nextStage && nextStage.key !== stage?.key && (
            <p className={styles.stageShift}>هذا المستوى ينقل المبنى إلى مرحلة {nextStage.name}.</p>
          )}
          <ul className={styles.costs} aria-label="تكلفة التطوير">
            {resourceKeys
              .filter((resource) => cost[resource] > 0)
              .map((resource) => {
                const ResourceIcon = resourceIcons[resource];
                const have = Math.floor(village.resources[resource]);
                const enough = have >= cost[resource];
                const fill =
                  cost[resource] > 0 ? Math.min(100, (have / cost[resource]) * 100) : 100;
                return (
                  <li key={resource} className={styles.costCell} data-afford={enough}>
                    <ResourceIcon size={14} aria-hidden="true" />
                    <span>{labels[resource]}</span>
                    <bdi>{number(cost[resource])}</bdi>
                    <span className={styles.costHave}>
                      {enough ? 'متوفر' : `لديك ${number(have)}`}
                    </span>
                    <span className={styles.costBar} aria-hidden="true">
                      <span style={{ width: `${fill}%` }} />
                    </span>
                  </li>
                );
              })}
          </ul>
          {missing.length > 0 && (
            <p className={styles.shortfall} role="note">
              ينقصك:{' '}
              {missing
                .map(
                  (resource) =>
                    `${labels[resource]} ${number(cost[resource] - village.resources[resource])}`,
                )
                .join(' · ')}
            </p>
          )}
          {overCapacity.length > 0 && (
            <p className={styles.shortfall} role="note">
              التكلفة تتجاوز سعة المخزن ({number(capacity)}) في{' '}
              {overCapacity.map((resource) => labels[resource]).join(' و')}؛ طوّر المخزن أولًا.
            </p>
          )}
        </>
      )}
      <Button
        className={styles.cta}
        loading={busy && !!pending}
        disabled={busy || !!current || state.maxed}
        onClick={() => {
          setRequest({ building: key, level: level + 1 });
          void send({ type: 'build', villageId: village.id, building: key });
        }}
      >
        {!state.maxed && <Hammer size={16} aria-hidden="true" />}
        {state.maxed ? 'بلغ الحد الأعلى' : level > 0 ? 'طوّر المبنى' : 'ابنِ المبنى'}
      </Button>
      {blocker && <p className={styles.blocker}>{blocker}</p>}
      <p className={styles.feedback} role="status" data-tone={feedback?.tone}>
        {feedback?.text}
      </p>
    </article>
  );
}
