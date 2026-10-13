'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Castle,
  Crown,
  Handshake,
  ScrollText,
  Search,
  Swords,
  Wheat,
  MapPin,
  CheckCheck,
  RefreshCw,
  MailOpen,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { reportCategories, type ReportCategory } from '@/lib/kingdoms/report-events';
import type {
  RoyalReportDetail,
  RoyalReportsPage,
  ReportsQuery,
} from '@/lib/kingdoms/reports-schema';
import { reportsCopy, type ReportsLocale } from '@/lib/kingdoms/reports-copy';
import { unitKeys, type Resources } from '@/lib/kingdoms/types';
import { request } from './use-kingdoms';
import { ResourceText, type WorldView } from './shared';
import styles from './royal-reports-center.module.css';
const icons = { military: Swords, economy: Wheat, buildings: Castle, diplomacy: Handshake };
const dateOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' } as const;
const dateFormatters = {
  ar: new Intl.DateTimeFormat('ar-SA', dateOptions),
  en: new Intl.DateTimeFormat('en-GB', dateOptions),
};
const numberFormatters = { ar: new Intl.NumberFormat('ar-SA'), en: new Intl.NumberFormat('en-GB') };
const formattedDate = (at: number, locale: ReportsLocale) => dateFormatters[locale].format(at);
type RoyalReportsProps = { view: WorldView; locale?: ReportsLocale };
export function RoyalReportsCenter({ view, locale = 'ar' }: RoyalReportsProps) {
  return (
    <RoyalReportsInbox
      key={`${view.worldId}:${view.player?.id ?? 'unjoined'}:${locale}`}
      view={view}
      locale={locale}
    />
  );
}
function RoyalReportsInbox({ view, locale = 'ar' }: RoyalReportsProps) {
  const copy = reportsCopy[locale];
  const number = numberFormatters[locale].format;
  const [category, setCategory] = useState<ReportsQuery['category']>('all');
  const [unread, setUnread] = useState<ReportsQuery['unread']>('all');
  const [order, setOrder] = useState<ReportsQuery['order']>('newest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const [data, setData] = useState<RoyalReportsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState<'list' | 'detail' | 'read'>('list');
  const [selected, setSelected] = useState<RoyalReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [readBusy, setReadBusy] = useState(false);
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const rowId = useRef('');
  const generation = useRef(0);
  const listGeneration = useRef(0);
  const queryRef = useRef('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = search.trim();
      if (queryRef.current !== value) {
        queryRef.current = value;
        generation.current++;
        setSelected(null);
        setDetailLoading(false);
        setQuery(value);
        setCursors([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++listGeneration.current;
      const params = new URLSearchParams({
        worldId: view.worldId,
        category,
        unread,
        order,
        q: query,
        limit: '25',
        ...(cursor ? { cursor } : {}),
      });
      setLoading(true);
      setError('');
      try {
        const result = await request<RoyalReportsPage>(`/api/kingdoms/reports?${params}`, {
          signal,
        });
        if (!signal?.aborted && version === listGeneration.current) setData(result);
      } catch (failure) {
        if (!signal?.aborted && version === listGeneration.current) {
          setError((failure as Error).message);
          setRetryAction('list');
        }
      } finally {
        if (!signal?.aborted && version === listGeneration.current) setLoading(false);
      }
    },
    [view.worldId, category, unread, order, query, cursor],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const refreshRef = useRef(load);
  const revisionRef = useRef(view.revision);
  const revisionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    refreshRef.current = load;
  }, [load]);
  useEffect(() => {
    if (revisionRef.current === view.revision) return;
    revisionRef.current = view.revision;
    // Coalesce hints and allow an in-flight archive read to finish even in a busy world.
    if (revisionTimer.current !== null) return;
    revisionTimer.current = setTimeout(() => {
      revisionTimer.current = null;
      if (document.visibilityState === 'visible') void refreshRef.current();
    }, 3000);
  }, [view.revision]);
  useEffect(
    () => () => {
      if (revisionTimer.current !== null) clearTimeout(revisionTimer.current);
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(controller.signal);
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);
  function resetSelection() {
    generation.current++;
    setSelected(null);
    setDetailLoading(false);
    setError('');
  }
  async function mark(report: RoyalReportDetail) {
    const version = generation.current;
    setReadBusy(true);
    try {
      const result = await request<{ readAt: number }>('/api/kingdoms/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId: view.worldId, reportId: report.id }),
      });
      if (version !== generation.current) return;
      setSelected((current) =>
        current?.id === report.id ? { ...current, readAt: result.readAt } : current,
      );
      setData((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(0, current.unreadCount - (report.readAt ? 0 : 1)),
              total:
                unread === 'unread'
                  ? Math.max(0, current.total - (report.readAt ? 0 : 1))
                  : current.total,
              items: current.items
                .map((item) => (item.id === report.id ? { ...item, readAt: result.readAt } : item))
                .filter((item) => unread !== 'unread' || !item.readAt),
            }
          : current,
      );
    } catch {
      if (version === generation.current) {
        setError(copy.readFailed);
        setRetryAction('read');
      }
    } finally {
      setReadBusy(false);
    }
  }
  async function open(id: string) {
    const version = ++generation.current;
    rowId.current = id;
    setDetailLoading(true);
    setError('');
    try {
      const result = await request<RoyalReportDetail>(
        `/api/kingdoms/reports/${encodeURIComponent(id)}?worldId=${encodeURIComponent(view.worldId)}`,
      );
      if (version !== generation.current) return;
      setSelected(result);
      setTimeout(() => detailRef.current?.focus(), 0);
    } catch (failure) {
      if (version === generation.current) {
        setError((failure as Error).message);
        setRetryAction('detail');
      }
    } finally {
      if (version === generation.current) setDetailLoading(false);
    }
  }
  function back() {
    generation.current++;
    setSelected(null);
    setDetailLoading(false);
    setTimeout(
      () =>
        (
          listRef.current?.querySelector<HTMLElement>(`[data-report-id="${rowId.current}"]`) ??
          listRef.current?.querySelector<HTMLElement>('[data-report-id]') ??
          listRef.current
        )?.focus(),
      0,
    );
  }
  function changeCategory(value: ReportsQuery['category']) {
    resetSelection();
    setCategory(value);
    setCursors([]);
  }
  const activeFilter = category !== 'all' || unread !== 'all' || query.length > 0;
  return (
    <div
      className={styles.center}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-royal-reports=""
      lang={locale}
      data-detail={Boolean(selected) || detailLoading}
    >
      <header className={styles.header}>
        <div className={styles.seal}>
          <Crown aria-hidden="true" size={28} />
        </div>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className={styles.subtitle}>{copy.subtitle}</p>
        </div>
        <div className={styles.unreadCount}>
          <span>{copy.newReports}</span>
          <strong aria-label={copy.newReports}>{data ? number(data.unreadCount) : '—'}</strong>
        </div>
      </header>
      <nav className={styles.categories} aria-label={copy.categoriesLabel}>
        {(['all', ...reportCategories] as const).map((key) => {
          const Icon = key === 'all' ? ScrollText : icons[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => changeCategory(key)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{copy[key]}</span>
              <bdi>
                {data
                  ? number(
                      key === 'all'
                        ? Object.values(data.categories).reduce((a, b) => a + b, 0)
                        : data.categories[key],
                    )
                  : '—'}
              </bdi>
            </button>
          );
        })}
      </nav>
      <div className={styles.tools}>
        <Input
          label={copy.search}
          icon={<Search size={18} />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={120}
          type="search"
        />
        <Select
          label={copy.filterRead}
          value={unread}
          onChange={(event) => {
            resetSelection();
            setUnread(event.target.value as ReportsQuery['unread']);
            setCursors([]);
          }}
        >
          <option value="all">{copy.all}</option>
          <option value="unread">{copy.unread}</option>
          <option value="read">{copy.read}</option>
        </Select>
        <Select
          label={copy.order}
          value={order}
          onChange={(event) => {
            resetSelection();
            setOrder(event.target.value as ReportsQuery['order']);
            setCursors([]);
          }}
        >
          <option value="newest">{copy.newest}</option>
          <option value="oldest">{copy.oldest}</option>
        </Select>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <Button
            variant="outline"
            onClick={() =>
              retryAction === 'detail'
                ? void open(rowId.current)
                : retryAction === 'read' && selected
                  ? void mark(selected)
                  : void load()
            }
          >
            <RefreshCw size={16} />
            {copy.retry}
          </Button>
        </div>
      )}
      <div className={styles.workspace}>
        <section
          className={styles.list}
          ref={listRef}
          tabIndex={-1}
          aria-label={copy.all}
          aria-busy={loading}
        >
          <div className={styles.listHeading}>
            <strong>{copy.eyebrow}</strong>
            {loading && data && <span role="status">{copy.loading}</span>}
            <span>{data ? `${number(data.total)} ${copy.found}` : '—'}</span>
          </div>
          {loading && !data ? (
            <div className={styles.skeleton} role="status">
              {copy.loading}
              {[1, 2, 3, 4].map((n) => (
                <span key={n} />
              ))}
            </div>
          ) : !data?.items.length ? (
            <div className={styles.empty}>
              <MailOpen size={42} aria-hidden="true" />
              <h3>{activeFilter ? copy.noResults : copy.empty}</h3>
              <p>{copy.emptyBody}</p>
              {activeFilter && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resetSelection();
                    setCategory('all');
                    setUnread('all');
                    setSearch('');
                    setCursors([]);
                  }}
                >
                  {copy.reset}
                </Button>
              )}
            </div>
          ) : (
            <ol className={styles.rows}>
              {data.items.map((item) => {
                const Icon = icons[item.category as ReportCategory] ?? ScrollText;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-report-id={item.id}
                      data-unread={!item.readAt}
                      aria-current={selected?.id === item.id ? 'true' : undefined}
                      onClick={() => void open(item.id)}
                    >
                      <span className={styles.rowIcon}>
                        <Icon size={21} aria-hidden="true" />
                      </span>
                      <span className={styles.rowContent}>
                        <strong>{item.title}</strong>
                        <span>{item.preview}</span>
                        <small>
                          <time dateTime={new Date(item.at).toISOString()}>
                            {formattedDate(item.at, locale)}
                          </time>
                          <b>{item.readAt ? copy.read : copy.unread}</b>
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className={styles.pagination}>
            <Button
              variant="outline"
              disabled={!cursors.length || loading}
              onClick={() => setCursors((old) => old.slice(0, -1))}
            >
              {copy.previous}
            </Button>
            <Button
              variant="outline"
              disabled={!data?.nextCursor || loading}
              onClick={() => setCursors((old) => [...old, data!.nextCursor!])}
            >
              {copy.next}
            </Button>
          </div>
        </section>
        <section
          className={styles.detail}
          ref={detailRef}
          tabIndex={-1}
          aria-label={copy.details}
          aria-busy={detailLoading}
        >
          {detailLoading ? (
            <>
              <button type="button" className={styles.back} onClick={back}>
                <ArrowRight size={18} aria-hidden="true" />
                {copy.back}
              </button>
              <div role="status" className={styles.empty}>
                {copy.loading}
              </div>
            </>
          ) : selected ? (
            <>
              <div className={styles.detailToolbar}>
                <button type="button" className={styles.back} onClick={back}>
                  <ArrowRight size={18} aria-hidden="true" />
                  {copy.back}
                </button>
                <Button
                  variant="outline"
                  disabled={Boolean(selected.readAt) || readBusy}
                  loading={readBusy}
                  onClick={() => void mark(selected)}
                >
                  <CheckCheck size={17} />
                  {selected.readAt ? copy.read : copy.mark}
                </Button>
              </div>
              <p className={styles.eyebrow}>{copy[selected.event?.category ?? 'economy']}</p>
              <h3 lang="ar" className={styles.subject}>
                {selected.title}
              </h3>
              <time className={styles.date} dateTime={new Date(selected.at).toISOString()}>
                {formattedDate(selected.at, locale)}
              </time>
              {selected.event?.outcome && (
                <span className={styles.outcome} data-outcome={selected.event.outcome}>
                  {copy[selected.event.outcome]}
                </span>
              )}
              <p lang="ar" className={styles.body}>
                {selected.detail}
              </p>
              <ReportDetails report={selected} view={view} locale={locale} />
              <p className={styles.history}>{copy.history}</p>
            </>
          ) : (
            <div className={styles.empty}>
              <ScrollText size={56} aria-hidden="true" />
              <h3>{copy.choose}</h3>
              <p>{copy.chooseBody}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function ReportDetails({
  report,
  view,
  locale,
}: {
  report: RoyalReportDetail;
  view: WorldView;
  locale: ReportsLocale;
}) {
  const copy = reportsCopy[locale];
  const number = numberFormatters[locale].format;
  const event = report.event;
  return (
    <div className={styles.sections}>
      {!!event?.parties?.length && (
        <section className={styles.parties}>
          {event.parties.map((party, index) => (
            <div key={index}>
              <span>{party.role === 'merchant' ? copy.economy : copy[party.role]}</span>
              <strong>{party.name}</strong>
            </div>
          ))}
        </section>
      )}
      {event?.location && (
        <section className={styles.location}>
          <MapPin size={20} aria-hidden="true" />
          <div>
            <strong>{event.location.name}</strong>
            <p>
              <bdi>
                ({event.location.x}, {event.location.y})
              </bdi>
            </p>
          </div>
          <a
            href={`/games/kingdoms/world-map?worldId=${encodeURIComponent(view.worldId)}&villageId=${encodeURIComponent(view.villages[0]?.id ?? '')}&reportVillageId=${encodeURIComponent(event.location.villageId ?? '')}`}
          >
            {copy.map}
          </a>
        </section>
      )}
      {report.combat && (
        <section>
          <h4>{copy.troops}</h4>
          <div className={styles.tableWrap} role="region" aria-label={copy.troops} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{copy.unit}</th>
                  <th>
                    {copy.attacker}
                    <small>
                      {copy.before} / {copy.after} / {copy.losses}
                    </small>
                  </th>
                  <th>
                    {copy.defender}
                    <small>
                      {copy.before} / {copy.after} / {copy.losses}
                    </small>
                  </th>
                </tr>
              </thead>
              <tbody>
                {unitKeys
                  .filter(
                    (unit) =>
                      report.combat!.attackerBefore[unit] || report.combat!.defenderBefore[unit],
                  )
                  .map((unit) => (
                    <tr key={unit}>
                      <th>{view.config.units[unit].name}</th>
                      {(['attacker', 'defender'] as const).map((side) => {
                        const before = report.combat![`${side}Before`][unit],
                          after = report.combat![`${side}After`][unit];
                        return (
                          <td key={side}>
                            <span
                              className={styles.combatNumbers}
                              dir={locale === 'ar' ? 'rtl' : 'ltr'}
                            >
                              <span data-stat="before" data-value={before}>
                                <span className="sr-only">{copy.before}: </span>
                                <bdi>{number(before)}</bdi>
                              </span>
                              <span aria-hidden="true"> / </span>
                              <span data-stat="after" data-value={after}>
                                <span className="sr-only">{copy.after}: </span>
                                <bdi>{number(after)}</bdi>
                              </span>
                              <span aria-hidden="true"> / </span>
                              <span data-stat="losses" data-value={Math.max(0, before - after)}>
                                <span className="sr-only">{copy.losses}: </span>
                                <bdi>{number(Math.max(0, before - after))}</bdi>
                              </span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h4>{copy.loot}</h4>
          <ResourceText resources={report.combat.loot} />
        </section>
      )}
      {report.intel && (
        <section>
          <h4>{copy.intel}</h4>
          <ResourceText resources={report.intel.resources} />
          <dl className={styles.stats}>
            {unitKeys
              .filter((key) => report.intel!.troops[key] > 0)
              .map((key) => (
                <div key={key}>
                  <dt>{view.config.units[key].name}</dt>
                  <dd>{number(report.intel!.troops[key])}</dd>
                </div>
              ))}
            {Object.entries(report.intel.buildings).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {view.config.buildings[key as keyof typeof view.config.buildings]?.name ?? key}
                </dt>
                <dd>{number(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {event?.construction && (
        <section>
          <h4>{copy.building}</h4>
          <p>
            {view.config.buildings[
              event.construction.building as keyof typeof view.config.buildings
            ]?.name ?? event.construction.building}
            :{' '}
            <span className={styles.combatNumbers} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              <span>
                {copy.before}: <bdi>{number(event.construction.from)}</bdi>
              </span>
              <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span>
              <span>
                {copy.after}: <bdi>{number(event.construction.to)}</bdi>
              </span>
            </span>
          </p>
        </section>
      )}
      {event?.resources && (
        <section>
          <h4>{copy.resources}</h4>
          {(['sent', 'received'] as const).map((key) =>
            event.resources?.[key] ? (
              <div key={key}>
                <h5>{copy[key]}</h5>
                <ResourceText resources={event.resources[key] as Resources} />
              </div>
            ) : null,
          )}
        </section>
      )}
      {!!event?.commanders?.length && (
        <section>
          <h4>{copy.commanders}</h4>
          {event.commanders.map((commander, index) => (
            <p key={index}>{commander.name}</p>
          ))}
        </section>
      )}
      {event?.siege && (
        <section>
          <h4>{copy.siege}</h4>
          <p>
            {copy.stage}: {event.siege.stage}
          </p>
          <p>
            {copy.wallDamage}: {number(event.siege.wallDamage)}
          </p>
        </section>
      )}
      {!!event?.timeline?.length && (
        <section>
          <h4>{copy.timeline}</h4>
          <ol className={styles.timeline}>
            {event.timeline.map((point, index) => (
              <li key={index}>
                <strong>{point.text}</strong>
                <time>{formattedDate(point.at, locale)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
