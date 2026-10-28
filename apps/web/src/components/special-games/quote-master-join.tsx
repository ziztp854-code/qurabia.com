import { Feather } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import styles from './quote-master-join.module.css';

/** Old invitation links remain understandable even though this game is currently individual. */
export function QuoteMasterJoin({ roomCode }: { roomCode: string }) {
  return (
    <section className={styles.wrap} dir="rtl">
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.card}>
        <span className={styles.emblem} aria-hidden="true"><Feather size={22} strokeWidth={2.2} /></span>
        <h1>مَنِ القائل؟</h1>
        <p className={styles.sub}>هذه اللعبة فردية على جهاز واحد حاليًا.</p>
        <div className={styles.codeBox}>
          <span>رمز الدعوة السابق</span>
          <strong dir="ltr">{roomCode || '••••••'}</strong>
        </div>
        <p role="status">الانضمام إلى غرفة مشتركة غير متاح حاليًا. يمكنك فتح اللعبة والبدء على جهازك.</p>
        <ButtonLink href="/games/quote-master" variant="gold" size="lg" fullWidth>
          افتح اللعبة
        </ButtonLink>
      </div>
    </section>
  );
}
