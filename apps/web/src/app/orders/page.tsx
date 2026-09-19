import { formatNumber } from '@/lib/utils';
import type { Metadata } from 'next';
import { Award, Building2, Crown, Gem, Sparkles, Stamp, Swords } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { PageBackButton } from '@/components/layout';
import {
  LOYALTY_HOSTED_SESSIONS,
  LOYALTY_WINDOW_DAYS,
  PLAN_CODES,
  planDefinition,
  type PlanCode,
} from '@tahaddi/domain';
import { requireActiveUser } from '@/lib/auth/session';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import {
  getDisplayPlanCode,
  planBypassesLimits,
  quotaSnapshot,
  type QuotaSnapshot,
} from '@/lib/subscription/entitlements';
import { LoyaltyClaimForm, RedeemStampForm } from './orders-actions';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'قاعة الأوسمة | تحدّي',
  description: 'رُتب بلاط تحدّي وامتيازاتها: فعّل ختمك الذهبي وارفع مكانتك.',
  alternates: { canonical: '/orders' },
};

const QUOTA_METER_LABELS = {
  maxQuestionsPerMonth: 'أسئلة بنك الأسئلة شهريًا',
  maxLiveRoomsPerMonth: 'غرف مباشرة شهريًا',
  aiQuestionsPerMonth: 'توليد الذكاء الاصطناعي شهريًا',
} as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireActiveUser('/orders');
  const params = await searchParams;
  // Server component render snapshots "now" once for all subscription queries.
  const now = new Date();
  const prisma = hasDatabaseUrl() ? getPrismaClient() : null;

  const planCode: PlanCode = await getDisplayPlanCode(prisma, user.id, user.role);
  const [activeSubscription, hostedCount, lastLoyaltyClaim, questionQuota, roomsQuota, aiQuota] =
    prisma
      ? await Promise.all([
          prisma.userSubscription.findFirst({
            where: { userId: user.id, status: 'ACTIVE', expiresAt: { gt: now } },
            orderBy: { expiresAt: 'desc' },
            select: { planCode: true, expiresAt: true, source: true },
          }),
          prisma.liveSession.count({
            where: {
              hostId: user.id,
              status: 'FINISHED',
              endedAt: {
                gte: new Date(now.getTime() - LOYALTY_WINDOW_DAYS * 24 * 60 * 60 * 1_000),
              },
            },
          }),
          prisma.userSubscription.findFirst({
            where: { userId: user.id, source: 'ACHIEVEMENT' },
            orderBy: { startedAt: 'desc' },
            select: { startedAt: true },
          }),
          quotaSnapshot(user.id, 'maxQuestionsPerMonth', user.role),
          quotaSnapshot(user.id, 'maxLiveRoomsPerMonth', user.role),
          quotaSnapshot(user.id, 'aiQuestionsPerMonth', user.role),
        ])
      : [null, 0, null, null, null, null];

  const quotaMeters: Array<{ label: string; quota: QuotaSnapshot }> = [];
  if (questionQuota)
    quotaMeters.push({ label: QUOTA_METER_LABELS.maxQuestionsPerMonth, quota: questionQuota });
  if (roomsQuota)
    quotaMeters.push({ label: QUOTA_METER_LABELS.maxLiveRoomsPerMonth, quota: roomsQuota });
  if (aiQuota) quotaMeters.push({ label: QUOTA_METER_LABELS.aiQuestionsPerMonth, quota: aiQuota });
  const bypasses = planBypassesLimits(user.role);
  const currentPlan = planDefinition(planCode);
  const currentRankIndex = PLAN_CODES.indexOf(planCode);
  const nextPlanCode = PLAN_CODES.at(currentRankIndex + 1);
  const nextPlan = nextPlanCode ? planDefinition(nextPlanCode) : null;

  const roomLimitParam = typeof params.roomLimit === 'string' ? Number(params.roomLimit) : null;
  const quizMaxParam = typeof params.quizMax === 'string' ? Number(params.quizMax) : null;
  const quotaReached = params.quotaReached === '1';
  const alertMessage = quotaReached
    ? `بلغت حد رتبتك «${currentPlan.name}» هذا الشهر (${formatNumber(Number(params.limit ?? 0))} غرفة). راقِ رتبتك من قاعة الأوسمة أو انتظر الدورة القادمة.`
    : roomLimitParam !== null && quizMaxParam !== null
      ? `غرفتك تستوعب ${formatNumber(quizMaxParam)} لاعبين بينما رتبتك «${currentPlan.name}» تسمح بـ ${formatNumber(roomLimitParam)}. راقِ رتبتك لاستيعاب الجميع.`
      : null;

  return (
    <main className={styles.hall} aria-label="قاعة الأوسمة">
      <PageBackButton className={styles.backButton} />
      <header className={styles.masthead}>
        <span className={styles.eyebrow}>
          <Sparkles aria-hidden="true" />
          بلاط تحدّي
        </span>
        <h1>قاعة الأوسمة</h1>
        <p>
          في تحدّي لا تُباع خطط، بل تُمنح رُتب. فعّل ختمك الذهبي، أو استضف جولاتك حتى يمنحك البلاط
          لقبًا أرفع.
        </p>
      </header>

      {alertMessage && (
        <div className={styles.alert} role="alert">
          <Crown aria-hidden="true" />
          <p>{alertMessage}</p>
          <ButtonLink href="#tiers" variant="gold" size="sm">
            ارفع رتبتك
          </ButtonLink>
        </div>
      )}

      <section className={styles.currentRank} aria-label="رتبتك الحالية">
        <div className={styles.crestRing} data-plan={planCode}>
          <span aria-hidden="true">{currentPlan.emblem}</span>
        </div>
        <div className={styles.currentRankCopy}>
          <span>رتبتك الحالية</span>
          <h2>{currentPlan.name}</h2>
          <p>{currentPlan.tagline}</p>
          {activeSubscription && (
            <small>
              سارية حتى {activeSubscription.expiresAt.toLocaleDateString('ar')} ·{' '}
              {activeSubscription.source === 'ACHIEVEMENT'
                ? 'مُنحت بالوفاء'
                : activeSubscription.source === 'ADMIN'
                  ? 'مُنحت من الإدارة'
                  : 'ختم مفعّل'}
            </small>
          )}
          {bypasses && <small>أعضاء طاقم الإدارة يعملون بلا حدود.</small>}
        </div>
        <div className={styles.rankActions}>
          <RedeemStampForm />
        </div>
        <div className={styles.rankPath} aria-label="مسار رتب البلاط">
          <span>مسار البلاط</span>
          <ol>
            {PLAN_CODES.map((code) => (
              <li
                key={code}
                data-current={code === planCode}
                data-complete={PLAN_CODES.indexOf(code) < currentRankIndex}
              >
                {planDefinition(code).name}
              </li>
            ))}
          </ol>
          <strong>{nextPlan ? `الرتبة القادمة: ${nextPlan.name}` : 'أعلى رتبة في البلاط'}</strong>
        </div>
      </section>

      <section className={styles.tiers} id="tiers" aria-label="رُتب البلاط">
        {PLAN_CODES.map((code) => {
          const definition = planDefinition(code);
          const isCurrent = code === planCode;
          const tierNumber = PLAN_CODES.indexOf(code) + 1;
          return (
            <article
              key={code}
              className={styles.tierCard}
              data-plan={code}
              data-current={isCurrent}
            >
              <div className={styles.tierTopline}>
                <span className={styles.tierRank}>المقام {formatNumber(tierNumber)}</span>
                {isCurrent && <span className={styles.tierStatus}>رتبتك</span>}
              </div>
              <div className={styles.tierIdentity}>
                <span className={styles.tierEmblem} aria-hidden="true">
                  {definition.emblem}
                </span>
                <div>
                  <h3>{definition.name}</h3>
                  <p className={styles.tierTagline}>{definition.tagline}</p>
                </div>
              </div>
              <p className={styles.tierPrice}>
                {definition.monthlyPriceSar === 0
                  ? 'مجانًا'
                  : `${formatNumber(definition.monthlyPriceSar)} ر.س / شهر`}
              </p>
              <ul className={styles.tierLimits} aria-label={`امتيازات رتبة ${definition.name}`}>
                <li>
                  <Swords aria-hidden="true" />
                  {formatNumber(definition.limits.maxRoomPlayers)} لاعب في الغرفة
                </li>
                <li>
                  <Building2 aria-hidden="true" />
                  {formatNumber(definition.limits.maxLiveRoomsPerMonth)} غرفة مباشرة شهريًا
                </li>
                <li>
                  <Award aria-hidden="true" />
                  {formatNumber(definition.limits.maxQuestionsPerMonth)} سؤال في بنكك شهريًا
                </li>
                <li>
                  <Gem aria-hidden="true" />
                  {formatNumber(definition.limits.aiQuestionsPerMonth)} توليد بالذكاء شهريًا
                </li>
                {definition.limits.deepReports && <li>تقارير عميقة للجولات</li>}
                {definition.limits.customRoomBranding && <li>علامة خاصة على غرفك</li>}
                {definition.limits.earlyAccessGames && <li>ألعاب جديدة قبل الجميع</li>}
              </ul>
              <div className={styles.tierFooter}>
                {isCurrent ? (
                  <p className={styles.tierCurrent}>رتبتك الآن</p>
                ) : (
                  <p className={styles.tierHint}>
                    تُفعَّل بختم {definition.name} — اطلبه من إدارة البلاط
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.meters} aria-label="حدودك هذا الشهر">
        <h2>حدودك هذا الشهر</h2>
        <ul>
          {quotaMeters.map(({ label, quota }) => {
            const percentage =
              quota.unlimited || quota.limit === 0
                ? 0
                : Math.min(100, Math.round((quota.used / quota.limit) * 100));
            return (
              <li key={label}>
                <div>
                  <span>{label}</span>
                  <b>
                    {quota.unlimited
                      ? 'بلا حدود'
                      : `${formatNumber(quota.used)} / ${formatNumber(quota.limit)}`}
                  </b>
                </div>
                <span
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentage}
                  aria-valuetext={quota.unlimited ? 'بلا حدود' : undefined}
                >
                  <i style={{ width: `${percentage}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.loyalty} aria-label="وفاء البلاط">
        <div className={styles.loyaltyCopy}>
          <span className={styles.eyebrow}>
            <Stamp aria-hidden="true" />
            وفاء البلاط
          </span>
          <h2>ختم مجاني لمن يُخلص بالاستضافة</h2>
          <p>
            استضف {formatNumber(LOYALTY_HOSTED_SESSIONS)} جولات مكتملة خلال{' '}
            {formatNumber(LOYALTY_WINDOW_DAYS)} يومًا، ويمنحك البلاط ختم «الفارس» مجانيًا لمدة أسبوع.{' '}
            {lastLoyaltyClaim ? 'شكرًا لوفائك السابق!' : 'الوفاء هنا يُكافأ، لا يُشترى.'}
          </p>
        </div>
        <LoyaltyClaimForm hostedCount={hostedCount} needed={LOYALTY_HOSTED_SESSIONS} />
      </section>
    </main>
  );
}
