'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AtSign, CalendarDays, Camera, Check, Pencil, Radio, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { planDefinition, type PlanCode } from '@tahaddi/domain';
import { Button, ButtonLink, Dialog, Input, Textarea } from '@/components/ui';
import { AccountActions } from '@/components/community/community-ui';
import { RealBadgeArtwork, RealFrameArtwork } from '@/components/community/realistic-art';
import type { PublicIdentity } from '@/lib/community/contracts';
import { canAccessAdmin } from '@/lib/auth/authorization';
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  profileIdentitySchema,
  type ProfileIdentity,
} from '@/lib/profile/identity';
import { formatNumber } from '@/lib/utils';
import styles from './profile-overview.module.css';
import material from '@/components/ui/royal-material.module.css';

type Props = {
  accountNumber: number;
  communityIdentity?: Pick<PublicIdentity, 'frame' | 'primaryBadge'> | null;
  profile: ProfileIdentity;
  role: string;
  planCode: PlanCode;
  followers: number;
  following: number;
  joined: string;
};

function ProfilePhoto({ image, name }: { image: string | null; name: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <span className={styles.photo}>
      {image && image !== failedImage ? (
        <Image
          src={image}
          alt={`الصورة الشخصية لـ${name}`}
          fill
          sizes="128px"
          unoptimized
          onError={() => setFailedImage(image)}
        />
      ) : (
        <span className={styles.emptyPhoto}>لم تُضف صورة</span>
      )}
    </span>
  );
}

export function ProfileOverview({
  accountNumber,
  communityIdentity,
  profile: initial,
  role,
  planCode,
  followers,
  following,
  joined,
}: Props) {
  const roleBadgeId =
    role === 'OWNER' ? 'platform-founder' : role === 'ADMIN' ? 'general-manager' : null;
  const roleBadgeLabel = role === 'OWNER' ? 'مالك المنصة موثّق' : 'حساب إدارة موثّق';
  const [profile, setProfile] = useState(initial);
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (previousInitial !== initial) {
    setPreviousInitial(initial);
    setProfile(initial);
  }
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState('');
  const router = useRouter();
  const changeOpen = useCallback((next: boolean) => {
    if (!busy.current) setOpen(next);
  }, []);
  const changeBusy = useCallback((next: boolean) => {
    busy.current = next;
  }, []);
  const edit = () => {
    setNotice('');
    setOpen(true);
  };
  const saved = (next: ProfileIdentity) => {
    setProfile(next);
    busy.current = false;
    setOpen(false);
    setNotice('تم حفظ البروفايل.');
    // Server components reload the database identity; no client-supplied claims.
    router.refresh();
  };

  return (
    <>
      <section className={`${styles.profile} ${material.surface}`} aria-labelledby="social-profile-name">
        <div className={styles.cover} aria-hidden="true">
          <span>تحدّي</span>
        </div>
        <div className={styles.body}>
          <div className={styles.identityRow}>
            <button
              className={`${styles.photoButton} ${material.interactive}`}
              onClick={edit}
              aria-label={profile.image ? 'تغيير الصورة الشخصية' : 'إضافة صورة شخصية'}
            >
              <ProfilePhoto image={profile.image} name={profile.displayName} />
              {communityIdentity?.frame && (
                <RealFrameArtwork
                  tier={communityIdentity.frame.tier}
                  assetUrl={communityIdentity.frame.assetUrl}
                  className={styles.equippedFrame}
                />
              )}
              <span className={styles.camera}>
                <Camera size={18} aria-hidden="true" />
              </span>
            </button>
            <div className={styles.nameBlock}>
              <p className={styles.eyebrow}>ملفي الشخصي</p>
              <h2 id="social-profile-name">
                <bdi>{profile.displayName}</bdi>
                {roleBadgeId && (
                  <RealBadgeArtwork
                    badgeId={roleBadgeId}
                    name={roleBadgeLabel}
                    className={styles.roleArtwork}
                  />
                )}
                {communityIdentity?.primaryBadge &&
                  communityIdentity.primaryBadge.id !== roleBadgeId && (
                    <RealBadgeArtwork
                      badgeId={communityIdentity.primaryBadge.id}
                      assetUrl={communityIdentity.primaryBadge.assetUrl}
                      name={communityIdentity.primaryBadge.name}
                      className={styles.roleArtwork}
                    />
                  )}
              </h2>
              {profile.username ? (
                <p className={styles.username} dir="ltr">
                  @{profile.username}
                </p>
              ) : (
                <button className={styles.addUsername} onClick={edit}>
                  <AtSign size={16} aria-hidden="true" />
                  أضف اسم مستخدم
                </button>
              )}
            </div>
            <Button variant="gold" onClick={edit} className={styles.editButton}>
              <Pencil size={17} aria-hidden="true" />
              تعديل البروفايل
            </Button>
          </div>
          <div className={styles.accountNumber}>
            <AccountActions accountNumber={accountNumber} />
          </div>
          <div className={styles.socialRow}>
            <dl className={styles.counts} aria-label="إحصاءات المتابعة">
              <div>
                <dt>متابعون</dt>
                <dd>{formatNumber(followers)}</dd>
              </div>
              <div>
                <dt>أتابعهم</dt>
                <dd>{formatNumber(following)}</dd>
              </div>
            </dl>
            <span className={styles.rank}>
              {role === 'OWNER' ? 'مالك المنصة' : planDefinition(planCode).name}
            </span>
          </div>
          <div className={styles.about}>
            <div>
              <h3>نبذة عني</h3>
              <p className={profile.bio ? styles.bio : styles.emptyBio}>
                {profile.bio || 'عرّف الأعضاء بنفسك. أضف نبذة قصيرة من تعديل البروفايل.'}
              </p>
            </div>
            <p className={styles.joined}>
              <CalendarDays size={16} aria-hidden="true" />
              انضممت في {joined}
            </p>
          </div>
          <nav className={styles.links} aria-label="روابط حسابي">
            <ButtonLink href="/voice" variant="outline">
              <Radio size={18} aria-hidden="true" />
              الغرف الصوتية
            </ButtonLink>
            <ButtonLink href={`/people/${accountNumber}`} variant="outline">
              ملفي العام
            </ButtonLink>
            <ButtonLink href="/profile/appearance" variant="outline">
              مظهري والشارات
            </ButtonLink>
            {canAccessAdmin(role) && (
              <ButtonLink href="/admin" variant="ghost">
                <ShieldCheck size={18} aria-hidden="true" />
                إدارة المنصة
              </ButtonLink>
            )}
          </nav>
        </div>
      </section>
      <p className={styles.notice} role="status">
        {notice && (
          <>
            <Check size={18} aria-hidden="true" />
            {notice}
          </>
        )}
      </p>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title="تعديل البروفايل"
        description="الاسم والصورة يظهران للأعضاء في المنصة والغرف الصوتية."
        className={styles.dialog}
      >
        <ProfileEditor
          profile={profile}
          onSaved={saved}
          onBusy={changeBusy}
          onCancel={() => changeOpen(false)}
        />
      </Dialog>
    </>
  );
}

type Errors = Partial<Record<'displayName' | 'username' | 'bio' | 'image', string>>;
function ProfileEditor({
  profile,
  onSaved,
  onBusy,
  onCancel,
}: {
  profile: ProfileIdentity;
  onSaved: (profile: ProfileIdentity) => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState({
    displayName: profile.displayName,
    username: profile.username ?? '',
    bio: profile.bio,
  });
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const report = (message: string) => {
    setError(message);
    requestAnimationFrame(() => summary.current?.focus());
  };
  const validate = (key: keyof typeof fields) => {
    const parsed = profileIdentitySchema.safeParse(fields);
    setErrors((current) => ({
      ...current,
      [key]: parsed.success ? undefined : parsed.error.flatten().fieldErrors[key]?.[0],
    }));
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const parsed = profileIdentitySchema.safeParse(fields);
    if (!parsed.success || errors.image) {
      const next: Errors = { image: errors.image };
      if (!parsed.success)
        for (const [key, value] of Object.entries(parsed.error.flatten().fieldErrors))
          next[key as keyof Errors] = value?.[0];
      setErrors(next);
      report('راجع الحقول الموضّحة ثم احفظ التغييرات.');
      return;
    }
    saving.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    setErrors({});
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries(parsed.data)) form.set(key, value);
      if (file) form.set('image', file);
      if (remove) form.set('removeImage', 'true');
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        body: form,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'USERNAME_TAKEN') setErrors({ username: data.error });
        else if (data.fields)
          setErrors(
            Object.fromEntries(
              Object.entries(data.fields).map(([key, value]) => [key, (value as string[])?.[0]]),
            ),
          );
        else if ([413, 415].includes(response.status)) setErrors({ image: data.error });
        throw new Error(data.error || 'تعذّر حفظ البروفايل. حاول مجددًا.');
      }
      onSaved(data.profile);
    } catch (reason) {
      if (controller.signal.aborted)
        report('تعذّر تأكيد الحفظ. أعد فتح البروفايل للتحقق قبل المحاولة مجددًا.');
      else report(reason instanceof Error ? reason.message : 'تعذّر حفظ البروفايل. حاول مجددًا.');
    } finally {
      clearTimeout(timeout);
      request.current = null;
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
      {error && (
        <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={summary}>
          <strong>{error}</strong>
          {Object.entries(errors)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <a key={key} href={`#profile-${key}`}>
                {value}
              </a>
            ))}
        </div>
      )}
      <div className={styles.photoEditor}>
        <ProfilePhoto
          name={fields.displayName}
          image={preview || (remove ? null : profile.image)}
        />
        <div className={styles.photoActions}>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            <Camera size={17} aria-hidden="true" />
            {profile.image || file ? 'تغيير الصورة' : 'إضافة صورة'}
          </Button>
          {(profile.image || file) && !remove && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setPreview(null);
                setRemove(true);
                setErrors((current) => ({ ...current, image: undefined }));
                if (picker.current) picker.current.value = '';
              }}
            >
              إزالة الصورة
            </Button>
          )}
          <p id="profile-image-hint">
            JPG أو PNG أو WebP · حتى ٢ ميغابايت
            <br />
            تُقص الصورة إلى مربع تلقائيًا.
          </p>
        </div>
        <input
          ref={picker}
          id="profile-image"
          className={styles.fileInput}
          type="file"
          tabIndex={-1}
          accept={PROFILE_IMAGE_TYPES.join(',')}
          aria-label="اختيار الصورة الشخصية"
          aria-describedby={errors.image ? 'profile-image-error' : 'profile-image-hint'}
          aria-invalid={Boolean(errors.image)}
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (!selected) return;
            const message =
              selected.size > PROFILE_IMAGE_MAX_BYTES
                ? 'اختر صورة لا تتجاوز ٢ ميغابايت.'
                : !PROFILE_IMAGE_TYPES.includes(selected.type)
                  ? 'الصور المقبولة: JPEG أو PNG أو WebP.'
                  : undefined;
            setErrors((current) => ({ ...current, image: message }));
            if (!message) {
              setFile(selected);
              setPreview(URL.createObjectURL(selected));
              setRemove(false);
            }
            event.target.value = '';
          }}
        />
      </div>
      {errors.image && (
        <p className={styles.fieldError} id="profile-image-error">
          {errors.image}
        </p>
      )}
      <Input
        label="الاسم الظاهر"
        id="profile-displayName"
        autoComplete="name"
        value={fields.displayName}
        maxLength={80}
        disabled={busy}
        error={errors.displayName}
        description="الاسم الذي يظهر في ملفك والغرف والمحادثات."
        onChange={(e) => setFields({ ...fields, displayName: e.target.value })}
        onBlur={() => validate('displayName')}
      />
      <Input
        label="اسم المستخدم"
        id="profile-username"
        dir="ltr"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={fields.username}
        maxLength={30}
        disabled={busy}
        error={errors.username}
        description="اسم فريد: ٣–٣٠ حرفًا إنجليزيًا أو رقمًا أو شرطة سفلية، مثل aziz_24."
        icon={<AtSign size={17} aria-hidden="true" />}
        onChange={(e) => setFields({ ...fields, username: e.target.value })}
        onBlur={() => validate('username')}
      />
      <Textarea
        label="نبذة عني"
        id="profile-bio"
        rows={3}
        value={fields.bio}
        maxLength={500}
        disabled={busy}
        error={errors.bio}
        description={`${formatNumber(fields.bio.length)} / ٥٠٠ حرف`}
        onChange={(e) => setFields({ ...fields, bio: e.target.value })}
        onBlur={() => validate('bio')}
      />
      <div className={styles.formActions}>
        <Button type="submit" variant="gold" loading={busy}>
          حفظ التغييرات
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
