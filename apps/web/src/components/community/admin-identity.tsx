'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  Award,
  ClipboardList,
  Eye,
  Gift,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/overlay';
import { EntranceEffectPreview } from '@/components/community-voice/entrance-effect';
import type {
  AdminCommunityData,
  CommunityBadge,
  CommunityCosmetic,
  CosmeticKind,
  EntranceTier,
} from '@/lib/community/contracts';
import { CommunityAssetField } from './asset-field';
import { BadgeSeal, communityRequest } from './community-ui';
import styles from './community.module.css';

const tierLabels: Record<EntranceTier, string> = {
  ordinary: 'عادي',
  silver: 'فضي',
  gold: 'ذهبي',
  diamond: 'ماسي',
  royal: 'ملكي',
  legend: 'أسطوري',
};
const kindLabels: Record<CosmeticKind, string> = {
  FRAME: 'إطار',
  EFFECT: 'تأثير دخول',
  NAME_CARD: 'بطاقة اسم',
  BACKGROUND: 'خلفية',
  GLOW: 'إضاءة',
};
const categories: Record<string, string> = {
  ADMIN: 'إدارة',
  DISTINCTION: 'تميز',
  ACHIEVEMENT: 'إنجاز',
  COMMUNITY: 'مجتمع',
};
const rarities: Record<string, string> = {
  common: 'عادية',
  rare: 'نادرة',
  epic: 'ملحمية',
  legendary: 'أسطورية',
};
const emptyBadge: CommunityBadge = {
  id: '',
  name: '',
  description: '',
  category: 'COMMUNITY',
  rarity: 'common',
  assetUrl: null,
  sensitive: false,
  archived: false,
  effectId: null,
  frameId: null,
};
const emptyCosmetic: CommunityCosmetic = {
  id: '',
  name: '',
  description: '',
  kind: 'EFFECT',
  tier: 'ordinary',
  token: 'neutral',
  assetUrl: null,
  archived: false,
  free: false,
};

export function AdminIdentity({
  canGrantSensitive,
  initialData,
}: {
  canGrantSensitive: boolean;
  initialData?: AdminCommunityData;
}) {
  const [data, setData] = useState<AdminCommunityData | null>(initialData ?? null);
  const [tab, setTab] = useState<'badges' | 'effects' | 'grants' | 'audit'>('badges');
  const [badge, setBadge] = useState<CommunityBadge>(emptyBadge);
  const [cosmetic, setCosmetic] = useState<CommunityCosmetic>(emptyCosmetic);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [revocation, setRevocation] = useState<{
    payload: Record<string, unknown>;
    success: string;
  } | null>(null);
  const [grantKind, setGrantKind] = useState<'badge' | 'cosmetic'>('badge');
  const [preview, setPreview] = useState<EntranceTier>('ordinary');
  useEffect(() => {
    if (initialData) return;
    let active = true;
    communityRequest<AdminCommunityData>('/api/community/admin')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((failure: unknown) => {
        if (active)
          setError(failure instanceof Error ? failure.message : 'تعذّر تحميل لوحة الإدارة.');
      });
    return () => {
      active = false;
    };
  }, [initialData]);
  async function command(payload: Record<string, unknown>, success: string) {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await communityRequest('/api/community/admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setData(await communityRequest<AdminCommunityData>('/api/community/admin'));
      setMessage(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذّر تنفيذ الإجراء.');
    } finally {
      setPending(false);
    }
  }
  function requestRevocation(payload: Record<string, unknown>, success: string) {
    setRevocation({ payload, success });
  }
  function saveBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void command({ operation: 'saveBadge', ...badge }, 'حُفظت الشارة وسُجل التعديل.');
  }
  function saveCosmetic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void command({ operation: 'saveCosmetic', ...cosmetic }, 'حُفظ العنصر وسُجل التعديل.');
  }
  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = form.get('kind');
    const itemId = String(form.get('itemId') ?? '');
    const expiry = String(form.get('expiresAt') ?? '');
    const accountNumber = Number(form.get('accountNumber'));
    if (!/^(?:1|[1-9]\d{8})$/.test(String(accountNumber))) {
      setError('أدخل 1 لصاحب الموقع أو معرّف حساب من 9 أرقام.');
      return;
    }
    void command(
      {
        operation: kind === 'badge' ? 'grantBadge' : 'grantCosmetic',
        accountNumber,
        ...(kind === 'badge' ? { badgeId: itemId } : { cosmeticId: itemId }),
        expiresAt: expiry ? new Date(expiry).toISOString() : null,
      },
      'تم منح العنصر وتسجيل العملية.',
    );
  }
  if (!data)
    return (
      <section className={styles.panel}>
        <p role={error ? 'alert' : 'status'}>{error || 'نحمّل الشارات والمقتنيات…'}</p>
      </section>
    );
  return (
    <div className={styles.page}>
      <header className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>هوية المجتمع</p>
          <h1>الشارات وتأثيرات الدخول</h1>
          <p>استحقاقات قابلة للمراجعة، وهوية منفصلة عن صلاحيات الإدارة.</p>
        </div>
        <ShieldCheck size={35} aria-hidden="true" />
      </header>
      <p className={styles.notice}>
        منح شارة لا يمنح صلاحيات إدارية.{' '}
        {canGrantSensitive
          ? 'يمكنك إدارة الشارات الحساسة بصفتك صاحب المنصة.'
          : 'الشارات الإدارية الحساسة محجوزة لصاحب المنصة.'}
      </p>
      {(message || error) && (
        <p className={error ? styles.error : styles.notice} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}
      <nav className={styles.tabs} aria-label="إدارة الهوية">
        {[
          { id: 'badges', label: 'الشارات', Icon: Award },
          { id: 'effects', label: 'التأثيرات والمقتنيات', Icon: Sparkles },
          { id: 'grants', label: 'المنح والسحب', Icon: Gift },
          { id: 'audit', label: 'سجل التدقيق', Icon: ClipboardList },
        ].map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => setTab(id as typeof tab)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      {tab === 'badges' && (
        <div className={styles.adminGrid}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2>سجل الشارات</h2>
              <Button variant="outline" onClick={() => setBadge({ ...emptyBadge })}>
                <Plus size={17} aria-hidden="true" /> شارة جديدة
              </Button>
            </div>
            <div className={styles.catalogList}>
              {data.badges.map((item) => (
                <article key={item.id}>
                  <BadgeSeal badge={item} />
                  <div>
                    <small>
                      {categories[item.category] ?? item.category} ·{' '}
                      {rarities[item.rarity] ?? item.rarity}
                      {item.archived && ' · مؤرشفة'}
                    </small>
                    <Button variant="ghost" onClick={() => setBadge({ ...item })}>
                      <Pencil size={16} aria-hidden="true" /> تعديل {item.name}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <form className={styles.panel} onSubmit={saveBadge}>
            <h2>{badge.id ? 'تحرير الشارة' : 'شارة جديدة'}</h2>
            <div className={styles.fieldsGrid}>
              <label>
                المعرّف الفريد
                <input
                  value={badge.id}
                  onChange={(event) => setBadge({ ...badge, id: event.target.value })}
                  required
                  minLength={2}
                  maxLength={80}
                  pattern="[a-z][a-z0-9-]{1,79}"
                  dir="ltr"
                />
              </label>
              <label>
                اسم الشارة
                <input
                  value={badge.name}
                  onChange={(event) => setBadge({ ...badge, name: event.target.value })}
                  required
                  maxLength={80}
                />
              </label>
              <label className={styles.fieldWide}>
                الوصف وشروط الاستحقاق
                <textarea
                  value={badge.description}
                  onChange={(event) => setBadge({ ...badge, description: event.target.value })}
                  required
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label>
                الفئة
                <select
                  value={badge.category}
                  onChange={(event) => setBadge({ ...badge, category: event.target.value })}
                >
                  {Object.entries(categories).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الندرة
                <select
                  value={badge.rarity}
                  onChange={(event) => setBadge({ ...badge, rarity: event.target.value })}
                >
                  {Object.entries(rarities).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.fieldWide}>
                <CommunityAssetField
                  label="صورة الشارة"
                  value={badge.assetUrl}
                  onChange={(assetUrl) => setBadge({ ...badge, assetUrl })}
                />
              </div>
              <label>
                تأثير الدخول المرتبط
                <select
                  value={badge.effectId ?? ''}
                  onChange={(event) => setBadge({ ...badge, effectId: event.target.value || null })}
                >
                  <option value="">بدون</option>
                  {data.cosmetics
                    .filter((item) => item.kind === 'EFFECT' && !item.archived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                الإطار المرتبط
                <select
                  value={badge.frameId ?? ''}
                  onChange={(event) => setBadge({ ...badge, frameId: event.target.value || null })}
                >
                  <option value="">بدون</option>
                  {data.cosmetics
                    .filter((item) => item.kind === 'FRAME' && !item.archived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={badge.sensitive}
                  disabled={!canGrantSensitive}
                  onChange={(event) => setBadge({ ...badge, sensitive: event.target.checked })}
                />{' '}
                شارة إدارية حساسة
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={badge.archived}
                  onChange={(event) => setBadge({ ...badge, archived: event.target.checked })}
                />{' '}
                أرشفة الشارة وإيقاف ظهورها
              </label>
            </div>
            <Button
              type="submit"
              variant="gold"
              loading={pending}
              disabled={!canGrantSensitive && (badge.sensitive || badge.category === 'ADMIN')}
            >
              حفظ الشارة
            </Button>
          </form>
        </div>
      )}
      {tab === 'effects' && (
        <div className={styles.adminGrid}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2>المقتنيات والتأثيرات</h2>
              <Button variant="outline" onClick={() => setCosmetic({ ...emptyCosmetic })}>
                <Plus size={17} aria-hidden="true" /> عنصر جديد
              </Button>
            </div>
            <div className={styles.catalogList}>
              {data.cosmetics.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {kindLabels[item.kind]} · {tierLabels[item.tier]}
                      {item.archived && ' · مؤرشف'}
                    </small>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCosmetic({ ...item });
                      setPreview(item.tier);
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" /> تعديل
                  </Button>
                </article>
              ))}
            </div>
            <h3>
              <Eye size={18} aria-hidden="true" /> معاينة التأثير
            </h3>
            <label>
              المستوى
              <select
                value={preview}
                onChange={(event) => setPreview(event.target.value as EntranceTier)}
              >
                {Object.entries(tierLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <EntranceEffectPreview
              tier={preview}
              name="عضو تحدّي"
              badge="معاينة قبل الحفظ"
              effectAssetUrl={cosmetic.kind === 'EFFECT' ? cosmetic.assetUrl : null}
            />
          </section>
          <form className={styles.panel} onSubmit={saveCosmetic}>
            <h2>تحرير المقتنى</h2>
            <div className={styles.fieldsGrid}>
              <label>
                المعرّف
                <input
                  dir="ltr"
                  value={cosmetic.id}
                  onChange={(event) => setCosmetic({ ...cosmetic, id: event.target.value })}
                  minLength={2}
                  maxLength={80}
                  pattern="[a-z][a-z0-9-]{1,79}"
                  required
                />
              </label>
              <label>
                الاسم
                <input
                  value={cosmetic.name}
                  onChange={(event) => setCosmetic({ ...cosmetic, name: event.target.value })}
                  maxLength={80}
                  required
                />
              </label>
              <label className={styles.fieldWide}>
                الوصف
                <textarea
                  value={cosmetic.description}
                  onChange={(event) =>
                    setCosmetic({ ...cosmetic, description: event.target.value })
                  }
                  required
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label>
                النوع
                <select
                  value={cosmetic.kind}
                  onChange={(event) =>
                    setCosmetic({ ...cosmetic, kind: event.target.value as CosmeticKind })
                  }
                >
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                المستوى
                <select
                  value={cosmetic.tier}
                  onChange={(event) => {
                    setCosmetic({
                      ...cosmetic,
                      tier: event.target.value as EntranceTier,
                      token: event.target.value === 'ordinary' ? 'neutral' : event.target.value,
                    });
                    setPreview(event.target.value as EntranceTier);
                  }}
                >
                  {Object.entries(tierLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.fieldWide}>
                <CommunityAssetField
                  label="الأصل البصري"
                  value={cosmetic.assetUrl}
                  onChange={(assetUrl) => setCosmetic({ ...cosmetic, assetUrl })}
                />
              </div>
            </div>
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={cosmetic.free}
                  onChange={(event) => setCosmetic({ ...cosmetic, free: event.target.checked })}
                />{' '}
                متاح لجميع الحسابات
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={cosmetic.archived}
                  onChange={(event) => setCosmetic({ ...cosmetic, archived: event.target.checked })}
                />{' '}
                أرشفة العنصر
              </label>
            </div>
            <Button variant="gold" type="submit" loading={pending}>
              حفظ المقتنى
            </Button>
          </form>
        </div>
      )}
      {tab === 'grants' && (
        <div className={styles.adminGrid}>
          <form className={styles.panel} onSubmit={grant}>
            <h2>
              <Gift size={20} aria-hidden="true" /> منح استحقاق
            </h2>
            <label>
              معرّف الحساب
              <input
                name="accountNumber"
                dir="ltr"
                inputMode="numeric"
                pattern="1|[1-9][0-9]{8}"
                required
                placeholder="123456789"
              />
            </label>
            <label>
              نوع العنصر
              <select
                name="kind"
                value={grantKind}
                onChange={(event) => setGrantKind(event.target.value as typeof grantKind)}
              >
                <option value="badge">شارة</option>
                <option value="cosmetic">مقتنى أو تأثير</option>
              </select>
            </label>
            <label>
              معرّف العنصر
              <select name="itemId" key={grantKind} required>
                <option value="">اختر العنصر</option>
                {grantKind === 'badge'
                  ? data.badges
                      .filter(
                        (item) =>
                          !item.archived &&
                          (canGrantSensitive || (!item.sensitive && item.category !== 'ADMIN')),
                      )
                      .map((item) => (
                        <option key={`badge-${item.id}`} value={item.id}>
                          {item.name}
                        </option>
                      ))
                  : data.cosmetics
                      .filter((item) => !item.archived)
                      .map((item) => (
                        <option key={`cosmetic-${item.id}`} value={item.id}>
                          {item.name}
                        </option>
                      ))}
              </select>
            </label>
            <label>
              تاريخ الانتهاء (اختياري)
              <input type="datetime-local" name="expiresAt" />
            </label>
            <Button type="submit" variant="gold" loading={pending}>
              منح وتسجيل العملية
            </Button>
            <p className={styles.muted}>تحقّق من نوع العنصر ومعرّف الحساب قبل المنح.</p>
          </form>
          <section className={styles.panel}>
            <h2>الشارات الممنوحة</h2>
            <div className={styles.catalogList}>
              {data.grants.length ? (
                data.grants.map((grant) => (
                  <article key={grant.id}>
                    <div>
                      <strong>
                        {grant.name} · <bdi dir="ltr">{grant.accountNumber}</bdi>
                      </strong>
                      <span>{grant.badge.name}</span>
                      <small>
                        {grant.revokedAt
                          ? 'مسحوبة'
                          : grant.expiresAt
                            ? `حتى ${new Date(grant.expiresAt).toLocaleDateString('ar-SA-u-ca-gregory')}`
                            : 'بدون انتهاء'}
                      </small>
                    </div>
                    <Button
                      variant="outline"
                      disabled={
                        pending ||
                        Boolean(grant.revokedAt) ||
                        (!canGrantSensitive &&
                          (grant.badge.sensitive || grant.badge.category === 'ADMIN'))
                      }
                      onClick={() =>
                        requestRevocation(
                          {
                            operation: 'revokeBadge',
                            accountNumber: grant.accountNumber,
                            badgeId: grant.badge.id,
                          },
                          'سُحبت الشارة وسُجلت العملية.',
                        )
                      }
                    >
                      <Undo2 size={16} aria-hidden="true" /> سحب
                    </Button>
                  </article>
                ))
              ) : (
                <p className={styles.muted}>لا توجد عمليات منح مسجلة بعد.</p>
              )}
            </div>
            <h3>سحب مقتنى من حساب</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                requestRevocation(
                  {
                    operation: 'revokeCosmetic',
                    accountNumber: Number(form.get('accountNumber')),
                    cosmeticId: form.get('cosmeticId'),
                  },
                  'سُحب المقتنى وسُجلت العملية.',
                );
              }}
            >
              <label>
                معرّف الحساب
                <input
                  name="accountNumber"
                  dir="ltr"
                  inputMode="numeric"
                  pattern="1|[1-9][0-9]{8}"
                  required
                />
              </label>
              <label>
                المقتنى
                <select name="cosmeticId" required>
                  {data.cosmetics.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="outline" disabled={pending}>
                <Archive size={16} aria-hidden="true" /> سحب المقتنى
              </Button>
            </form>
          </section>
        </div>
      )}
      <AlertDialog
        open={Boolean(revocation)}
        onOpenChange={(open) => {
          if (!open) setRevocation(null);
        }}
        title="تأكيد سحب الاستحقاق"
        description={`سيُسحب العنصر من الحساب ${revocation?.payload.accountNumber ?? ''} ويتوقف ظهوره، مع تسجيل العملية في سجل التدقيق.`}
      >
        <div className={styles.confirmActions}>
          <Button variant="outline" onClick={() => setRevocation(null)}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!revocation) return;
              const request = revocation;
              setRevocation(null);
              void command(request.payload, request.success);
            }}
          >
            تأكيد السحب
          </Button>
        </div>
      </AlertDialog>
      {tab === 'audit' && (
        <section className={styles.panel}>
          <h2>سجل التعديلات والمنح والسحب</h2>
          {data.audit.length ? (
            <ol className={styles.auditList}>
              {data.audit.map((entry) => (
                <li key={entry.id}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  <span>
                    <strong>{entry.action}</strong>
                    <small>{entry.resourceId || 'عملية على الهوية'}</small>
                  </span>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString('ar-SA-u-ca-gregory')}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>لا توجد عمليات مسجلة بعد.</p>
          )}
        </section>
      )}
    </div>
  );
}
