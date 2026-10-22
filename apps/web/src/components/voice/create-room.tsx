'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check, Headphones, ImagePlus, LockKeyhole, Plus, Radio, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/overlay';
import { Input, Select, Switch, Textarea } from '@/components/ui/forms';
import {
  VOICE_CATEGORIES,
  type VoiceCategory,
  type VoiceCreateInput,
  type VoiceSnapshot,
} from '@/lib/voice/types';
import { VoiceCover } from './voice-ui';
import { coverPath, coverPresets, voiceRequest } from './voice-client';

export function CreateRoom({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState(coverPath('friends'));
  const [category, setCategory] = useState<VoiceCategory>('مجالس');
  const [seatCount, setSeatCount] = useState(9);
  const [isPrivate, setPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [allowMicRequests, setMicRequests] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [moderatorsCanManage, setModerators] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('اختر صورة JPG أو PNG أو WebP لا تتجاوز ٢ ميغابايت.');
      return;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const result = await fetch('/api/voice/uploads', { method: 'POST', body: data });
      const value = await result.json();
      if (!result.ok) throw new Error(value.error || 'تعذر رفع الصورة. اختر غلافًا من المكتبة.');
      setCover(value.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الصورة.');
    } finally {
      setUploading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (name.trim().length < 3) {
      setError('اسم الغرفة يجب أن يكون ٣ أحرف على الأقل.');
      return;
    }
    if (isPrivate && password && password.length < 8) {
      setError('كلمة المرور يجب أن تكون ٨ أحرف على الأقل.');
      return;
    }
    setBusy(true);
    try {
      const input: VoiceCreateInput = {
        name: name.trim(),
        description: description.trim(),
        cover,
        category,
        seatCount,
        isPrivate,
        allowMicRequests,
        chatEnabled,
        moderatorsCanManage,
        ...(isPrivate && password ? { password } : {}),
      };
      const snapshot = await voiceRequest<VoiceSnapshot>('rooms', input);
      onOpenChange(false);
      router.push(`/voice/${snapshot.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الغرفة.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="أنشئ مساحتك الصوتية"
      description="اختر الأجواء، واجمع من تحب."
      className="v-dialog v-create-dialog"
    >
      <form className="v-create-form" onSubmit={submit}>
        <div className="v-create-preview">
          <VoiceCover src={cover} alt="الغلاف المختار" sizes="600px" />
          <span>
            <Radio size={16} />
            غرفتك القادمة
          </span>
          <h3>{name || 'هنا تبدأ السالفة'}</h3>
        </div>
        <fieldset className="v-cover-picker">
          <legend>اختر غلاف الغرفة</legend>
          <div>
            {coverPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={cover === coverPath(p.id)}
                className={cover === coverPath(p.id) ? 'is-selected' : ''}
                onClick={() => setCover(coverPath(p.id))}
              >
                <Image src={coverPath(p.id)} alt="" width={120} height={75} />
                <span>{p.label}</span>
                {cover === coverPath(p.id) && <Check size={17} />}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="v-upload">
          <ImagePlus size={19} />
          {uploading ? 'جارٍ رفع الصورة…' : 'أو ارفع غلافك الخاص'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              void upload(file);
            }}
          />
          <small>JPG، PNG، WebP · حتى ٢ ميغابايت</small>
        </label>
        <Input
          label="اسم الغرفة"
          placeholder="مثال: مجلس الأصدقاء"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={3}
          maxLength={80}
          required
        />
        <Textarea
          label="عن الغرفة"
          placeholder="ما الذي يجمعكم اليوم؟"
          rows={2}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="v-form-row">
          <Select
            label="التصنيف"
            value={category}
            onChange={(e) => setCategory(e.target.value as VoiceCategory)}
          >
            {VOICE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select
            label="المقاعد الصوتية"
            value={seatCount}
            onChange={(e) => setSeatCount(Number(e.target.value))}
          >
            {[2, 4, 6, 8, 9, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n} مقاعد
              </option>
            ))}
          </Select>
        </div>
        <div className="v-setting-row">
          <LockKeyhole />
          <div>
            <strong>غرفة خاصة</strong>
            <small>الدخول بدعوة أو كلمة مرور</small>
          </div>
          <Switch label="غرفة خاصة" checked={isPrivate} onChange={setPrivate} />
        </div>
        {isPrivate && (
          <Input
            label="كلمة المرور (اختيارية)"
            type="password"
            value={password}
            autoComplete="new-password"
            minLength={8}
            maxLength={100}
            onChange={(e) => setPassword(e.target.value)}
            description="يمكنك إنشاء رابط دعوة من داخل الغرفة."
          />
        )}
        <details className="v-advanced">
          <summary>
            <ShieldCheck size={18} />
            الصوت والدردشة والإشراف
          </summary>
          <Switch
            label="السماح بطلب الميكروفون"
            checked={allowMicRequests}
            onChange={setMicRequests}
          />
          <Switch label="تفعيل الدردشة" checked={chatEnabled} onChange={setChatEnabled} />
          <Switch
            label="السماح للمشرفين بإدارة المشاركين"
            checked={moderatorsCanManage}
            onChange={setModerators}
          />
        </details>
        {error && (
          <p role="alert" className="v-error">
            {error}
          </p>
        )}
        <button type="submit" className="v-button v-submit" disabled={busy || uploading}>
          <Plus size={19} />
          {busy ? 'جارٍ إنشاء الغرفة…' : 'إنشاء الغرفة'}
        </button>
        <p className="v-form-footnote">
          <Headphones size={14} />
          تبدأ الغرفة والميكروفون مكتوم. لا يُسجل الصوت.
        </p>
      </form>
    </Dialog>
  );
}
