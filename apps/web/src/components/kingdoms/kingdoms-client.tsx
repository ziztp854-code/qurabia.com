'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Crown,
  RefreshCw,
  Castle,
  Swords,
  Map,
  Store,
  Flag,
  ScrollText,
  House,
  Settings2,
  Menu,
  ArrowRight,
} from 'lucide-react';
import { Button, ButtonLink, Input, Select } from '@/components/ui';
import { CommandForm, Empty, compactNumber, date, number } from './shared';
import { useKingdoms } from './use-kingdoms';
import { VillagePanel, ArmyPanel } from './village-panel';
import { GlobalMilitaryAlert } from './incoming-alert';
import { hostileThreats, presentIncomingThreats } from '@/lib/kingdoms/incoming-threats';
import { MapPanel } from './map-panel';
import { geographicMapHref } from './map-links';
import { AlliancePanel, MarketPanel, ThronePanel } from './social-panel';
import { ReportsPanel } from './reports-panel';
import { KingdomOverview } from './kingdom-overview';
import { ResourceIcon } from './resource-icon';
import { VillageHero } from './village-hero';
import { unitKeys } from '@/lib/kingdoms/types';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import type { RallyMission } from './village/rally-panel';
import styles from './kingdoms.module.css';

const tabs = {
  overview: 'لوحة المملكة',
  village: 'القرية',
  army: 'الجيش',
  map: 'خريطة العالم',
  campaigns: 'إرسال حملة',
  market: 'السوق',
  alliances: 'التحالفات',
  reports: 'التقارير والمهام',
  throne: 'العرش والمتصدرون',
} as const;
const tabIcons = {
  overview: House,
  village: Castle,
  army: Swords,
  map: Map,
  campaigns: Swords,
  market: Store,
  alliances: Flag,
  reports: ScrollText,
  throne: Crown,
};
const resourceOrder = ['wood', 'stone', 'iron', 'food', 'gold'] as const;
const resourceNames = {
  wood: 'الخشب',
  stone: 'الحجر',
  iron: 'الحديد',
  food: 'الطعام',
  gold: 'الذهب',
};
type ScopedBuildingSelection = { worldId: string; villageId: string; building: VillageSelection };
const mobileTabs = [
  { key: 'village', label: 'القرية' },
  { key: 'map', label: 'العالم' },
  { key: 'army', label: 'الجيش' },
  { key: 'reports', label: 'التقارير' },
  { key: 'overview', label: 'المملكة' },
] as const;

function touchFeedback() {
  if (typeof navigator.vibrate !== 'function' ||
      !window.matchMedia?.('(pointer: coarse)').matches ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  // Feedback is optional: a browser rejecting vibration must never block navigation.
  try { navigator.vibrate(8); } catch { /* Unsupported by this device. */ }
}

export function KingdomsClient({
  canManage = false,
  initialWorldId = '',
  initialVillageId = '',
  initialTab = 'village',
}: {
  canManage?: boolean;
  initialWorldId?: string;
  initialVillageId?: string;
  initialTab?: 'overview' | 'village';
}) {
  const router = useRouter();
  const game = useKingdoms(initialWorldId);
  const [tab, setTab] = useState<keyof typeof tabs>(initialTab);
  const [villageId, setVillageId] = useState(initialVillageId);
  const [showManagement, setShowManagement] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResourceDetails, setShowResourceDetails] = useState(false);
  const [buildingSelection, setBuildingSelection] = useState<ScopedBuildingSelection | null>(null);
  const [campaignMission, setCampaignMission] = useState<RallyMission>('attack');
  const [campaignNonce, setCampaignNonce] = useState(0);
  const { view, busy, loading, send } = game;
  const village = view?.villages.find((item) => item.id === villageId) ?? view?.villages[0];
  const locked = busy || !!view?.paused || view?.season.status === 'ended';
  const props = view && village ? { view, village, busy: locked, send } : null;
  const threatCountId = useId();
  const mapHref = geographicMapHref(view?.worldId ?? game.worldId, village?.id);
  const showMap = (villageId: string) => {
    setVillageId(villageId);
    router.push(geographicMapHref(view?.worldId ?? game.worldId, villageId));
  };
  const navigate = (nextTab: keyof typeof tabs) => {
    setShowManagement(false);
    if (nextTab === 'map') {
      router.push(mapHref);
      return;
    }
    if (nextTab === 'village') setBuildingSelection(null);
    setTab(nextTab);
  };
  const openCampaign = (mission: RallyMission) => {
    setCampaignMission(mission);
    setCampaignNonce((value) => value + 1);
    setTab('campaigns');
  };
  const openBuilding = (building: VillageSelection) => {
    if (!view || !village) return;
    setBuildingSelection({ worldId: view.worldId, villageId: village.id, building });
    setTab('village');
  };
  return (
    <div
      className={`${styles.shell} ${view?.player ? styles.playing : ''} ${view?.player && tab === 'village' ? styles.villageView : ''}`}
      data-screen={tab}
      data-village-stage={view?.player && tab === 'village' ? 'live' : undefined}
      dir="rtl"
    >
      <div className={styles.hud}>
        <header className={styles.hero}>
          <div>
            {!view?.player && <p className={styles.eyebrow}>عالم يستمرّ. عهد تصنعه.</p>}
            <h1>{view?.player && village ? village.name : 'تحدي الممالك'}</h1>
            {view?.player && <p className={styles.villageIdentity}>تحدي المماليك</p>}
            {!view?.player && (
              <p className={styles.muted}>
                من قرية صغيرة إلى مملكة لها كلمة. ابنِ، تحالف، وقُد جيشك نحو عرش تحدي.
              </p>
            )}
          </div>
          <div className={styles.crest} aria-hidden="true">
            <Crown size={48} strokeWidth={1.25} />
          </div>
        </header>
        {village && (
          <section aria-label="موارد القرية" className={styles.resources} tabIndex={0}>
            {resourceOrder.map((resource) => {
              const cap =
                view!.config.storageBase +
                village.buildings.warehouse * view!.config.storagePerLevel;
              const fill = Math.min(100, (village.resources[resource] / cap) * 100);
              return (
                <div
                  key={resource}
                  className={styles.resource}
                  data-resource={resource}
                  data-full={fill >= 95}
                  title={`${resourceNames[resource]} ${number(village.resources[resource])} · السعة ${number(cap)}`}
                >
                  <ResourceIcon resource={resource} size={32} hud />
                  <span>{resourceNames[resource]}</span>
                  <strong role="group" aria-label={`${resourceNames[resource]}: ${number(village.resources[resource])}`}>
                    <bdi className={styles.resourceExact} aria-hidden="true">{number(village.resources[resource])}</bdi>
                    <bdi className={styles.resourceCompact} data-compact-value aria-hidden="true">{compactNumber(village.resources[resource])}</bdi>
                  </strong>
                  <span className={styles.resourceCapacity}>من {number(cap)}</span>
                  <em className={styles.capacity} aria-hidden="true" title={`السعة ${number(cap)}`}>
                    <i style={{ inlineSize: `${fill}%` }} />
                  </em>
                </div>
              );
            })}
          </section>
        )}
        <div className={styles.hudActions}>
          <ButtonLink
            href="/games"
            variant="ghost"
            className={styles.returnLink}
            aria-label="العودة إلى الألعاب"
            title="العودة إلى الألعاب"
          >
            <ArrowRight size={18} aria-hidden="true" />
            <span>الألعاب</span>
          </ButtonLink>
          {view?.player && (
            <>
              <button
                type="button"
                aria-label="إعدادات العالم والقرية"
                aria-expanded={showSettings}
                aria-controls="kingdom-settings"
                onClick={() => {
                  setShowManagement(false);
                  setShowResourceDetails(false);
                  setShowSettings(!showSettings);
                }}
              >
                <Settings2 size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={tab !== 'village' ? styles.mobileManagement : undefined}
                aria-label="إدارة المملكة"
                aria-expanded={showManagement}
                aria-controls="kingdom-navigation"
                onClick={() => {
                  setShowSettings(false);
                  setShowResourceDetails(false);
                  setShowManagement(!showManagement);
                }}
              >
                <Menu size={19} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        id="kingdom-settings"
        className={styles.toolbar}
        hidden={!!view?.player && !showSettings}
      >
        {canManage && (
          <ButtonLink href="/admin/kingdoms" variant="outline">
            إدارة عوالم الممالك
          </ButtonLink>
        )}
        <ButtonLink href={mapHref} variant="outline">
          الخريطة الجغرافية
        </ButtonLink>
        <Select
          label="العالم والموسم"
          value={game.worldId}
          disabled={busy}
          onChange={(event) => game.setWorldId(event.target.value)}
        >
          {!game.worlds.length && <option value="">لا عوالم متاحة</option>}
          {game.worlds.map((world) => (
            <option value={world.id} key={world.id}>
              {world.name} ·{' '}
              {world.status === 'PAUSED'
                ? 'موقوف مؤقتًا'
                : world.status === 'ENDED'
                  ? 'انتهى'
                  : 'مفتوح'}
            </option>
          ))}
        </Select>
        {view && village && (
          <Select
            label="القرية الحالية"
            value={village.id}
            disabled={busy}
            onChange={(event) => setVillageId(event.target.value)}
          >
            {view.villages.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} ({item.x}, {item.y})
              </option>
            ))}
          </Select>
        )}
        <Button
          variant="outline"
          className={styles.refreshButton}
          disabled={busy || loading}
          onClick={() => void (game.worldId ? game.refresh() : game.listWorlds())}
        >
          <RefreshCw size={17} aria-hidden="true" /> تحديث
        </Button>
        {village && (
          <span className={styles.cost}>
            الوحدات الجاهزة:{' '}
            <bdi>{number(unitKeys.reduce((sum, unit) => sum + village.troops[unit], 0))}</bdi>
          </span>
        )}
        {view?.player && village && showSettings && (
          <details
            className={styles.resourceDetails}
            onToggle={(event) => setShowResourceDetails(event.currentTarget.open)}
          >
            <summary>تفاصيل الموارد والإنتاج</summary>
            {showResourceDetails && (
              <VillageHero key={`${view.worldId}:${village.id}`} view={view} village={village} />
            )}
          </details>
        )}
      </div>
      {game.error && (
        <div role="alert" className={`${styles.notice} ${styles.error}`}>
          {game.error}
        </div>
      )}
      {game.notice && (
        <p role="status" className={styles.notice}>
          {game.notice}
        </p>
      )}
      {loading && (
        <p role="status" className={styles.empty}>
          جارٍ تحميل عالم الممالك…
        </p>
      )}
      {!loading && !game.worlds.length && !game.error && (
        <Empty>لم يُفتح عالم بعد. سيظهر الموسم هنا عندما تفتحه الإدارة.</Empty>
      )}
      {view && (
        <>
          <div className={styles.seasonBar}>
            <strong>
              {view.worldName} · الموسم {number(view.season.number)}
            </strong>
            <span className={styles.cost}>نهاية الموسم {date(view.season.endsAt)}</span>
          </div>
          {view.paused && (
            <p className={styles.notice}>
              أوقفت الإدارة استقبال الأوامر مؤقتًا. المؤقتات القائمة تستمر.
            </p>
          )}
          {view.season.status === 'ended' && (
            <p className={styles.notice}>
              انتهى الموسم. صاحب العرش:{' '}
              {view.leaderboard.find((player) => player.id === view.season.winnerId)?.name ??
                view.map.find((village) => village.ownerId === view.season.winnerId)?.kingdomName ??
                'لم يُحسم لصالح مملكة'}
              {view.season.winnerAllianceId && (
                <>
                  {' '}
                  · التحالف المتوج:{' '}
                  {view.alliances.find((alliance) => alliance.id === view.season.winnerAllianceId)
                    ?.name ?? 'تحالف الموسم'}
                </>
              )}
              .
            </p>
          )}
          {!view.player && view.season.status !== 'ended' && (
            <section className={styles.panel}>
              <h2>اكتب أول سطر في حكاية مملكتك</h2>
              <p className={styles.muted}>
                تحصل على قرية وموارد أولية وحماية للاعب الجديد. يستمر الإنتاج وأنت خارج اللعبة.
              </p>
              <CommandForm
                busy={locked}
                label="أسّس مملكتي"
                onSubmit={(data) => void send({ type: 'found', name: String(data.get('name')) })}
              >
                <Input
                  label="اسم المملكة"
                  name="name"
                  required
                  minLength={2}
                  maxLength={40}
                  autoComplete="off"
                />
              </CommandForm>
            </section>
          )}
          {view.player && village && props && (
            <>
              {tab !== 'village' && (
                <GlobalMilitaryAlert
                  incoming={view.incoming ?? []}
                  villages={view.villages}
                  view={view}
                  onShowMap={showMap}
                  onRefresh={() => void game.refresh()}
                  onFocusVillage={(id) => {
                    setVillageId(id);
                    setTab('village');
                  }}
                />
              )}
              {view.player.protectionUntil > view.serverNow && (
                <p className={styles.protection}>
                  حماية المملكة الجديدة حتى {date(view.player.protectionUntil)}. استثمر هذه الفترة
                  في البناء والتدريب.
                </p>
              )}
              <div className={styles.gameLayout}>
                <nav
                  id="kingdom-navigation"
                  aria-label="إدارة المملكة"
                  className={styles.nav}
                  data-open={showManagement}
                  hidden={tab === 'village' && !showManagement}
                >
                  {Object.entries(tabs).map(([key, label]) => {
                    const Icon = tabIcons[key as keyof typeof tabs];
                    const hostile = hostileThreats(
                      presentIncomingThreats(view.incoming ?? [], view.serverNow),
                    ).length;
                    if (key === 'map')
                      return (
                        <Link key={key} href={mapHref}>
                          <Icon size={20} aria-hidden="true" />
                          <span>{label}</span>
                        </Link>
                      );
                    return (
                      <button
                        key={key}
                        aria-pressed={tab === key}
                        aria-describedby={
                          key === 'village' && hostile > 0 ? threatCountId : undefined
                        }
                        onClick={() => navigate(key as keyof typeof tabs)}
                      >
                        <Icon size={20} aria-hidden="true" />
                        <span>{label}</span>
                        {key === 'village' && hostile > 0 && (
                          <span
                            id={threatCountId}
                            className={styles.threatBadge}
                            aria-label={`${hostile} هجمات قادمة`}
                          >
                            {hostile}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
                <section aria-label={tabs[tab]}>
                  {tab === 'overview' && (
                    <KingdomOverview
                      key={village.id}
                      view={view}
                      village={village}
                      onNavigate={navigate}
                      worldMapHref={mapHref}
                      onSelectBuilding={openBuilding}
                    />
                  )}
                  {tab === 'village' && (
                    <VillagePanel
                      key={`${view.worldId}:${village.id}`}
                      {...props}
                      hideMobileNavigation
                      onNavigate={navigate}
                      onShowMap={showMap}
                      onRefresh={() => void game.refresh()}
                      onCampaign={openCampaign}
                      initialBuilding={
                        buildingSelection?.worldId === view.worldId &&
                        buildingSelection?.villageId === village.id
                          ? buildingSelection.building
                          : null
                      }
                    />
                  )}
                  {tab === 'army' && <ArmyPanel key={`${view.worldId}:${village.id}`} {...props} />}
                  {tab === 'campaigns' && (
                    <MapPanel
                      key={`${view.worldId}:${village.id}:${campaignMission}:${campaignNonce}`}
                      {...props}
                      initialMission={campaignMission}
                    />
                  )}
                  {tab === 'market' && <MarketPanel {...props} />}
                  {tab === 'alliances' && <AlliancePanel {...props} />}
                  {tab === 'reports' && <ReportsPanel {...props} />}
                  {tab === 'throne' && <ThronePanel {...props} />}
                </section>
              </div>
              <p className={`${styles.cost} ${styles.screenMeta}`}>
                آخر تحديث: {date(view.serverNow)}
              </p>
              <nav className={styles.mobileNavigation} aria-label="تنقل المملكة">
                {mobileTabs.map(({ key, label }) => {
                  const Icon = tabIcons[key];
                  const content = <><Icon size={22} aria-hidden="true" /><span>{label}</span></>;
                  if (key === 'map') return (
                    <Link key={key} href={mapHref} aria-label={`انتقل إلى ${label}`} onClick={touchFeedback}>
                      {content}
                    </Link>
                  );
                  return (
                    <button type="button" key={key} aria-label={`انتقل إلى ${label}`}
                      aria-current={tab === key ? 'page' : undefined}
                      onClick={() => { touchFeedback(); navigate(key); }}>
                      {content}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}
