import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Crown,
  Layers,
  Megaphone,
  Minus,
  Plus,
  Radio,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { AdminVerifiedName, ButtonLink } from '@/components/ui';
import {
  PERMISSION_LABELS,
  ROLE_LABELS,
  canAccessAdmin,
  isAppRole,
  isManagerRole,
  permissionsForRole,
  type AdminPermission,
  type AppRole,
} from '@/lib/auth/authorization';
import { type SparkTone, type SparkTrend } from '@/lib/profile/metrics';
import { cn } from '@/lib/utils';
import { planDefinition, type PlanCode } from '@tahaddi/domain';
import { CommandCrown } from './command-crown';
import { CommandSparkline } from './command-sparkline';
import styles from './command-profile.module.css';

export type CommandProfileStat = {
  label: string;
  value: string;
  hint: string;
  series?: readonly number[];
  tone?: SparkTone;
  trend?: SparkTrend;
};

export type CommandProfileBadgeTone = 'gold' | 'sapphire' | 'emerald' | 'silver';

export type CommandProfileBadge = {
  id: string;
  label: string;
  description: string;
  tone: CommandProfileBadgeTone;
  Icon: LucideIcon;
  featured?: boolean;
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: 'حساب نشط',
  SUSPENDED: 'موقوف',
  DELETED: 'محذوف',
};

const PERMISSION_ORDER: readonly AdminPermission[] = [
  'MANAGE_USERS',
  'MANAGE_CONTENT',
  'MANAGE_ROOMS',
  'VIEW_AUDIT',
  'MANAGE_ROLES',
  'PUBLISH_CONTENT',
  'VIEW_REPORTS',
];

const PERMISSION_ICONS: Readonly<Record<AdminPermission, LucideIcon>> = {
  MANAGE_USERS: Users,
  MANAGE_CONTENT: Layers,
  MANAGE_ROOMS: Radio,
  VIEW_AUDIT: ScrollText,
  MANAGE_ROLES: Shield,
  PUBLISH_CONTENT: Megaphone,
  VIEW_REPORTS: BarChart3,
};

const BADGE_TONE_CLASS: Readonly<Record<CommandProfileBadgeTone, string>> = {
  gold: styles.tone_gold,
  sapphire: styles.tone_sapphire,
  emerald: styles.tone_emerald,
  silver: styles.tone_silver,
};

const BADGE_ART: Readonly<Record<string, string>> = {
  command: '/profile/badge-owner.png',
  verified: '/profile/badge-verified.png',
  active: '/profile/badge-active.png',
  builder: '/profile/badge-builder.png',
  audience: '/profile/badge-audience.png',
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ت';
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('');
  const first = Array.from(parts[0])[0] ?? '';
  const second = Array.from(parts[1])[0] ?? '';
  return `${first}${second}`;
}

export function isCommandProfileRole(role: unknown): role is 'ADMIN' | 'OWNER' {
  return isManagerRole(role);
}

function parseStatValue(value: string): number {
  const normalized = value.replace(/[٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - '٠'.charCodeAt(0)),
  );
  const digits = normalized.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

function orderedPermissions(role: string): readonly AdminPermission[] {
  const granted = new Set(permissionsForRole(role));
  const ordered = PERMISSION_ORDER.filter((permission) => granted.has(permission));
  const extras = permissionsForRole(role).filter((permission) => !PERMISSION_ORDER.includes(permission));
  return [...ordered, ...extras];
}

export function resolveCommandBadges({
  role,
  status,
  stats,
  platformStats = [],
}: {
  role: string;
  status: string;
  stats: readonly CommandProfileStat[];
  platformStats?: readonly CommandProfileStat[];
}): CommandProfileBadge[] {
  if (!isCommandProfileRole(role)) return [];

  const followerCount = parseStatValue(
    stats.find((item) => item.label === 'المتابعون')?.value ?? '0',
  );
  const liveRooms = parseStatValue(
    platformStats.find((item) => item.label === 'الغرف الحية' || item.label === 'غرف حيّة')?.value ??
      '0',
  );
  const platformUsers = parseStatValue(
    platformStats.find((item) => item.label === 'حسابات المنصة')?.value ?? '0',
  );

  const badges: CommandProfileBadge[] = [
    {
      id: 'command',
      label: role === 'OWNER' ? 'مالك المنصة' : 'أدمن المنصة',
      description:
        role === 'OWNER'
          ? 'أعلى رتبة قيادة: قرارات الخادم والمشهد الكامل.'
          : 'صلاحيات إدارية كاملة على المنصة والمحتوى.',
      tone: 'gold',
      Icon: Crown,
      featured: true,
    },
    {
      id: 'verified',
      label: 'مدير موثّق',
      description: 'شارة تحقق رسمية لحساب القيادة في تحدّي.',
      tone: 'sapphire',
      Icon: ShieldCheck,
    },
  ];

  if (status === 'ACTIVE') {
    badges.push({
      id: 'active',
      label: 'حساب نشط',
      description: 'الحساب مفعّل وجاهز لإدارة الغرف والمسابقات.',
      tone: 'emerald',
      Icon: Radio,
    });
  }

  if (role === 'OWNER') {
    badges.push({
      id: 'builder',
      label: 'باني تحدّي',
      description: 'هوية المؤسس: البناء والتصميم والرعاية المستمرة.',
      tone: 'gold',
      Icon: Sparkles,
    });
  }

  if (role === 'OWNER' || followerCount > 0 || liveRooms > 0 || platformUsers > 0) {
    badges.push({
      id: 'audience',
      label: 'رائد الجمهور',
      description: 'يراقب الحضور والغرف الحيّة عبر المنصة.',
      tone: 'silver',
      Icon: Users,
    });
  }

  return badges;
}

export function CommandIdentityStrip({
  name,
  role,
}: {
  name: string;
  role: AppRole;
}) {
  const elevated = isCommandProfileRole(role);
  return (
    <aside className={styles.strip} aria-label="هوية القيادة">
      <div className={styles.stripCopy}>
        <span className={styles.eyebrow}>
          {elevated ? <Crown aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {elevated ? 'مركز القيادة' : 'حساب تحدّي'}
        </span>
        <strong>
          <AdminVerifiedName isManager={elevated}>{name}</AdminVerifiedName>
        </strong>
        <span className={styles.stripRole}>{ROLE_LABELS[role]}</span>
      </div>
      <div className={styles.stripActions}>
        <ButtonLink href="/profile" variant="outline">
          الملف الشخصي
        </ButtonLink>
        <ButtonLink href="/admin" variant="gold">
          إدارة المنصة
        </ButtonLink>
      </div>
    </aside>
  );
}

function ProfileMark({
  initials,
  src,
}: {
  initials: string;
  src?: string | null;
}) {
  return (
    <span className={styles.mark} aria-label={`الصورة الرمزية: ${initials}`}>
      {src ? <Image src={src} alt="" fill sizes="4.75rem" unoptimized /> : initials}
    </span>
  );
}

function StatTrendIcon({ trend }: { trend: SparkTrend }) {
  if (trend === 'down') {
    return <ArrowDownRight className={styles.trendDown} aria-hidden="true" />;
  }
  if (trend === 'flat') {
    return <Minus className={styles.trendFlat} aria-hidden="true" />;
  }
  return <ArrowUpRight className={styles.trendUp} aria-hidden="true" />;
}

export function CommandProfile({
  name,
  email,
  role,
  status,
  stats,
  platformStats = [],
  image,
  planCode = 'SPECTATOR',
}: {
  name: string;
  email: string;
  role: string;
  status: string;
  stats: readonly CommandProfileStat[];
  platformStats?: readonly CommandProfileStat[];
  image?: string | null;
  planCode?: PlanCode;
}) {
  const elevated = isCommandProfileRole(role);
  const roleLabel = isAppRole(role) ? ROLE_LABELS[role] : role;
  const statusLabel = STATUS_LABELS[status] ?? status;
  const permissions = orderedPermissions(role);
  const displayName = name.trim() || 'مستخدم تحدّي';
  const commandBadges = resolveCommandBadges({ role, status, stats, platformStats });
  const featuredBadge = commandBadges.find((badge) => badge.featured);
  const startBadges = commandBadges.filter((badge) => badge.id === 'verified' || badge.id === 'active');
  const endBadges = commandBadges.filter((badge) => badge.id === 'builder' || badge.id === 'audience');
  const visibleStats = elevated ? [...stats, ...platformStats] : stats;
  const initials = initialsFromName(displayName);

  return (
    <section className={cn(styles.stage, elevated && styles.elevated)} aria-labelledby="profile-identity">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <ProfileMark initials={initials} src={image} />
          <div className={styles.identityCopy}>
            <h2 className={styles.displayName} id="profile-identity">
              <AdminVerifiedName isManager={elevated}>{displayName}</AdminVerifiedName>
            </h2>
            {email ? (
              <p className={styles.email} dir="ltr">
                {email}
              </p>
            ) : null}
            <div className={styles.badges}>
              <span className={cn(styles.roleChip, elevated && styles.roleChipElevated)}>
                {elevated ? <Crown aria-hidden="true" /> : <UserRound aria-hidden="true" />}
                {roleLabel}
              </span>
              {elevated ? (
                <span className={styles.verifiedChip}>
                  <ShieldCheck aria-hidden="true" />
                  مدير موثّق
                </span>
              ) : (
                <span className={styles.statusChip}>{statusLabel}</span>
              )}
              <span className={styles.courtRankChip} data-plan={planCode}>
                {planDefinition(planCode).name}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.crownStage}>
          <CommandCrown />
        </div>
      </header>

      {elevated && commandBadges.length > 0 ? (
        <section className={styles.badgeRack} aria-labelledby="profile-badges">
          <div className={styles.badgeRackHead}>
            <h3 id="profile-badges">
              <Sparkles aria-hidden="true" />
              شارات القيادة
            </h3>
            <p>شارات معدنية تعكس رتبة المدير وحضور المنصة.</p>
          </div>
          <div className={styles.badgeShowcase}>
            <div className={styles.badgeCol}>
              {startBadges.map((badge) => (
                <LeadershipBadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
            {featuredBadge ? (
              <LeadershipBadgeCard badge={featuredBadge} featured />
            ) : null}
            <div className={styles.badgeCol}>
              {endBadges.map((badge) => (
                <LeadershipBadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className={cn(styles.stats, elevated && styles.statsElevated)} role="list">
        {visibleStats.map((stat) => (
          <article key={stat.label} className={styles.stat} role="listitem">
            <span className={styles.statTrend} aria-hidden="true">
              <StatTrendIcon trend={stat.trend ?? 'flat'} />
            </span>
            <span className={styles.statLabel}>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
            {stat.series && stat.series.length > 0 ? (
              <CommandSparkline
                values={stat.series}
                tone={stat.tone ?? 'gold'}
                label={stat.label}
              />
            ) : null}
          </article>
        ))}
      </div>

      {elevated ? (
        <nav className={styles.commands} aria-label="اختصارات القيادة">
          <ButtonLink href="/admin" variant="outline" className={styles.commandBtn}>
            <ShieldCheck aria-hidden="true" />
            إدارة المنصة
          </ButtonLink>
          <ButtonLink href="/questions" variant="outline" className={styles.commandBtn}>
            <Layers aria-hidden="true" />
            بنك الأسئلة
          </ButtonLink>
          <ButtonLink href="/quizzes/new" variant="outline" className={styles.commandBtn}>
            <Plus aria-hidden="true" />
            مسابقة جديدة
          </ButtonLink>
          <ButtonLink href="/host" variant="outline" className={styles.commandBtn}>
            <Radio aria-hidden="true" />
            إدارة الصفحة
          </ButtonLink>
        </nav>
      ) : (
        <nav className={styles.commands} aria-label="اختصارات الحساب">
          {canAccessAdmin(role) ? (
            <ButtonLink href="/admin" variant="outline" className={styles.commandBtn}>
              <ShieldCheck aria-hidden="true" />
              إدارة المنصة
            </ButtonLink>
          ) : null}
          <ButtonLink href="/quizzes/new" variant="outline" className={styles.commandBtn}>
            <Plus aria-hidden="true" />
            مسابقة جديدة
          </ButtonLink>
          <ButtonLink href="/host" variant="outline" className={styles.commandBtn}>
            <Radio aria-hidden="true" />
            لوحة المضيف
          </ButtonLink>
        </nav>
      )}

      {permissions.length > 0 ? (
        <section className={styles.permissions} aria-labelledby="profile-permissions">
          <h3 id="profile-permissions">
            <Shield aria-hidden="true" />
            صلاحيات الخاص
          </h3>
          <ul>
            {permissions.map((permission) => {
              const Icon = PERMISSION_ICONS[permission];
              return (
                <li key={permission}>
                  <span className={styles.permissionCopy}>
                    <Icon aria-hidden="true" />
                    {PERMISSION_LABELS[permission]}
                  </span>
                  <em>
                    <ShieldCheck aria-hidden="true" />
                    Unlocked
                  </em>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <dl className={styles.identity}>
          <div>
            <dt>البريد</dt>
            <dd dir="ltr">{email || '—'}</dd>
          </div>
          <div>
            <dt>الدور</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt>الحالة</dt>
            <dd>{statusLabel}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function LeadershipBadgeCard({
  badge,
  featured = false,
}: {
  badge: CommandProfileBadge;
  featured?: boolean;
}) {
  const Icon = badge.Icon;
  const art = BADGE_ART[badge.id];
  return (
    <article
      className={cn(
        styles.badgeCard,
        BADGE_TONE_CLASS[badge.tone],
        featured && styles.badgeFeatured,
      )}
    >
      <span className={styles.badgeGlyph} aria-hidden="true">
        {art ? (
          <Image
            className={styles.badgeArt}
            src={art}
            alt=""
            fill
            sizes={featured ? '9rem' : '5rem'}
          />
        ) : (
          <Icon />
        )}
      </span>
      <div className={styles.badgeCopy}>
        <strong>{badge.label}</strong>
        <span>{badge.description}</span>
      </div>
    </article>
  );
}
