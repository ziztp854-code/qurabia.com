'use client';

import { useState } from 'react';
import {
  Crown,
  RefreshCw,
  Castle,
  Swords,
  Map,
  Store,
  Flag,
  ScrollText,
  Trees,
  Mountain,
  Pickaxe,
  Wheat,
  Coins,
  House,
} from 'lucide-react';
import { Button, ButtonLink, Input, Select } from '@/components/ui';
import { CommandForm, Empty, date, labels, number } from './shared';
import { useKingdoms } from './use-kingdoms';
import { VillagePanel, ArmyPanel } from './village-panel';
import { MapPanel, type MapSelection } from './map-panel';
import { AlliancePanel, MarketPanel, ThronePanel } from './social-panel';
import { ReportsPanel } from './reports-panel';
import { KingdomOverview } from './kingdom-overview';
import type { Building } from '@/lib/kingdoms/types';
import styles from './kingdoms.module.css';

const tabs = {
  overview: 'لوحة المملكة',
  village: 'القرية',
  army: 'الجيش',
  map: 'خريطة العالم',
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
  market: Store,
  alliances: Flag,
  reports: ScrollText,
  throne: Crown,
};
const resourceIcons = { wood: Trees, stone: Mountain, iron: Pickaxe, food: Wheat, gold: Coins };
const resourceOrder = ['iron', 'food', 'stone', 'wood', 'gold'] as const;
type ScopedMapSelection = MapSelection & { worldId: string; villageId: string };
type ScopedBuildingSelection = { worldId: string; villageId: string; building: Building };

export function KingdomsClient({ canManage = false }: { canManage?: boolean }) {
  const game = useKingdoms();
  const [tab, setTab] = useState<keyof typeof tabs>('overview');
  const [villageId, setVillageId] = useState('');
  const [mapSelection, setMapSelection] = useState<ScopedMapSelection | null>(null);
  const [buildingSelection, setBuildingSelection] = useState<ScopedBuildingSelection | null>(null);
  const { view, busy, loading, send } = game;
  const village = view?.villages.find((item) => item.id === villageId) ?? view?.villages[0];
  const locked = busy || !!view?.paused || view?.season.status === 'ended';
  const props = view && village ? { view, village, busy: locked, send } : null;
  const navigate = (nextTab: keyof typeof tabs) => {
    if (nextTab === 'map') setMapSelection(null);
    if (nextTab === 'village') setBuildingSelection(null);
    setTab(nextTab);
  };
  const openMap = (selection: MapSelection) => {
    if (!view || !village) return;
    setMapSelection({ ...selection, worldId: view.worldId, villageId: village.id });
    setTab('map');
  };
  const openBuilding = (building: Building) => {
    if (!view || !village) return;
    setBuildingSelection({ worldId: view.worldId, villageId: village.id, building });
    setTab('village');
  };
  return (
    <div className={`${styles.shell} ${view?.player ? styles.playing : ''}`} dir="rtl">
      <div className={styles.hud}>
        <header className={styles.hero}>
          <div>
            {!view?.player && <p className={styles.eyebrow}>عالم يستمرّ. عهد تصنعه.</p>}
            <h1>تحدي الممالك</h1>
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
          <section aria-label="موارد القرية" className={styles.resources}>
            {resourceOrder.map((resource) => {
              const Icon = resourceIcons[resource];
              const cap =
                view!.config.storageBase +
                village.buildings.warehouse * view!.config.storagePerLevel;
              const fill = Math.min(100, (village.resources[resource] / cap) * 100);
              return (
                <div key={resource} className={styles.resource} data-full={fill >= 95}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{labels[resource]}</span>
                  <strong>{number(village.resources[resource])}</strong>
                  <em className={styles.capacity} aria-hidden="true" title={`السعة ${number(cap)}`}>
                    <i style={{ inlineSize: `${fill}%` }} />
                  </em>
                </div>
              );
            })}
          </section>
        )}
      </div>
      {canManage && (
        <p>
          <ButtonLink href="/admin/kingdoms" variant="outline">
            إدارة عوالم الممالك
          </ButtonLink>
        </p>
      )}
      <div className={styles.toolbar}>
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
          disabled={busy || loading}
          onClick={() => void (game.worldId ? game.refresh() : game.listWorlds())}
        >
          <RefreshCw size={17} aria-hidden="true" /> تحديث
        </Button>
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
              {view.player.protectionUntil > view.serverNow && (
                <p className={styles.protection}>
                  حماية المملكة الجديدة حتى {date(view.player.protectionUntil)}. استثمر هذه الفترة
                  في البناء والتدريب.
                </p>
              )}
              <div className={styles.gameLayout}>
                <nav aria-label="إدارة المملكة" className={styles.nav}>
                  {Object.entries(tabs).map(([key, label]) => {
                    const Icon = tabIcons[key as keyof typeof tabs];
                    return (
                      <button
                        key={key}
                        aria-pressed={tab === key}
                        onClick={() => navigate(key as keyof typeof tabs)}
                      >
                        <Icon size={20} aria-hidden="true" />
                        <span>{label}</span>
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
                      onOpenMap={openMap}
                      onSelectBuilding={openBuilding}
                    />
                  )}
                  {tab === 'village' && (
                    <VillagePanel
                      key={`${view.worldId}:${village.id}`}
                      {...props}
                      initialBuilding={
                        buildingSelection?.worldId === view.worldId &&
                        buildingSelection?.villageId === village.id
                          ? buildingSelection.building
                          : 'hall'
                      }
                    />
                  )}
                  {tab === 'army' && <ArmyPanel {...props} />}
                  {tab === 'map' && (
                    <MapPanel
                      key={`${view.worldId}:${village.id}`}
                      {...props}
                      initialSelection={
                        mapSelection?.worldId === view.worldId &&
                        mapSelection?.villageId === village.id
                          ? mapSelection
                          : null
                      }
                    />
                  )}
                  {tab === 'market' && <MarketPanel {...props} />}
                  {tab === 'alliances' && <AlliancePanel {...props} />}
                  {tab === 'reports' && <ReportsPanel {...props} />}
                  {tab === 'throne' && <ThronePanel {...props} />}
                </section>
              </div>
              <p className={styles.cost}>آخر تحديث: {date(view.serverNow)}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
