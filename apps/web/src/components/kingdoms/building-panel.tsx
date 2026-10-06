'use client';

import { ArrowUpCircle, CheckCircle2, CircleAlert, Clock, Hammer, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { upgradeOffer } from '@/lib/kingdoms/construction';
import { hourlyYield, netAfterUpkeep, storageCapacity } from '@/lib/kingdoms/simulation';
import { trainingBuilding, trainingSpeedDivisor } from '@/lib/kingdoms/training';
import {
  resourceKeys,
  unitKeys,
  type Building,
  type Resource,
} from '@/lib/kingdoms/types';
import { date, labels, number, rateAmount, type GameProps } from './shared';
import styles from './building-panel.module.css';

export type VillageNavigation =
  | 'overview'
  | 'village'
  | 'army'
  | 'map'
  | 'campaigns'
  | 'market'
  | 'alliances'
  | 'reports'
  | 'throne';
type DetailTab = 'info' | 'upgrade' | 'production' | 'activity';
type Props = GameProps & {
  building: Building;
  onClose: () => void;
  onNavigate?: (tab: VillageNavigation) => void;
};
const producers: Partial<Record<Building, Resource>> = {
  lumber: 'wood',
  quarry: 'stone',
  mine: 'iron',
  farm: 'food',
  treasury: 'gold',
};
const descriptions: Record<Building, string> = {
  hall: 'مركز إدارة المملكة. طوّر دار الحكم لفتح تجهيز المستوطنين والتوسع بقرى جديدة.',
  lumber: 'يزيد إنتاج الخشب الذي تحتاجه أعمال البناء والتدريب.',
  quarry: 'يزيد إنتاج الحجر لتشييد المباني والتحصينات.',
  mine: 'يزيد إنتاج الحديد لتسليح الجيش وتطوير مباني المملكة.',
  farm: 'تمد القرية والجيش بالغذاء. إنتاجها الإجمالي يرتفع مع كل مستوى.',
  treasury: 'يزيد إنتاج الذهب لتمويل المملكة وتجهيز الحملات.',
  warehouse: 'يحفظ الموارد ويرفع سعة التخزين لكل مورد مع كل مستوى.',
  barracks: 'درّب الحراس والكشافة والمستوطنين. كل مستوى إضافي يسرّع تدريب الثكنة.',
  stable: 'درّب الفرسان. كل مستوى إضافي يسرّع تدريب الإسطبل.',
  wall: 'يحسّن دفاع القرية والحامية المتمركزة فيها.',
  market: 'يفتح تبادل الموارد مع الممالك الأخرى عبر عروض السوق.',
  embassy: 'تتيح دار العهد تكوين التحالفات والانضمام إليها.',
};
const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

export function BuildingPanel({ view, village, busy, send, building, onClose, onNavigate }: Props) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<DetailTab>('upgrade');
  const spec = view.config.buildings[building];
  const offer = upgradeOffer(view.config, village, building);
  const level = offer.level;
  const pending = village.constructionQueue?.filter((item) => item.status === 'BUILDING' || item.status === 'QUEUED') ?? [];
  const pendingCount = pending.length || (village.build ? 1 : 0);
  const queueFull = pendingCount >= (view.config.construction?.maxPending ?? 5);
  const cost = offer.cost;
  const maxed = offer.maxed;
  const shortage = resourceKeys.some((resource) => village.resources[resource] < cost[resource]);
  const resource = producers[building];
  const capacity = storageCapacity(view.config, village);
  const nextCapacity = storageCapacity(view.config, {
    buildings: { ...village.buildings, warehouse: village.buildings.warehouse + 1 },
  });
  const breakdown = view.productionBreakdown?.[village.id];
  const serverRate = view.productionRates[village.id];
  const overflow = resourceKeys.some((key) => village.resources[key] >= capacity);
  const constructing = village.build?.building === building;
  const military = building === 'barracks' || building === 'stable' || building === 'wall';
  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'info', label: 'معلومات' },
    { key: 'upgrade', label: 'ترقية' },
    ...(resource ? [{ key: 'production' as const, label: 'إنتاج' }] : []),
    { key: 'activity', label: military ? 'الحامية' : 'نشاط' },
  ];
  const state = constructing
    ? 'قيد التطوير'
    : maxed
      ? 'بلغ الحد الأعلى'
      : shortage
        ? 'يحتاج موارد'
        : 'قابل للتطوير';
  const StatusIcon = constructing
    ? Hammer
    : maxed
      ? CheckCircle2
      : shortage
        ? CircleAlert
        : ArrowUpCircle;
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [building]);

  return (
    <section
      className={styles.panel}
      aria-label={`تفاصيل ${spec.name}`}
      data-village-building-sheet
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>المبنى المختار</p>
          <h3 ref={title} tabIndex={-1} id={titleId}>
            {spec.name}
          </h3>
        </div>
        <Button variant="ghost" size="icon" aria-label="أغلق تفاصيل المبنى" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      <div className={styles.summary}>
        <p className={styles.level}>
          مستوى {number(level)} / {number(spec.maxLevel)}
        </p>
        <span className={styles.state}>
          <StatusIcon size={16} aria-hidden="true" />
          {state}
        </span>
      </div>
      <div role="tablist" aria-label={`أقسام ${spec.name}`} className={styles.tabs}>
        {tabs.map((item, index) => (
          <button
            type="button"
            key={item.key}
            role="tab"
            id={`${titleId}-${item.key}`}
            aria-controls={`${titleId}-content`}
            aria-selected={tab === item.key}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next].key);
              const sibling = event.currentTarget.parentElement?.children[next];
              if (sibling instanceof HTMLElement) sibling.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${titleId}-content`}
        aria-labelledby={`${titleId}-${tab}`}
        className={styles.content}
      >
        {tab === 'info' && (
          <>
            <p>{descriptions[building]}</p>
            {building === 'hall' && (
              <p>تجهيز المستوطن متاح عند المستوى {number(view.config.settlerHallLevel)}.</p>
            )}
            {building === 'warehouse' && (
              <p>
                سعة كل مورد: <bdi>{number(capacity)}</bdi>
              </p>
            )}
            {building === 'wall' && (
              <p>تعزيز الدفاع: {number(level * view.config.wallDefensePerLevel * 100)}٪</p>
            )}
            {building === 'barracks' && (
              <p>
                تحسين سرعة التدريب:{' '}
                {number(Math.max(0, level - 1) * view.config.barracksSpeedPerLevel * 100)}٪
              </p>
            )}
            {onNavigate && (
              <div className={styles.actions}>
                {building === 'hall' && (
                  <Button variant="outline" onClick={() => onNavigate('overview')}>
                    إدارة المملكة
                  </Button>
                )}
                {(building === 'hall' || military) && (
                  <Button variant="outline" onClick={() => onNavigate('army')}>
                    جهّز الجيش
                  </Button>
                )}
                {building === 'market' && (
                  <Button variant="outline" onClick={() => onNavigate('market')}>
                    افتح السوق
                  </Button>
                )}
                {building === 'embassy' && (
                  <Button variant="outline" onClick={() => onNavigate('alliances')}>
                    إدارة التحالفات
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {tab === 'upgrade' && (
          <>
            <p>{descriptions[building]}</p>
            {resource ? (
              <p className={styles.duration}>
                الإنتاج الحالي {rateAmount(serverRate?.[resource] ?? hourlyYield(view.config, resource, level))} / ساعة
              </p>
            ) : building === 'warehouse' ? (
              <p className={styles.duration}>السعة الحالية {number(capacity)}</p>
            ) : building === 'wall' ? (
              <p className={styles.duration}>
                تعزيز الدفاع {number(level * view.config.wallDefensePerLevel * 100)}٪
              </p>
            ) : building === 'barracks' || building === 'stable' ? (
              <p className={styles.duration}>
                سرعة التدريب ×{rateAmount(trainingSpeedDivisor(level, view.config.barracksSpeedPerLevel))}
              </p>
            ) : null}
            {!maxed && resource && (
              <p>
                بعد الترقية{' '}
                {rateAmount(
                  resource === 'food'
                    ? netAfterUpkeep(hourlyYield(view.config, 'food', offer.nextLevel), breakdown?.upkeep ?? 0)
                    : hourlyYield(view.config, resource, offer.nextLevel),
                )}{' '}
                / ساعة
              </p>
            )}
            <p>
              المستوى الحالي {number(level)}
              {maxed ? ' · بلغ المبنى الحد الأعلى أو أضيف تطويره الأخير إلى القائمة.' : ` · المستوى التالي ${number(offer.nextLevel)}`}
            </p>
            {offer.requirements.length > 0 && (
              <ul aria-label="متطلبات البناء">
                {offer.requirements.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
            )}
            <p>
              حالة الطابور: {pendingCount ? `${number(pendingCount)} أعمال` : 'فارغ'}
              {queueFull ? ' · ممتلئ' : ''}
            </p>
            {!maxed && (
              <>
                <ul className={styles.costs} aria-label="تكلفة التطوير">
                  {resourceKeys
                    .filter((resource) => cost[resource] > 0)
                    .map((resource) => (
                      <li key={resource} data-short={village.resources[resource] < cost[resource]}>
                        <span>
                          {labels[resource]}
                          {village.resources[resource] < cost[resource] && (
                            <CircleAlert size={14} aria-label="موارد غير كافية" />
                          )}
                        </span>
                        <bdi>{number(cost[resource])}</bdi>
                      </li>
                    ))}
                </ul>
                <p className={styles.duration}>
                  <Clock size={16} aria-hidden="true" />
                  مدة التطوير <bdi dir="ltr">{formatDuration(offer.durationSeconds)}</bdi>
                </p>
              </>
            )}
            <Button
              disabled={busy || queueFull || maxed || shortage}
              onClick={() => void send({ type: 'build', villageId: village.id, building })}
            >
              {maxed ? 'بلغ الحد الأعلى' : pendingCount ? 'أضف إلى قائمة البناء' : 'طوّر المبنى'}
            </Button>
            {!maxed && shortage && (
              <p className={styles.shortage}>الموارد الحالية لا تكفي لهذا التطوير.</p>
            )}
            {pendingCount > 0 && (
              <p className={styles.hint}>
                <Hammer size={16} aria-hidden="true" />
                {queueFull ? 'قائمة البناء ممتلئة.' : 'تُخصم التكلفة الآن ويبدأ التطوير بعد المشاريع السابقة، حتى وأنت خارج اللعبة.'}
              </p>
            )}
          </>
        )}
        {tab === 'production' && resource && (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>المخزون الحالي</dt>
                <dd><bdi>{number(village.resources[resource])}</bdi></dd>
              </div>
              <div>
                <dt>سعة التخزين</dt>
                <dd><bdi>{number(capacity)}</bdi></dd>
              </div>
              <div>
                <dt>الإنتاج الحالي / ساعة</dt>
                <dd><bdi>{rateAmount(serverRate?.[resource] ?? hourlyYield(view.config, resource, level))}</bdi></dd>
              </div>
              {!maxed && (
                <div>
                  <dt>الإنتاج بعد الترقية / ساعة</dt>
                  <dd>
                    <bdi>
                      {rateAmount(
                        resource === 'food'
                          ? netAfterUpkeep(hourlyYield(view.config, 'food', offer.nextLevel), breakdown?.upkeep ?? 0)
                          : hourlyYield(view.config, resource, offer.nextLevel),
                      )}
                    </bdi>
                  </dd>
                </div>
              )}
            </dl>
            {resource === 'food' && (
              <p>
                {rateAmount(hourlyYield(view.config, 'food', level))} غذاء / ساعة
              </p>
            )}
            {resource === 'food' && (
              <dl className={styles.facts} aria-label="ميزان الغذاء">
                <div>
                  <dt>الإنتاج الإجمالي قبل إعاشة الجيش</dt>
                  <dd><bdi>{rateAmount(breakdown?.gross.food ?? hourlyYield(view.config, 'food', level))}</bdi></dd>
                </div>
                <div>
                  <dt>إعاشة الجيش</dt>
                  <dd><bdi>{rateAmount(breakdown?.upkeep ?? 0)}</bdi></dd>
                </div>
                <div>
                  <dt>الإنتاج الصافي</dt>
                  <dd><bdi>{rateAmount(serverRate?.food ?? breakdown?.net.food ?? 0)}</bdi></dd>
                </div>
              </dl>
            )}
            <p className={styles.duration}>
              <Clock size={16} aria-hidden="true" />
              تكلفة الترقية ومدة البناء في تبويب الترقية. المدة <bdi dir="ltr">{formatDuration(offer.durationSeconds)}</bdi>
            </p>
          </>
        )}
        {(tab === 'info' || tab === 'upgrade') && building === 'warehouse' && (
          <dl className={styles.facts} aria-label="سعة المخزن">
            <div>
              <dt>السعة الحالية</dt>
              <dd><bdi>{number(capacity)}</bdi></dd>
            </div>
            {!maxed && (
              <div>
                <dt>السعة بعد الترقية</dt>
                <dd><bdi>{number(nextCapacity)}</bdi></dd>
              </div>
            )}
            {resourceKeys.map((key) => (
              <div key={key}>
                <dt>مخزون {labels[key]}</dt>
                <dd><bdi>{number(village.resources[key])}</bdi></dd>
              </div>
            ))}
          </dl>
        )}
        {(tab === 'info' || tab === 'upgrade') && building === 'warehouse' && overflow && (
          <p role="status">المخزن ممتلئ. الإنتاج الزائد يهدر حتى تتسع السعة.</p>
        )}
        {(tab === 'info' || tab === 'upgrade') && (building === 'barracks' || building === 'stable') && (
          <p>
            سرعة التدريب الحالية ×{rateAmount(trainingSpeedDivisor(level, view.config.barracksSpeedPerLevel))}
            {!maxed && ` · بعد الترقية ×${rateAmount(trainingSpeedDivisor(offer.nextLevel, view.config.barracksSpeedPerLevel))}`}
          </p>
        )}
        {tab === 'activity' && (
          <>
            {military && (
              <dl className={styles.facts}>
                {(building === 'wall' ? unitKeys : unitKeys.filter((unit) => trainingBuilding(unit) === building)).map(
                  (unit) => (
                  <div key={unit}>
                    <dt>{view.config.units[unit].name}</dt>
                    <dd>{number(village.troops[unit])} جاهز</dd>
                  </div>
                ),
                )}
              </dl>
            )}
            {constructing && village.build ? (
              <p>
                تطوير إلى المستوى {number(village.build.level)}. يكتمل{' '}
                <time dateTime={new Date(village.build.endsAt).toISOString()}>
                  {date(village.build.endsAt)}
                </time>
              </p>
            ) : (
              <p>لا تطوير جارٍ لهذا المبنى.</p>
            )}
            {village.training && trainingBuilding(village.training.unit) === building && (
              <p>
                يتدرب {number(village.training.count)}{' '}
                {view.config.units[village.training.unit].name} حتى {date(village.training.endsAt)}.
              </p>
            )}
            {military && onNavigate && (
              <Button variant="outline" onClick={() => onNavigate('army')}>
                درّب الوحدات
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
