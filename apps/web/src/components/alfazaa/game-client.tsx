'use client';
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  Castle,
  CircleHelp,
  Shield,
  Images,
  Mic,
  ArrowRight,
  Coins,
  Hammer,
  UserRound,
  Flag,
} from 'lucide-react';
import catalogData from '@/lib/alfazaa/data/catalog.json';
import art from '@/lib/alfazaa/data/art.json';
import dynamic from 'next/dynamic';
import type { Building, Catalog, Cost } from '@/lib/alfazaa/domain/types';
import { getGoldPerMinute } from '@/lib/alfazaa/domain';
import { QuestsPanel } from './quests-panel';
import { CityScene } from './city-scene';
import { TowerScene } from './tower-scene';
import { Stages } from './stages';
import { Tutorial } from './tutorial';
import { useGame } from './use-game';
import styles from './game.module.css';
const catalog = catalogData as unknown as Catalog;
const HeroGallery = dynamic(() => import('./hero-gallery').then((module) => module.HeroGallery), {
  loading: () => <p role="status">جارٍ فتح دليل الأبطال…</p>,
});
const ResourceGallery = dynamic(
  () => import('./resource-gallery').then((module) => module.ResourceGallery),
  { loading: () => <p role="status">جارٍ فتح الصور…</p> },
);
const number = (value: number) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(value);
function costText(cost: Cost) {
  return cost.length
    ? cost
        .map(
          ([id, n]) =>
            `${number(n)} ${catalog.items.find((item) => item.id === id)?.name || 'مورد'}`,
        )
        .join(' + ')
    : 'مجاني';
}
function requirements(row: Building) {
  const required = row.requireBuilding
    ? catalog.buildings.find((item) => item.id === row.requireBuilding)
    : null;
  return (
    [
      row.requireCastle ? `قلعة مستوى ${row.requireCastle}` : '',
      required ? `${required.name} مستوى ${required.level}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'لا توجد متطلبات إضافية'
  );
}

export function GameClient({ demo }: { demo: boolean }) {
  const game = useGame(demo);
  const [tab, setTab] = useState<'city' | 'training' | 'bag' | 'heroes' | 'resources' | 'quests'>(
    'city',
  );
  const [action, setAction] = useState<'recruit' | 'build'>('recruit');
  const [selected, setSelected] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const helpButton = useRef<HTMLButtonElement>(null);
  const state = game.state;
  const changeTab = (next: typeof tab) => {
    setTab(next);
    setSelected(null);
  };
  const cell = selected !== null ? state?.cells[selected] : null;
  const config = cell
    ? (cell.kind === 'troop' ? catalog.arms : catalog.buildings).find(
        (item) => item.id === cell.cfgId,
      )
    : null;
  const castle =
    state && catalog.buildings.find((item) => item.type === 11 && item.level === state.castleLevel);
  const castleNext = castle?.nextId
    ? catalog.buildings.find((item) => item.id === castle.nextId)
    : null;
  const selectedBuilding =
    cell?.kind === 'building' ? catalog.buildings.find((item) => item.id === cell.cfgId) : null;
  const selectedNext = selectedBuilding?.nextId
    ? catalog.buildings.find((item) => item.id === selectedBuilding.nextId)
    : null;
  const selectCell = async (index: number) => {
    if (!state) return;
    if (selected !== null && selected !== index && state.cells[selected]) {
      const target = state.cells[index];
      await game.send({ type: target ? 'merge' : 'move', from: selected, to: index });
      setSelected(null);
    } else setSelected(selected === index ? null : index);
  };
  const recruitable = catalog.arms.filter((item) => item.level === 1 && item.subtype !== 3);
  const buildable = catalog.buildings.filter((item) => item.level === 1 && item.type !== 11);
  return (
    <section className={styles.game} dir="rtl" aria-label="لعبة الفزعة">
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.crest}>
            <Castle size={27} />
          </span>
          <div>
            <span className={styles.eyebrow}>تحدي · عالم الاستراتيجية</span>
            <h1>الفزعة</h1>
          </div>
        </div>
        <div className={styles.headerLinks}>
          <button
            ref={helpButton}
            className={styles.voiceLink}
            onClick={() => setGuideOpen((value) => !value)}
            aria-expanded={guideOpen}
          >
            <CircleHelp size={17} />
            دليل اللعب
          </button>
          <Link href="/voice" className={styles.voiceLink}>
            <Mic size={17} /> مجلس الصوت
          </Link>
          <Link href="/games" aria-label="العودة إلى الألعاب" className={styles.back}>
            <ArrowRight size={20} />
          </Link>
        </div>
      </header>
      <div className={styles.modeNotice}>
        <UserRound size={15} />
        <span>
          {demo ? 'تجربة محلية · التقدّم محفوظ على هذا الجهاز' : 'حساب تحدي · تقدّم مستقل للفزعة'}
        </span>
        {demo && <Link href="/games/alfazaa">اللعب بحسابي</Link>}
      </div>
      {game.error && (
        <div role="alert" className={styles.error}>
          {game.error}
          {!demo && <button onClick={() => void game.retry()}>إعادة محاولة الطلب</button>}
          <button onClick={() => void game.reload()}>إعادة المزامنة</button>
        </div>
      )}
      {!state ? (
        <div className={styles.loading}>
          <Castle size={40} />
          <h2>{game.error ? 'لم تُفتح المدينة بعد' : 'جارٍ تجهيز مدينتك…'}</h2>
          {game.error && <Link href="/games/alfazaa?demo=1">افتح التجربة المحلية</Link>}
        </div>
      ) : (
        <>
          <div className={styles.resources} aria-label="موارد المدينة">
            <div>
              <img src={art.ui.gold} alt="" className={styles.resourceIcon} />
              <span>
                <small>الذهب</small>
                <b>{number(state.balances[catalog.meta.goldItemId] || 0)}</b>
              </span>
            </div>
            <div>
              <img src={art.ui.blueprint} alt="" className={styles.resourceIcon} />
              <span>
                <small>مخططات التطوير</small>
                <b>{number(state.balances[catalog.meta.blueprintItemId] || 0)}</b>
              </span>
            </div>
            <div>
              <Castle size={22} />
              <span>
                <small>مستوى القلعة</small>
                <b>{number(state.castleLevel)}</b>
              </span>
            </div>
          </div>
          <Tutorial
            state={state}
            onNavigate={(next) => {
              changeTab(next);
              if (next === 'city') setAction('recruit');
            }}
            open={guideOpen}
            onClose={() => {
              setGuideOpen(false);
              helpButton.current?.focus();
            }}
          />
          <nav className={styles.tabs} aria-label="أقسام الفزعة">
            <button
              aria-current={tab === 'quests' ? 'page' : undefined}
              onClick={() => changeTab('quests')}
            >
              <Flag size={19} />
              المهام
            </button>
            <button
              aria-current={tab === 'city' ? 'page' : undefined}
              onClick={() => changeTab('city')}
            >
              <img src={art.ui.city} alt="" />
              المدينة
            </button>
            <button
              aria-current={tab === 'training' ? 'page' : undefined}
              onClick={() => changeTab('training')}
            >
              <img src={art.ui.training} alt="" />
              تدريب الأبراج <small>65</small>
            </button>
            <button
              aria-current={tab === 'bag' ? 'page' : undefined}
              onClick={() => changeTab('bag')}
            >
              <img src={art.ui.bag} alt="" />
              الحقيبة
            </button>
            <button
              aria-current={tab === 'heroes' ? 'page' : undefined}
              onClick={() => changeTab('heroes')}
            >
              <Shield size={19} />
              الأبطال
            </button>
            <button
              aria-current={tab === 'resources' ? 'page' : undefined}
              onClick={() => changeTab('resources')}
            >
              <Images size={19} />
              الصور
            </button>
          </nav>
          {tab === 'quests' && (
            <QuestsPanel state={state} busy={game.busy} send={game.send} reload={game.reload} />
          )}
          {tab === 'heroes' && <HeroGallery />}
          {tab === 'resources' && <ResourceGallery />}
          {tab === 'city' && (
            <div className={styles.cityLayout}>
              <section className={styles.scenePanel}>
                <div className={styles.sceneTitle}>
                  <div>
                    <span className={styles.eyebrow}>موطن جيشك</span>
                    <h2>مدينتك تبدأ من هنا</h2>
                  </div>
                  <span className={styles.occupancy} dir="ltr">
                    {state.cells.filter(Boolean).length} / 36
                  </span>
                </div>
                <CityScene
                  state={state}
                  selected={selected}
                  select={(index) => void selectCell(index)}
                  busy={game.busy}
                />
                <div className={styles.selection}>
                  {config ? (
                    <>
                      <strong>
                        {config.name} · مستوى {config.level}
                      </strong>
                      <span>
                        {cell?.kind === 'troop'
                          ? 'اختر وحدة مماثلة للدمج، أو خانة فارغة للنقل.'
                          : selectedBuilding?.lvType === 0
                            ? 'ادمج مبنيين متطابقين للترقية، أو اختر خانة فارغة للنقل.'
                            : 'اختر خانة فارغة للنقل. تظهر شروط التطوير أدناه.'}
                      </span>
                      {selectedBuilding && (
                        <span>
                          {!selectedNext
                            ? 'أعلى مستوى متاح في هذه النسخة.'
                            : selectedBuilding.lvType === 0
                              ? 'يتطلب الدمج قلعة بمستوى المبنى الناتج.'
                              : selectedBuilding.lvType === 1
                                ? `شروط التطوير: ${requirements(selectedBuilding)}. التكلفة: ${costText([...selectedBuilding.upgradeCost, [catalog.meta.goldItemId, selectedBuilding.upgradeGold]])}`
                                : 'هذا المبنى للاستعراض في النسخة الحالية؛ لا يدعم الترقية المباشرة.'}
                          {selectedBuilding.type === 4
                            ? ` الدخل: ${number(selectedBuilding.value)} ذهب/دقيقة.`
                            : ''}
                        </span>
                      )}
                      {selectedBuilding?.lvType === 1 && (
                        <button
                          disabled={game.busy || !selectedNext}
                          className={styles.primary}
                          onClick={() =>
                            void game.send({ type: 'upgrade-building', cell: selected! })
                          }
                        >
                          تطوير المبنى
                        </button>
                      )}
                      <button className={styles.secondary} onClick={() => setSelected(null)}>
                        إلغاء الاختيار
                      </button>
                    </>
                  ) : (
                    <span>اضغط على جندي لتحديده. يمكنك اللعب بالنقر أو بلوحة المفاتيح.</span>
                  )}
                </div>
              </section>
              <aside className={styles.commandPanel} aria-label="إدارة المدينة">
                <div className={styles.castleCard}>
                  <Castle size={25} />
                  <h2>قلعة المستوى {state.castleLevel}</h2>
                  <p>طوّر القلعة لتوسيع إمكانات جيشك.</p>
                  <small>
                    {castle && castleNext
                      ? costText([
                          ...(castle.upgradeCost || []),
                          ...(castle.upgradeGold
                            ? [[catalog.meta.goldItemId, castle.upgradeGold] as [number, number]]
                            : []),
                        ])
                      : 'وصلت إلى أعلى مستوى متاح في هذه النسخة'}
                  </small>
                  {castle && castleNext && <p>شروط التطوير: {requirements(castle)}</p>}
                  <button
                    className={styles.primary}
                    disabled={game.busy || !castleNext}
                    onClick={() => void game.send({ type: 'upgrade-castle' })}
                  >
                    <Hammer size={17} />
                    تطوير القلعة
                  </button>
                </div>
                <div className={styles.actionTabs}>
                  <button aria-pressed={action === 'recruit'} onClick={() => setAction('recruit')}>
                    تجنيد
                  </button>
                  <button aria-pressed={action === 'build'} onClick={() => setAction('build')}>
                    بناء
                  </button>
                </div>
                <div className={styles.shop}>
                  {action === 'recruit'
                    ? recruitable.map((arm) => (
                        <article className={styles.shopItem} key={arm.id}>
                          <img src={arm.image} alt="" />
                          <div>
                            <b>{arm.name}</b>
                            <small>{costText(arm.cost)}</small>
                          </div>
                          <button
                            disabled={game.busy}
                            onClick={() => void game.send({ type: 'recruit', cfgId: arm.id })}
                            aria-label={`تجنيد ${arm.name}`}
                          >
                            تجنيد
                          </button>
                        </article>
                      ))
                    : buildable.map((building) => (
                        <article className={styles.shopItem} key={building.id}>
                          <img src={building.image} alt="" />
                          <div>
                            <b>{building.name}</b>
                            <small>{costText(building.buildCost)}</small>
                          </div>
                          <button
                            disabled={game.busy}
                            onClick={() => {
                              const empty =
                                selected !== null && !state.cells[selected]
                                  ? selected
                                  : state.cells.findIndex((c) => !c);
                              void game.send({ type: 'build', cfgId: building.id, cell: empty });
                            }}
                            aria-label={`بناء ${building.name}`}
                          >
                            بناء
                          </button>
                        </article>
                      ))}
                </div>
                <button
                  className={styles.collect}
                  disabled={game.busy}
                  onClick={() => void game.send({ type: 'collect' })}
                >
                  <Coins size={18} />
                  جمع إنتاج المساكن
                </button>
                <p className={styles.hint}>
                  الدخل الحالي: {number(getGoldPerMinute(state))} ذهب/دقيقة. يتراكم حتى 12 ساعة.
                </p>
              </aside>
            </div>
          )}
          {tab === 'training' &&
            (state.battle ? (
              <TowerScene battle={state.battle} send={game.send} busy={game.busy} />
            ) : (
              <Stages
                completed={state.completedTowerLevels}
                busy={game.busy}
                onStart={(id) => void game.send({ type: 'tower-start', levelId: id })}
              />
            ))}
          {tab === 'bag' && (
            <section className={styles.inventory}>
              <h2>حقيبة الموارد</h2>
              <p>موارد مدينتك الحالية، محفوظة {demo ? 'محليًا على الجهاز' : 'في حساب الفزعة'}.</p>
              <div className={styles.inventoryGrid}>
                {Object.entries(state.balances).map(([id, balance]) => {
                  const item = catalog.items.find((i) => String(i.id) === id);
                  return (
                    <article key={id}>
                      {item?.image && <img src={item.image} alt="" />}
                      <h3>{item?.name || `مورد ${id}`}</h3>
                      <b>{number(balance)}</b>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <p className={styles.status} role="status" aria-live="polite">
            {game.busy
              ? 'جارٍ تنفيذ الأمر…'
              : game.message || 'مدينتك جاهزة. جنّد وحدتين وادمجهما لرفع مستواهما.'}
          </p>
        </>
      )}
      <details className={styles.gameRules}>
        <summary>قواعد الفزعة وشروط التقدّم في هذه النسخة</summary>
        <ul>
          <li>الحفظ على الحساب يتطلب جلسة تحدي نشطة. التجربة المحلية مستقلة عن حسابك.</li>
          <li>
            ادمج وحدتين أو مبنيين متطابقين في النوع والمستوى. المباني القابلة للدمج لا تترقى بزر
            التطوير؛ المستشفى والقلعة لهما ترقية مباشرة بشروط وتكلفة معروضتين.
          </li>
          <li>
            حد دمج الجنود هو مستوى القلعة + 2، وحد دمج المباني هو مستوى القلعة. هذه قيود الفزعة
            المبسّطة بدل نظام الأبحاث الأصلي.
          </li>
          <li>
            تنتج المساكن الذهب بالدقيقة، ويتراكم الإنتاج حتى 12 ساعة. تغيير مستوى المساكن يسوّي
            الدخل السابق قبل تطبيق المعدّل الجديد.
          </li>
          <li>
            اكسب مخططات التطوير من المهام. الحضور يُصرف مرة في اليوم ويُجدّد عند منتصف الليل بتوقيت
            الرياض؛ مهام الإنجاز تُصرف مرة واحدة.
          </li>
          <li>
            المتاح حاليًا: 20 مستوى للقلعة و65 ساحة تدريب. الفوز يتطلب امتلاك جميع الأبراج؛ التدريب
            لا يمنح عملات مباشرة.
          </li>
          <li>
            قتال الأبراج وتراكم الإنتاج تنفيذ مستقل مستند إلى بيانات المصدر. موسوعة الأبطال
            للاستعراض؛ قتال الأبطال والتحالفات وPvP والمشتريات غير مفعّلة هنا.
          </li>
        </ul>
      </details>
      <footer className={styles.footer}>
        الفزعة · نسخة ويب تجريبية داخل تحدي{' '}
        <span>المدينة والقتال بتنفيذ مستقل؛ خرائط وصور من الموارد المستخرجة.</span>
      </footer>
    </section>
  );
}
