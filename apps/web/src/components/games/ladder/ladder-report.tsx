'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { LadderRoomSnapshot, LadderTeam } from '@tahaddi/domain';
import { BrandMark } from '@/components/brand';
import { Button } from '@/components/ui';
import styles from './ladder-report.module.css';

type Props = { room: LadderRoomSnapshot };

function Report({ room, side }: Props & { side: LadderTeam }) {
  const history = room.roundHistory ?? [];
  const name = (side === 'right' ? room.rightTeam : room.leftTeam)[0]?.playerName ?? 'اللاعب';
  const mistakes = history.filter((round) => !round[side].correct);
  const score = side === 'right' ? room.rightScore : room.leftScore;
  const position = side === 'right' ? room.rightPosition : room.leftPosition;
  const date = room.endedAt ? new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(room.endedAt)) : 'غير متوفر';

  return (
    <article className={styles.report} dir="rtl" lang="ar" aria-label={`تقرير اللاعب ${name}`}>
      <header className={styles.header}>
        <div className={styles.brand}><BrandMark tone="dark" /><div><strong>تحدي</strong><small>تفاعل، تنافس، تميّز</small></div></div>
        <div className={styles.heading}><span>لعبة السلم</span><h2>تقرير اللقاء</h2><p>مراجعة الإجابات والوقت</p></div>
      </header>
      <div className={styles.meta}>
        <div><span>اللاعب</span><strong>{name}</strong></div>
        <div><span>رمز الغرفة</span><strong dir="ltr">{room.roomCode}</strong></div>
        <div><span>تاريخ اللقاء · الرياض</span><strong>{date}</strong></div>
      </div>
      <div className={styles.stats}>
        <div><strong>{history.length}</strong><span>أسئلة مكتملة</span></div>
        <div><strong>{history.length - mistakes.length}</strong><span>إجابات صحيحة</span></div>
        <div><strong>{mistakes.length}</strong><span>تحتاج للمراجعة</span></div>
        <div><strong>{score}</strong><span>النقاط</span></div>
        <div><strong>{position}</strong><span>درجة السلم</span></div>
      </div>
      <section className={styles.details}>
        <h3>تفاصيل الأسئلة والإجابات</h3>
        <p>جميع أسئلة اللقاء، مع خيارات كل سؤال ونتيجة إجابتك.</p>
        {history.map((round) => {
          const answer = round[side];
          const selected = round.options.find((option) => option.id === answer.optionId)?.text;
          const correct = round.options.find((option) => option.id === round.correctOptionId)?.text ?? 'غير متوفرة';
          return <section className={styles.question} key={`${round.roundNumber}-${round.questionId}`}>
            <div className={styles.questionHeader}>
              <span>السؤال {round.roundNumber}</span>
              <strong className={answer.correct ? styles.correct : styles.incorrect}>{answer.correct ? 'إجابة صحيحة' : answer.optionId === null ? 'لم تتم الإجابة' : 'إجابة خاطئة'}</strong>
            </div>
            <h4>{round.questionText}</h4>
            <ol className={styles.options}>
              {round.options.map((option) => <li key={option.id}>{option.text}{option.id === round.correctOptionId && <strong> — الإجابة الصحيحة</strong>}</li>)}
            </ol>
            <div className={styles.answerDetails}>
              <p><strong>إجابتك:</strong> {answer.optionId === null ? 'لم تتم الإجابة' : selected ?? 'غير متوفرة'}</p>
              <p><strong>الإجابة الصحيحة:</strong> {correct}</p>
              <p><strong>وقت الإجابة:</strong> {answer.elapsedMs === null ? 'لم يُسجّل وقت' : `${(answer.elapsedMs / 1000).toFixed(1)} ثانية`}</p>
              <p><strong>تغير النقاط:</strong> {answer.points > 0 ? `+${answer.points}` : answer.points}</p>
            </div>
          </section>;
        })}
      </section>
      <footer className={styles.footer}>تحدي · تقرير شخصي للقاء · qurabia.com</footer>
    </article>
  );
}

export function LadderReport({ room }: Props) {
  const [side, setSide] = useState<LadderTeam | null>(null);
  const names = { right: room.rightTeam[0]?.playerName ?? 'المتسابق الأول', left: room.leftTeam[0]?.playerName ?? 'المتسابق الثاني' };
  if (!room.roundHistory?.length) return null;
  return <section className={styles.container} aria-label="تقرير المباراة">
    <h3>تقرير إجاباتك</h3>
    <p>اختر اسم اللاعب لعرض جميع أسئلته وإجاباته وحفظ تقريره بصيغة PDF.</p>
    <div className={styles.actions}>
      {(['right', 'left'] as const).map((playerSide) => <Button key={playerSide} type="button" variant="secondary" onClick={() => setSide(playerSide)} aria-pressed={side === playerSide}>تقرير {names[playerSide]}</Button>)}
    </div>
    {side && <>
      <div className={styles.preview}><Report room={room} side={side} /></div>
      <Button type="button" onClick={() => window.print()}>طباعة التقرير أو حفظه PDF</Button>
      <p className={styles.hint}>لحفظ الملف، اختر «حفظ بصيغة PDF» من نافذة الطباعة.</p>
      {typeof document !== 'undefined' && createPortal(<div data-ladder-print-root aria-hidden="true" className={styles.printRoot}><Report room={room} side={side} /></div>, document.body)}
    </>}
  </section>;
}
