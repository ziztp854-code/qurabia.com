'use client';

import { CheckCircle2, Feather, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink, Input } from '@/components/ui';
import styles from './quote-master-join.module.css';

/**
 * شاشة انضمام المتسابق بعد مسح الباركود.
 * (المرحلة الأولى: تسجيل الاسم والانتظار — يُربط التزامن الحيّ للإجابات في المرحلة الثانية.)
 */
export function QuoteMasterJoin({ roomCode }: { roomCode: string }) {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);

  const canJoin = name.trim().length >= 2 && roomCode.length === 6;

  return (
    <section className={styles.wrap} dir="rtl">
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.card}>
        <span className={styles.emblem} aria-hidden="true">
          <Feather size={22} strokeWidth={2.2} />
        </span>
        <h1>مَنِ القائل؟</h1>
        <p className={styles.sub}>انضمام إلى غرفة المضيف</p>

        <div className={styles.codeBox}>
          <span>رمز الغرفة</span>
          <strong dir="ltr">{roomCode || '••••••'}</strong>
        </div>

        {joined ? (
          <div className={styles.waiting} role="status">
            <CheckCircle2 className={styles.okIcon} aria-hidden="true" />
            <strong>أهلاً {name.trim()}!</strong>
            <p>
              <LoaderCircle className={styles.spin} size={16} aria-hidden="true" /> بانتظار أن يبدأ
              المضيف الجولة… أبقِ هذه الصفحة مفتوحة.
            </p>
          </div>
        ) : (
          <>
            <Input
              id="qm-name"
              label="اسمك في اللعبة"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم الظاهر"
              maxLength={30}
              autoComplete="nickname"
              description="حرفان على الأقل"
            />
            <Button
              variant="gold"
              size="lg"
              fullWidth
              disabled={!canJoin}
              onClick={() => setJoined(true)}
            >
              انضمام
            </Button>
          </>
        )}

        <ButtonLink href="/games/quote-master" variant="ghost" size="sm" className={styles.hostLink}>
          أنا المضيف — افتح شاشة العرض
        </ButtonLink>
      </div>
    </section>
  );
}
