'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/ui/overlay';
import { Input, Select, Switch, Textarea } from '@/components/ui/forms';
import {
  VOICE_CATEGORIES,
  type VoiceRoom,
  type VoiceRoomSettings,
  type VoiceSnapshot,
} from '@/lib/voice/types';
import { coverPath, coverPresets, voiceRequest } from './voice-client';

export function RoomSettings({
  room,
  open,
  onOpenChange,
  onSave,
}: {
  room: VoiceRoom;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSave: (snapshot: VoiceSnapshot) => void;
}) {
  const [settings, setSettings] = useState<VoiceRoomSettings>(room);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  function update<K extends keyof VoiceRoomSettings>(key: K, value: VoiceRoomSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const {
        name,
        description,
        category,
        cover,
        seatCount,
        isPrivate,
        allowMicRequests,
        chatEnabled,
        moderatorsCanManage,
      } = settings;
      onSave(
        await voiceRequest<VoiceSnapshot>(
          `rooms/${room.id}`,
          {
            name,
            description,
            category,
            cover,
            seatCount,
            isPrivate,
            allowMicRequests,
            chatEnabled,
            moderatorsCanManage,
            ...(isPrivate && password ? { password } : {}),
          },
          'PATCH',
        ),
      );
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="إعدادات الغرفة" className="v-dialog">
      <form className="v-create-form" onSubmit={submit}>
        <Input
          label="اسم الغرفة"
          required
          minLength={3}
          maxLength={80}
          value={settings.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <Textarea
          label="وصف الغرفة"
          value={settings.description}
          maxLength={500}
          onChange={(e) => update('description', e.target.value)}
        />
        <Select
          label="التصنيف"
          value={settings.category}
          onChange={(e) => update('category', e.target.value as VoiceRoomSettings['category'])}
        >
          {VOICE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select
          label="الغلاف"
          value={settings.cover}
          onChange={(e) => update('cover', e.target.value)}
        >
          {!coverPresets.some((p) => coverPath(p.id) === settings.cover) && (
            <option value={settings.cover}>الغلاف الحالي</option>
          )}
          {coverPresets.map((p) => (
            <option key={p.id} value={coverPath(p.id)}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          label="عدد المقاعد"
          value={settings.seatCount}
          onChange={(e) => update('seatCount', Number(e.target.value))}
        >
          {[2, 4, 6, 8, 12, 16].map((n) => (
            <option key={n} value={n}>
              {n} مقاعد
            </option>
          ))}
        </Select>
        <Switch
          label="غرفة خاصة"
          checked={settings.isPrivate}
          onChange={(v) => update('isPrivate', v)}
        />
        <>
          {settings.isPrivate && (
            <Input
              label="كلمة مرور جديدة (اختيارية)"
              type="password"
              minLength={6}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </>
        <Switch
          label="السماح بطلب الميكروفون"
          checked={settings.allowMicRequests}
          onChange={(v) => update('allowMicRequests', v)}
        />
        <Switch
          label="تفعيل الدردشة"
          checked={settings.chatEnabled}
          onChange={(v) => update('chatEnabled', v)}
        />
        <Switch
          label="السماح للمشرفين بإدارة المشاركين"
          checked={settings.moderatorsCanManage}
          onChange={(v) => update('moderatorsCanManage', v)}
        />
        {error && (
          <p className="v-error" role="alert">
            {error}
          </p>
        )}
        <button className="v-button" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
        </button>
      </form>
    </Dialog>
  );
}
