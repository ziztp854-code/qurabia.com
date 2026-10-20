'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Eye, LockKeyhole, Save, Settings2, Sparkles } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { EntranceEffectPreview } from '@/components/community-voice/entrance-effect';
import type {
  AppearanceSelection,
  CosmeticKind,
  MyCommunityProfile,
} from '@/lib/community/contracts';
import {
  BadgeSeal,
  CommunityAvatar,
  PhotoNameCard,
  communityRequest,
  previewImageUrl,
} from './community-ui';
import styles from './community.module.css';

const slots: { key: keyof AppearanceSelection; kind: CosmeticKind; label: string }[] = [
  { key: 'frameId', kind: 'FRAME', label: 'إطار الصورة' },
  { key: 'effectId', kind: 'EFFECT', label: 'تأثير الدخول' },
  { key: 'nameCardId', kind: 'NAME_CARD', label: 'بطاقة الاسم' },
  { key: 'backgroundId', kind: 'BACKGROUND', label: 'خلفية البروفايل' },
  { key: 'glowId', kind: 'GLOW', label: 'إضاءة الصورة' },
];

export function AppearanceEditor({ initialData }: { initialData?: MyCommunityProfile }) {
  const [data, setData] = useState<MyCommunityProfile | null>(initialData ?? null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (initialData) return;
    let active = true;
    communityRequest<MyCommunityProfile>('/api/community/me')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : 'تعذّر تحميل إعداداتك.');
      });
    return () => {
      active = false;
    };
  }, [initialData]);
  if (error)
    return (
      <section className={styles.empty}>
        <LockKeyhole aria-hidden="true" />
        <h2>تعذّر فتح إعدادات الحساب</h2>
        <p role="alert">{error}</p>
        <ButtonLink href="/auth/sign-in" variant="outline">
          تسجيل الدخول
        </ButtonLink>
      </section>
    );
  if (!data)
    return (
      <p className={styles.loading} role="status">
        نحمّل مقتنياتك وإعداداتك…
      </p>
    );
  return <AppearanceForm key={data.profile.accountNumber} initialData={data} onSaved={setData} />;
}

function AppearanceForm({
  initialData,
  onSaved,
}: {
  initialData: MyCommunityProfile;
  onSaved: (value: MyCommunityProfile) => void;
}) {
  const { profile } = initialData;
  const [displayName, setDisplayName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(profile.coverUrl ?? '');
  const [visibility, setVisibility] = useState(profile.visibility);
  const [showRooms, setShowRooms] = useState(profile.showRooms);
  const [showCollection, setShowCollection] = useState(profile.showCollection);
  const [appearance, setAppearance] = useState(profile.appearance);
  const [settings, setSettings] = useState(initialData.settings);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const owned = useMemo(
    () => initialData.ownedCosmetics.filter((item) => !item.archived),
    [initialData.ownedCosmetics],
  );
  const frame = owned.find((item) => item.id === appearance.frameId) ?? null;
  const effect = owned.find((item) => item.id === appearance.effectId) ?? null;
  const background = owned.find((item) => item.id === appearance.backgroundId);
  const nameCard = owned.find((item) => item.id === appearance.nameCardId);
  const glow = owned.find((item) => item.id === appearance.glowId);
  const previewCover = previewImageUrl(background?.assetUrl || coverUrl || null);
  const primaryBadge = profile.badges.find((badge) => badge.id === appearance.primaryBadgeId);
  function select(key: keyof AppearanceSelection, value: string) {
    setAppearance((previous) => ({ ...previous, [key]: value || null }));
    setMessage('معاينة فقط؛ اضغط حفظ لتفعيل اختياراتك.');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await communityRequest<MyCommunityProfile>('/api/community/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim() || null,
          bio: bio.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          coverUrl: coverUrl.trim() || null,
          visibility,
          showRooms,
          showCollection,
          appearance,
          ...settings,
        }),
      });
      onSaved(result);
      setDisplayName(result.profile.name);
      setUsername(result.profile.username ?? '');
      setBio(result.profile.bio ?? '');
      setAvatarUrl(result.profile.avatarUrl ?? '');
      setCoverUrl(result.profile.coverUrl ?? '');
      setAppearance(result.profile.appearance);
      setSettings(result.settings);
      setMessage('حُفظت بياناتك وتم تفعيل مظهرك.');
    } catch (failure) {
      setFailed(true);
      setMessage(
        failure instanceof Error ? failure.message : 'تعذّر الحفظ. اختياراتك ما زالت في المعاينة.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className={styles.page}>
      <header className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>تفاصيلك، على ذوقك</p>
          <h1>مظهري وإعداداتي</h1>
          <p>جرّب مظهرك هنا، ثم احفظه ليظهر في ملفك والغرف.</p>
        </div>
        <ButtonLink href={`/people/${profile.accountNumber}`} variant="outline">
          <Eye size={18} aria-hidden="true" /> عرض ملفي
        </ButtonLink>
      </header>
      <div className={styles.editorGrid}>
        <div className={styles.editorMain}>
          <fieldset className={styles.panel}>
            <legend>
              <Settings2 size={20} aria-hidden="true" /> هويّتي
            </legend>
            <div className={styles.fieldsGrid}>
              <label>
                الاسم الظاهر
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  autoComplete="nickname"
                />
              </label>
              <label>
                اسم المستخدم الفريد
                <input
                  dir="ltr"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]{3,30}"
                  autoComplete="username"
                  aria-describedby="username-hint"
                />
                <small id="username-hint">
                  حروف إنجليزية وأرقام وشرطة سفلية؛ يمكنك تركه فارغًا.
                </small>
              </label>
              <label className={styles.fieldWide}>
                نبذة عنّي
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={500}
                  rows={4}
                />
                <small>{bio.length} / 500</small>
              </label>
              <label>
                رابط الصورة الشخصية
                <input
                  dir="ltr"
                  type="text"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  maxLength={1000}
                  placeholder="https://…"
                />
                <small>رابط HTTPS لصورة شخصية.</small>
              </label>
              <label>
                رابط الغلاف
                <input
                  dir="ltr"
                  type="text"
                  value={coverUrl}
                  onChange={(event) => setCoverUrl(event.target.value)}
                  maxLength={1000}
                  placeholder="https://…"
                />
                <small>اختر صورة لا تتضمن معلومات خاصة.</small>
              </label>
            </div>
          </fieldset>
          <fieldset className={styles.panel}>
            <legend>
              <Sparkles size={20} aria-hidden="true" /> المقتنيات المفعّلة
            </legend>
            <p className={styles.muted}>
              تظهر العناصر المتاحة لحسابك فقط. انتهاء الاستحقاق يوقف تفعيل العنصر.
            </p>
            <div className={styles.fieldsGrid}>
              {slots.map((slot) => (
                <label key={slot.key}>
                  {slot.label}
                  <select
                    value={appearance[slot.key] ?? ''}
                    onChange={(event) => select(slot.key, event.target.value)}
                  >
                    <option value="">بدون تخصيص</option>
                    {owned
                      .filter((item) => item.kind === slot.kind)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label>
                الشارة الرئيسية
                <select
                  value={appearance.primaryBadgeId ?? ''}
                  onChange={(event) => select('primaryBadgeId', event.target.value)}
                >
                  <option value="">بدون شارة رئيسية</option>
                  {profile.badges.map((badge) => (
                    <option key={badge.id} value={badge.id}>
                      {badge.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {owned.length === 0 && (
              <p className={styles.notice}>
                لا توجد مقتنيات متاحة بعد. تبقى هويتك الأساسية متاحة دائمًا.
              </p>
            )}
          </fieldset>
          <fieldset className={styles.panel}>
            <legend>
              <LockKeyhole size={20} aria-hidden="true" /> الخصوصية والراحة
            </legend>
            <label>
              من يستطيع رؤية ملفي؟
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              >
                <option value="PUBLIC">الجميع</option>
                <option value="MEMBERS">الأعضاء المسجلون</option>
                <option value="PRIVATE">أنا فقط</option>
              </select>
            </label>
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={showRooms}
                  onChange={(event) => setShowRooms(event.target.checked)}
                />{' '}
                عرض الغرف التي أملكها أو أديرها
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showCollection}
                  onChange={(event) => setShowCollection(event.target.checked)}
                />{' '}
                عرض معرض مقتنياتي
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.entranceEnabled}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      entranceEnabled: event.target.checked,
                    }))
                  }
                />{' '}
                عرض تأثيرات الدخول في الغرف
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.entranceSound}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      entranceSound: event.target.checked,
                    }))
                  }
                />{' '}
                السماح بالصوت الاختياري لتأثيرات الدخول
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.reduceEffects}
                  onChange={(event) =>
                    setSettings((previous) => ({
                      ...previous,
                      reduceEffects: event.target.checked,
                    }))
                  }
                />{' '}
                تقليل المؤثرات للحفاظ على الأداء
              </label>
            </div>
            <p className={styles.muted}>يبقى تفضيل تقليل الحركة في جهازك محترمًا دائمًا.</p>
          </fieldset>
        </div>
        <aside className={styles.previewColumn}>
          <div
            className={styles.previewCard}
            data-background-tier={background?.tier}
            data-name-card-tier={nameCard?.tier}
          >
            {previewCover && (
              <Image
                src={previewCover}
                className={styles.previewCover}
                alt="معاينة الغلاف"
                width={480}
                height={160}
                unoptimized
              />
            )}
            <p className={styles.eyebrow}>
              <Eye size={16} aria-hidden="true" /> معاينة مباشرة
            </p>
            <CommunityAvatar
              name={displayName || profile.name}
              src={avatarUrl || null}
              frame={frame}
              glow={glow}
            />
            <h2>{displayName || profile.name}</h2>
            {nameCard?.assetUrl && (
              <PhotoNameCard name={displayName || profile.name} assetUrl={nameCard.assetUrl} />
            )}
            <bdi dir="ltr">{profile.accountNumber}</bdi>
            {primaryBadge && <BadgeSeal badge={primaryBadge} compact />}
            <p>{bio || 'نبذتك الشخصية ستظهر هنا.'}</p>
          </div>
          <div className={styles.panel}>
            <h2>دخولي إلى المجلس</h2>
            <EntranceEffectPreview
              tier={effect?.tier ?? 'ordinary'}
              name={displayName || profile.name}
              avatarUrl={avatarUrl || null}
              badge={primaryBadge?.name}
              effectAssetUrl={effect?.assetUrl}
              badgeAssetUrl={primaryBadge?.assetUrl}
              subdued={settings.reduceEffects || !settings.entranceEnabled}
            />
            <p className={styles.muted}>{effect?.description || 'ظهور هادئ بالاسم والصورة.'}</p>
          </div>
          <div className={styles.notice}>
            <Check size={18} aria-hidden="true" /> المعاينة لا تمنح عناصر أو صلاحيات. يتم التحقق من
            الاستحقاق عند الحفظ.
          </div>
        </aside>
      </div>
      <footer className={styles.saveBar}>
        <p role={failed ? 'alert' : 'status'}>{message || 'التغييرات لن تُفعّل حتى تحفظها.'}</p>
        <Button type="submit" variant="gold" loading={pending}>
          <Save size={18} aria-hidden="true" /> حفظ التغييرات
        </Button>
      </footer>
    </form>
  );
}
