'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import type { KingdomsWorld } from '@/lib/kingdoms/types';
import { kingdomsConfigSchema, defaultKingdomsConfig } from '@/lib/kingdoms/config';
import { request, type WorldSummary } from './use-kingdoms';
import { CommandForm, ResourceFields, amounts, date, number } from './shared';
import styles from './kingdoms.module.css';

type AdminWorld = { id: string; name: string; revision: number; state: KingdomsWorld };
export function KingdomsAdmin() {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [worldId, setWorldId] = useState('');
  const [world, setWorld] = useState<AdminWorld | null>(null);
  const [config, setConfig] = useState(JSON.stringify(defaultKingdomsConfig, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const working = useRef(false);
  const load = useCallback(async () => {
    try {
      const result = await request<WorldSummary[]>('/api/kingdoms/worlds');
      setWorlds(result);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);
  useEffect(() => {
    let current = true;
    void request<WorldSummary[]>('/api/kingdoms/worlds')
      .then((result) => {
        if (current) setWorlds(result);
      })
      .catch((failure) => {
        if (current) setError((failure as Error).message);
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    if (worldId)
      void request<AdminWorld>(`/api/admin/kingdoms?worldId=${encodeURIComponent(worldId)}`)
        .then((result) => {
          if (current) {
            setWorld(result);
            setConfig(JSON.stringify(result.state.config, null, 2));
          }
        })
        .catch((failure) => {
          if (current) setError((failure as Error).message);
        });
    return () => {
      current = false;
    };
  }, [worldId]);
  async function act(body: Record<string, unknown>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const fingerprint = JSON.stringify(body);
    const idempotencyKey =
      pending.current?.fingerprint === fingerprint
        ? pending.current.idempotencyKey
        : crypto.randomUUID();
    pending.current = { fingerprint, idempotencyKey };
    try {
      const saved = await request<{ id: string }>('/api/admin/kingdoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
      const result = await request<AdminWorld>(
        `/api/admin/kingdoms?worldId=${encodeURIComponent(saved.id)}`,
      );
      pending.current = null;
      setWorld(result);
      setWorldId(result.id);
      setConfig(JSON.stringify(result.state.config, null, 2));
      setNotice('تم حفظ التغيير.');
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function configure() {
    try {
      const parsed = kingdomsConfigSchema.parse(JSON.parse(config));
      void act({ action: 'configure', worldId, config: parsed });
    } catch {
      setError('الإعدادات غير صالحة. راجع أسماء الحقول والحدود والقيم الموجبة.');
    }
  }
  const selected = worlds.find((item) => item.id === worldId);
  return (
    <main className={styles.shell} dir="rtl">
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>إدارة عوالم الاستراتيجية</p>
          <h1>تحدي الممالك</h1>
          <p className={styles.muted}>إدارة المواسم والتوازن والموارد من إعدادات العالم.</p>
        </div>
      </header>
      {error && (
        <p role="alert" className={`${styles.notice} ${styles.error}`}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <div className={styles.toolbar}>
        <Select
          label="العالم"
          value={worldId}
          disabled={busy}
          onChange={(event) => {
            setWorldId(event.target.value);
            setWorld(null);
          }}
        >
          <option value="">اختر عالمًا</option>
          {worlds.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.status}
            </option>
          ))}
        </Select>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          تحديث العوالم
        </Button>
      </div>
      <section className={styles.panel}>
        <h2>افتح موسمًا جديدًا</h2>
        <p className={styles.muted}>
          يبدأ بعالم مستقل وإعدادات التوازن الافتراضية. يمكنك ضبط التوازن قبل استقبال اللاعبين.
        </p>
        <CommandForm
          busy={busy}
          label="أنشئ العالم والموسم"
          onSubmit={(form) => void act({ action: 'create', name: String(form.get('name')) })}
        >
          <Input label="اسم العالم" name="name" minLength={2} maxLength={80} required />
        </CommandForm>
      </section>
      {world && (
        <>
          <section className={styles.panel}>
            <h2>{world.name}</h2>
            <p>
              {number(Object.keys(world.state.players).length)} ممالك ·{' '}
              {number(Object.keys(world.state.villages).length)} قرى ·{' '}
              {number(world.state.movements.length)} تحركات
            </p>
            <p className={styles.muted}>
              نهاية الموسم: {date(world.state.season.endsAt)} · إصدار الحفظ {number(world.revision)}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act({ action: 'pause', worldId, paused: selected?.status !== 'PAUSED' })
              }
            >
              {selected?.status === 'PAUSED' ? 'استأنف استقبال الأوامر' : 'أوقف استقبال الأوامر'}
            </Button>
            <p className={styles.cost}>إيقاف الأوامر لا يوقف الإنتاج أو المؤقتات الجارية.</p>
          </section>
          <section className={styles.panel}>
            <h2>موعد نهاية الموسم</h2>
            <CommandForm
              busy={busy || world.state.season.status === 'ended'}
              label="احفظ موعد النهاية"
              onSubmit={(form) => {
                const endsAt = new Date(String(form.get('endsAt'))).getTime();
                if (!Number.isFinite(endsAt)) {
                  setError('اختر موعدًا صالحًا.');
                  return;
                }
                if (
                  endsAt < world.state.season.endsAt &&
                  !window.confirm(
                    'تقريب موعد النهاية يغيّر الوقت المتاح لجميع اللاعبين. هل تريد حفظ الموعد الجديد؟',
                  )
                )
                  return;
                void act({ action: 'season', worldId, endsAt });
              }}
            >
              <Input
                type="datetime-local"
                name="endsAt"
                label="موعد النهاية بالتوقيت المحلي"
                required
              />
            </CommandForm>
            <p className={styles.cost}>
              يمكن إنهاء الموسم الآن بتحديد الوقت الحالي. حسم النتيجة نهائي؛ افتح عالمًا جديدًا لبدء
              الموسم التالي.
            </p>
          </section>
          <section className={styles.panel}>
            <h2>توازن العالم</h2>
            <p className={styles.muted}>
              يشمل أسعار المباني والوحدات والسرعات والإنتاج والتوسع والحماية وموعد فتح العرش.
              الإنتاج والمعارك اللاحقة تستخدم القيم الجديدة، بما فيها الجيوش المنطلقة. أوقات الوصول
              والاكتمال المجدولة تبقى ثابتة. مدة الموسم هنا تخص إنشاء العوالم؛ عدّل موعد الموسم
              الحالي من الحقل أعلاه.
            </p>
            <Textarea
              label="إعدادات العالم (JSON)"
              value={config}
              onChange={(event) => setConfig(event.target.value)}
              dir="ltr"
              rows={24}
              spellCheck={false}
            />
            <Button disabled={busy} onClick={configure}>
              احفظ إعدادات التوازن
            </Button>
          </section>
          <section className={styles.panel}>
            <h2>تعديل موارد لاعب</h2>
            <CommandForm
              busy={busy}
              label="أضف الموارد"
              onSubmit={(form) =>
                void act({
                  action: 'grant',
                  worldId,
                  playerId: String(form.get('playerId')),
                  resources: amounts(form, 'grant'),
                })
              }
            >
              <Select label="المملكة" name="playerId" required>
                <option value="">اختر المملكة</option>
                {Object.values(world.state.players).map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </Select>
              <ResourceFields prefix="grant" title="موارد التعويض" />
            </CommandForm>
          </section>
        </>
      )}
    </main>
  );
}
