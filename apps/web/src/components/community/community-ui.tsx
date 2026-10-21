'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommunityBadge, CommunityCosmetic } from '@/lib/community/contracts';
import { RealBadgeArtwork, RealFrameArtwork } from './realistic-art';
import styles from './community.module.css';

export function previewImageUrl(value: string | null): string | null {
  if (!value) return null;
  return /^(?:https:\/\/|\/(?!\/)|data:image\/(?:png|webp);base64,)/i.test(value) ? value : null;
}

export function CommunityAvatar({
  name,
  src,
  frame,
  glow,
  size = 'large',
}: {
  name: string;
  src: string | null;
  frame?: CommunityCosmetic | null;
  glow?: CommunityCosmetic | null;
  size?: 'small' | 'large';
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageUrl = failedImage === src ? null : previewImageUrl(src);
  const frameUrl = previewImageUrl(frame?.assetUrl ?? null);
  return (
    <span
      className={styles.avatar}
      data-size={size}
      data-tier={frame?.tier ?? 'ordinary'}
      data-glow-tier={glow?.tier}
      data-has-frame={frame ? true : undefined}
      data-exclusive-frame={
        frame?.id === 'frame-owner-sapphire' || frame?.id === 'frame-amira-rose'
          ? frame.id
          : undefined
      }
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`صورة ${name}`}
          width={112}
          height={112}
          unoptimized
          onError={() => setFailedImage(imageUrl)}
        />
      ) : (
        <span className={styles.avatarPlaceholder}>لم تُضف صورة</span>
      )}
      {frameUrl && !/^\/community-assets\/frame-atlas\.(?:png|webp)(?:#.*)?$/.test(frameUrl) ? (
        <Image
          className={styles.avatarFrame}
          src={frameUrl}
          alt=""
          aria-hidden="true"
          width={124}
          height={124}
          unoptimized
        />
      ) : frame ? (
        <RealFrameArtwork tier={frame.tier} className={styles.avatarFrame} />
      ) : null}
    </span>
  );
}

export function BadgeSeal({
  badge,
  compact = false,
}: {
  badge: CommunityBadge;
  compact?: boolean;
}) {
  return (
    <span className={styles.badge} data-rarity={badge.rarity} title={badge.description}>
      <RealBadgeArtwork
        badgeId={badge.id}
        assetUrl={badge.assetUrl}
        name={badge.name}
        className={styles.badgeArtwork}
      />
      <span>
        {badge.name}
        {!compact && <small>{badge.description}</small>}
      </span>
    </span>
  );
}

export function PhotoNameCard({ name, assetUrl }: { name: string; assetUrl: string | null }) {
  const imageUrl = previewImageUrl(assetUrl);
  if (!imageUrl) return null;
  return (
    <span className={styles.photoNameCard} role="img" aria-label={`بطاقة اسم ${name}`}>
      <Image src={imageUrl} alt="" fill sizes="(max-width: 620px) 85vw, 420px" unoptimized />
      <span>{name}</span>
    </span>
  );
}

export function AccountActions({ accountNumber }: { accountNumber: number }) {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setMessage(success);
    } catch {
      setMessage('تعذّر النسخ. يمكنك تحديد المعرّف ونسخه يدويًا.');
    }
  }
  async function share() {
    const url = `${window.location.origin}/people/${accountNumber}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ملفي في تحدّي لايف', url });
        setMessage('تمت مشاركة الرابط.');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessage('تعذّرت المشاركة. حاول نسخ الرابط.');
      }
    } else await copy(url, 'تم نسخ رابط الملف.');
  }
  return (
    <div className={styles.accountActions}>
      <div className={styles.idLine}>
        <span>معرّف الحساب</span>
        <bdi dir="ltr">{accountNumber}</bdi>
      </div>
      <Button
        variant="outline"
        onClick={() => void copy(String(accountNumber), 'تم نسخ المعرّف.')}
        aria-label="نسخ معرّف الحساب"
      >
        {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}{' '}
        نسخ
      </Button>
      <Button variant="ghost" onClick={() => void share()}>
        <Share2 size={17} aria-hidden="true" /> مشاركة
      </Button>
      <span className={styles.inlineStatus} role="status">
        {message}
      </span>
    </div>
  );
}

export async function communityRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const json = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: string;
    message?: string;
  } | null;
  if (!response.ok || !json?.ok || json.data === undefined) {
    const errors: Record<string, string> = {
      UNAUTHORIZED: 'سجّل الدخول للمتابعة.',
      UNAUTHENTICATED: 'سجّل الدخول للمتابعة.',
      SESSION_REVOKED: 'انتهت صلاحية الجلسة. سجّل الدخول من جديد.',
      INVALID_PROFILE: 'تحقق من الاسم واسم المستخدم وروابط الصور.',
      INVALID_COMMAND: 'تحقق من معرّف العنصر وحقوله.',
      ITEM_NOT_OWNED: 'هذا المقتنى غير متاح لحسابك أو انتهى استحقاقه.',
      EXCLUSIVE_ITEM: 'هذا المقتنى حصري للحساب المخصص له.',
      BADGE_NOT_OWNED: 'هذه الشارة غير متاحة لحسابك.',
      IMAGE_TOO_LARGE: 'يجب ألا تتجاوز الصورة 100 كيلوبايت.',
      INVALID_IMAGE: 'الصورة غير صالحة أو تتجاوز المقاسات المسموحة.',
      RASTER_IMAGE_REQUIRED: 'اختر صورة PNG أو WebP.',
      FORBIDDEN: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
      NOT_FOUND: 'الملف غير متاح أو لا تسمح إعدادات خصوصيته بعرضه.',
      INVALID_REQUEST: 'تحقق من البيانات المدخلة.',
      INVALID_INPUT: 'تحقق من البيانات المدخلة.',
      USERNAME_TAKEN: 'اسم المستخدم مستخدم بالفعل.',
      ALREADY_EXISTS: 'المعرّف أو اسم المستخدم مستخدم بالفعل. اختر قيمة أخرى.',
      COMMUNITY_UNAVAILABLE: 'الخدمة غير متاحة الآن. حاول مجددًا بعد قليل.',
      RATE_LIMITED: 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
    };
    throw new Error(
      errors[json?.error ?? ''] ?? json?.message ?? 'تعذّر تنفيذ الطلب. حاول مجددًا.',
    );
  }
  return json.data;
}
