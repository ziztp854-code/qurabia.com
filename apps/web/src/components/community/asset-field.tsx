'use client';

import { useId, useState } from 'react';
import { Upload } from 'lucide-react';
import { communityRequest } from './community-ui';
import styles from './community.module.css';

export function CommunityAssetField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/webp'].includes(file.type) || file.size > 100_000) {
      setFailed(true);
      setMessage('اختر صورة PNG أو WebP بحجم لا يتجاوز 100 كيلوبايت.');
      return;
    }
    setPending(true);
    setFailed(false);
    setMessage('جارٍ فحص الصورة…');
    try {
      const result = await communityRequest<{ assetUrl: string }>('/api/community/assets', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      onChange(result.assetUrl);
      setMessage(`تم فحص ${file.name}. احفظ العنصر لاعتماد الصورة.`);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'تعذّر رفع الصورة.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.assetField}>
      <label htmlFor={id}>
        {label}
        <input
          id={id}
          type="text"
          dir="ltr"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          maxLength={150_000}
          placeholder="https://…"
        />
        <small>رابط HTTPS أو صورة مفحوصة. لا يُسمح بملفات SVG أو HTML.</small>
      </label>
      <label className={styles.uploadLabel}>
        <Upload size={17} aria-hidden="true" /> رفع PNG أو WebP
        <input
          type="file"
          accept="image/png,image/webp"
          disabled={pending}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <small>الحد الأقصى 100 كيلوبايت.</small>
      </label>
      <p className={failed ? styles.error : styles.inlineStatus} role={failed ? 'alert' : 'status'}>
        {message}
      </p>
    </div>
  );
}
