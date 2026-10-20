'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  CalendarDays,
  Radio,
  Settings2,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import type { PublicProfile } from '@/lib/community/contracts';
import {
  AccountActions,
  BadgeSeal,
  CommunityAvatar,
  PhotoNameCard,
  communityRequest,
  previewImageUrl,
} from './community-ui';
import { RealFrameArtwork } from './realistic-art';
import { EntranceEffectPreview } from '@/components/voice/entrance-effect';
import styles from './community.module.css';

type Tab = 'overview' | 'badges' | 'achievements' | 'collection';
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'الرئيسية' },
  { id: 'badges', label: 'الشارات' },
  { id: 'achievements', label: 'الإنجازات' },
  { id: 'collection', label: 'المقتنيات' },
];

export function CommunityProfilePage({
  accountNumber,
  initialProfile,
}: {
  accountNumber: number;
  initialProfile?: PublicProfile;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(initialProfile ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!initialProfile);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await communityRequest<PublicProfile>(
        `/api/community/profiles/${accountNumber}`,
      );
      setProfile(data);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذّر تحميل الملف.');
    } finally {
      setLoading(false);
    }
  }, [accountNumber]);
  useEffect(() => {
    if (initialProfile) return;
    let active = true;
    communityRequest<PublicProfile>(`/api/community/profiles/${accountNumber}`)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : 'تعذّر تحميل الملف.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialProfile, accountNumber]);
  async function follow() {
    if (!profile || pending) return;
    setPending(true);
    setMessage('');
    try {
      await communityRequest(`/api/community/profiles/${accountNumber}/follow`, {
        method: profile.isFollowing ? 'DELETE' : 'POST',
      });
      setMessage(profile.isFollowing ? 'تم إلغاء المتابعة.' : 'تمت المتابعة.');
      await load();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'تعذّرت المتابعة.');
    } finally {
      setPending(false);
    }
  }
  if (loading)
    return (
      <div className={styles.loading} role="status">
        نجهّز بطاقة هويتك…
      </div>
    );
  if (!profile || error)
    return (
      <section className={styles.empty}>
        <Shield size={32} aria-hidden="true" />
        <h2>هذا الملف غير متاح</h2>
        <p>{error || 'تحقق من الرابط أو من إعدادات الخصوصية.'}</p>
        <ButtonLink href="/auth/sign-in" variant="outline">
          تسجيل الدخول
        </ButtonLink>
      </section>
    );
  const background =
    profile.activeAppearance?.background ??
    profile.cosmetics.find((item) => item.id === profile.appearance.backgroundId);
  const nameCard =
    profile.activeAppearance?.nameCard ??
    profile.cosmetics.find((item) => item.id === profile.appearance.nameCardId);
  const glow =
    profile.activeAppearance?.glow ??
    profile.cosmetics.find((item) => item.id === profile.appearance.glowId);
  const coverUrl = previewImageUrl(background?.assetUrl || profile.coverUrl);
  return (
    <div className={styles.page}>
      <header
        className={styles.profileHero}
        data-background-tier={background?.tier}
        data-name-card-tier={nameCard?.tier}
      >
        <div className={styles.cover}>
          {coverUrl && (
            <Image
              src={coverUrl}
              alt="غلاف الملف الشخصي"
              fill
              sizes="(max-width: 800px) 100vw, 1100px"
              unoptimized
            />
          )}
          <span className={styles.coverWord}>هويّتك في المجلس</span>
        </div>
        <div className={styles.heroBody}>
          <CommunityAvatar
            name={profile.name}
            src={profile.avatarUrl}
            frame={profile.frame}
            glow={glow}
          />
          <div className={styles.heroName}>
            <p className={styles.eyebrow}>تحدّي لايف / بطاقة عضو</p>
            <h1>{profile.name}</h1>
            {nameCard?.assetUrl && (
              <PhotoNameCard name={profile.name} assetUrl={nameCard.assetUrl} />
            )}
            {profile.username && (
              <p dir="ltr" className={styles.username}>
                @{profile.username}
              </p>
            )}
            <div className={styles.badgeRow}>
              <span className={styles.rankLabel}>{profile.rank.name}</span>
              {profile.primaryBadge && <BadgeSeal badge={profile.primaryBadge} compact />}
            </div>
          </div>
          <div className={styles.heroActions}>
            {profile.isSelf ? (
              <ButtonLink href="/profile/appearance" variant="gold">
                <Settings2 size={18} aria-hidden="true" /> مظهري وإعداداتي
              </ButtonLink>
            ) : (
              <Button
                variant={profile.isFollowing ? 'outline' : 'gold'}
                onClick={() => void follow()}
                loading={pending}
              >
                <UserPlus size={18} aria-hidden="true" />
                {profile.isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
              </Button>
            )}
            <p role="status" className={styles.inlineStatus}>
              {message}
            </p>
          </div>
        </div>
        <AccountActions accountNumber={profile.accountNumber} />
        <div className={styles.metrics}>
          <div>
            <Users size={18} aria-hidden="true" />
            <strong>{profile.followerCount}</strong>
            <span>متابع</span>
          </div>
          <div>
            <strong>{profile.followingCount}</strong>
            <span>يتابع</span>
          </div>
          <div>
            <Award size={18} aria-hidden="true" />
            <strong>{profile.level}</strong>
            <span>المستوى</span>
          </div>
          <div>
            <Sparkles size={18} aria-hidden="true" />
            <strong>{profile.xp}</strong>
            <span>نقطة خبرة</span>
          </div>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="أقسام الملف الشخصي">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        {profile.isSelf && <Link href="/profile/appearance">الإعدادات</Link>}
      </nav>
      <section
        className={styles.tabContent}
        aria-label={tabs.find((item) => item.id === tab)?.label}
      >
        {tab === 'overview' && (
          <div className={styles.overviewGrid}>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>ما وراء الاسم</p>
              <h2>عنّي</h2>
              <p className={styles.bio}>{profile.bio || 'لم يضف هذا العضو نبذة شخصية بعد.'}</p>
              <p className={styles.meta}>
                <CalendarDays size={18} aria-hidden="true" /> انضم في{' '}
                {new Intl.DateTimeFormat('ar-SA', {
                  dateStyle: 'long',
                  calendar: 'gregory',
                }).format(new Date(profile.joinedAt))}
              </p>
              <p className={styles.meta}>
                <Shield size={18} aria-hidden="true" />
                {profile.visibility === 'PUBLIC'
                  ? 'ملف عام'
                  : profile.visibility === 'MEMBERS'
                    ? 'للأعضاء المسجلين'
                    : 'ملف خاص'}
              </p>
              {profile.xp === 0 && (
                <p className={styles.muted}>لم تُسجّل نقاط خبرة لهذا الحساب بعد.</p>
              )}
            </article>
            <article className={styles.panel}>
              <p className={styles.eyebrow}>المجلس الذي أنتمي إليه</p>
              <h2>
                <Radio size={21} aria-hidden="true" /> الغرف
              </h2>
              {profile.showRooms && profile.rooms.length ? (
                <div className={styles.roomList}>
                  {profile.rooms.map((room) => (
                    <a key={room.id} href={`/voice/${encodeURIComponent(room.id)}`}>
                      <Radio size={19} aria-hidden="true" />
                      <span>
                        <strong>{room.name}</strong>
                        <small>{room.role === 'OWNER' ? 'صاحب الغرفة' : 'مشرف الغرفة'}</small>
                      </span>
                      <bdi dir="ltr">#{room.roomNumber}</bdi>
                    </a>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>
                  {profile.showRooms
                    ? 'لا توجد غرف معروضة لهذا العضو.'
                    : 'قائمة الغرف مخفية بحسب إعدادات الخصوصية.'}
                </p>
              )}
            </article>
          </div>
        )}
        {(tab === 'badges' || tab === 'achievements') && (
          <article className={styles.panel}>
            <p className={styles.eyebrow}>استحقاق يروي رحلتك</p>
            <h2>{tab === 'badges' ? 'الشارات المكتسبة' : 'الإنجازات'}</h2>
            {(tab === 'badges' ? profile.badges : profile.achievements).length ? (
              <div className={styles.badgeGrid}>
                {(tab === 'badges' ? profile.badges : profile.achievements).map((badge) => (
                  <article className={styles.badgeCard} key={badge.id}>
                    <BadgeSeal badge={badge} />
                    <p className={styles.meta}>
                      {badge.rarity === 'legendary'
                        ? 'أسطورية'
                        : badge.rarity === 'epic'
                          ? 'ملحمية'
                          : badge.rarity === 'rare'
                            ? 'نادرة'
                            : 'عادية'}
                    </p>
                    {badge.grantedAt && (
                      <small>
                        مُنحت {new Date(badge.grantedAt).toLocaleDateString('ar-SA-u-ca-gregory')}
                      </small>
                    )}
                    {badge.expiresAt && (
                      <small>
                        صالحة حتى{' '}
                        {new Date(badge.expiresAt).toLocaleDateString('ar-SA-u-ca-gregory')}
                      </small>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <Award size={30} aria-hidden="true" />
                <p>
                  {tab === 'badges'
                    ? 'تظهر هنا الشارات بعد استحقاقها أو منحها من الإدارة.'
                    : 'لم تُسجّل إنجازات مكتسبة بعد.'}
                </p>
              </div>
            )}
          </article>
        )}
        {tab === 'collection' && (
          <article className={styles.panel}>
            <p className={styles.eyebrow}>تفاصيل تخصّك</p>
            <h2>المقتنيات والزينة</h2>
            {profile.showCollection && profile.cosmetics.length ? (
              <div className={styles.cosmeticGrid}>
                {profile.cosmetics.map((item) => (
                  <article key={item.id} className={styles.cosmeticCard} data-tier={item.tier}>
                    {item.kind === 'FRAME' ? (
                      <RealFrameArtwork
                        tier={item.tier}
                        assetUrl={item.assetUrl}
                        name={item.name}
                        className={styles.inventoryArtwork}
                      />
                    ) : item.kind === 'EFFECT' ? (
                      <EntranceEffectPreview
                        tier={item.tier}
                        name={profile.name}
                        avatarUrl={profile.avatarUrl}
                        subdued
                      />
                    ) : item.assetUrl ? (
                      <Image
                        src={item.assetUrl}
                        alt={item.name}
                        width={160}
                        height={100}
                        className={styles.inventoryPhoto}
                        unoptimized
                      />
                    ) : (
                      <span
                        className={styles.materialPreview}
                        data-kind={item.kind}
                        data-tier={item.tier}
                      >
                        {item.kind === 'NAME_CARD'
                          ? profile.name
                          : item.kind === 'BACKGROUND'
                            ? 'خلفية الملف'
                            : 'إضاءة هادئة'}
                      </span>
                    )}
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    {Object.values(profile.appearance).includes(item.id) && (
                      <span className={styles.activeLabel}>مفعّل</span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <p>
                  {profile.showCollection
                    ? 'لا توجد مقتنيات معروضة بعد.'
                    : 'معرض المقتنيات مخفي بحسب إعدادات الخصوصية.'}
                </p>
              </div>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
