'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowUpLeft, Plus, Users } from 'lucide-react';
import type { VoiceRoomSummary } from '@/lib/voice/contracts';
import { Button } from '@/components/ui';
import styles from './voice.module.css';

export function VoiceLobby() {
  const router = useRouter();
  const [rooms, setRooms] = useState<VoiceRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/voice', { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'تعذّر تحميل الغرف.');
        setRooms(result.rooms ?? result.data?.rooms ?? []);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'تعذّر تحميل الغرف.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), clientId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'تعذّر إنشاء الغرفة.');
      router.push(`/voice/${encodeURIComponent(result.room.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذّر إنشاء الغرفة.');
      setCreating(false);
    }
  };
  return (
    <div className={styles.voice}>
      <header className={styles.lobbyHero}>
        <div>
          <span className={styles.eyebrow}>تحدّي لايف</span>
          <h1>للكلام مجلسه.</h1>
          <p>غرفة تجمع أصواتكم، وشخصياتكم، ولحظاتكم. افتح مجلسك أو انضم إلى أصدقائك.</p>
        </div>
        <span className={styles.heroPhoto} aria-hidden="true">
          <Image
            src="/community-assets/voice-majlis.webp"
            alt=""
            width={960}
            height={720}
            priority
            unoptimized
          />
        </span>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.lobbyTools}>
        <form onSubmit={create} className={styles.createForm}>
          <label htmlFor="voice-name">مجلس جديد</label>
          <div>
            <input
              id="voice-name"
              placeholder="اسم الغرفة الصوتية"
              minLength={3}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Button type="submit" variant="gold" loading={creating}>
              <Plus size={18} /> افتح غرفتك
            </Button>
          </div>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (/^[a-zA-Z0-9-]{1,64}$/.test(code.trim()))
              router.push(`/voice/${encodeURIComponent(code.trim())}`);
          }}
          className={styles.createForm}
        >
          <label htmlFor="voice-code">لديك رقم غرفة؟</label>
          <div>
            <input
              id="voice-code"
              dir="ltr"
              placeholder="رقم الغرفة"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              maxLength={64}
              pattern="[a-zA-Z0-9-]+"
            />
            <Button variant="outline" type="submit">
              انضم <ArrowUpLeft size={18} />
            </Button>
          </div>
        </form>
      </div>
      <section aria-labelledby="voice-rooms-title">
        <div className={styles.sectionHeading}>
          <h2 id="voice-rooms-title">مجالس مفتوحة</h2>
          <span>{rooms.length} غرفة</span>
        </div>
        {loading ? (
          <p className={styles.empty} role="status">
            جارٍ البحث عن المجالس…
          </p>
        ) : rooms.length === 0 ? (
          <div className={styles.empty}>
            <h3>كن أول صوت في المجلس</h3>
            <p>لا توجد غرف مفتوحة حاليًا. أنشئ غرفتك وشارك رقمها مع أصدقائك.</p>
          </div>
        ) : (
          <div className={styles.roomGrid}>
            {rooms.map((room) => (
              <a
                href={`/voice/${encodeURIComponent(room.id)}`}
                key={room.id}
                className={styles.roomCard}
              >
                <span className={styles.roomArt} aria-hidden="true">
                  <Image
                    src={room.imageUrl || '/community-assets/voice-majlis.webp'}
                    alt=""
                    width={400}
                    height={200}
                    unoptimized
                  />
                </span>
                <span className={styles.livePill}>مفتوحة الآن</span>
                <h3>{room.name}</h3>
                <div>
                  <bdi dir="ltr">#{room.code}</bdi>
                  <span>
                    <Users size={16} /> {room.memberCount} / 24
                  </span>
                </div>
                <span className={styles.roomCardLink}>
                  ادخل المجلس <ArrowUpLeft size={18} />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
      <p className={styles.footnote}>
        دخولك يبدأ بالاستماع. لن يُفتح الميكروفون قبل موافقة المضيف وضغطك على زر تشغيله.
      </p>
    </div>
  );
}
