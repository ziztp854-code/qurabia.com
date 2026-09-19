'use client';
import { formatNumber } from '@/lib/utils';

import Link from 'next/link';
import { Check, CircleHelp, Crown, Flag, Hourglass, Info, ShieldCheck, UsersRound, X } from 'lucide-react';
import { LiveFinaleExperience } from './live-finale-experience';
import { LiveQuestionStage } from './live-question-stage';
import { useLiveGame } from './use-live-game';

export function LivePlayerExperience({
  sessionId,
  participantId,
  accessToken,
  displayName,
}: {
  sessionId: string;
  participantId: string;
  accessToken: string;
  displayName: string;
}) {
  const game = useLiveGame({
    sessionId,
    subjectId: participantId,
    accessToken,
    role: 'player',
  });
  const snapshot = game.snapshot;
  const selectedOptionId = snapshot?.playerAnswer?.optionId || undefined;

  return (
    <div
      className="royal-live royal-player-experience"
      data-phase={snapshot?.phase ?? 'CONNECTING'}
    >
      <header className="royal-player-header">
        <div className="royal-player-brand" aria-label="تحدّي — منصة التحديات الذكية">
          <Crown aria-hidden="true" />
          <strong>تحدّي</strong>
          <span>منصة التحديات الذكية</span>
        </div>
        <div className="royal-player-identity">
          <span>اللاعب</span>
          <strong>{displayName}</strong>
        </div>
        <span
          className={`royal-player-connection${game.connected ? ' is-connected' : ' is-reconnecting'}`}
        >
          <i aria-hidden="true" />
          {game.connected ? 'متصل' : 'يعيد الاتصال'}
        </span>
        <span
          className="royal-player-audience"
          aria-label={`${formatNumber(snapshot?.participantCount ?? 0)} متسابق`}
        >
          <UsersRound aria-hidden="true" />
          {formatNumber(snapshot?.participantCount ?? 0)}
        </span>
        <Link className="royal-player-help" href="/contact" aria-label="الإبلاغ عن مشكلة">
          <Flag aria-hidden="true" />
          <CircleHelp aria-hidden="true" />
          <span>الإبلاغ عن مشكلة</span>
        </Link>
      </header>

      {game.message && (
        <p className="royal-player-status" role="status">
          {game.message}
        </p>
      )}

      {!snapshot || snapshot.phase === 'LOBBY' ? (
        <section className="royal-player-waiting royal-panel">
          <span className="royal-player-phase">01 · الانتظار</span>
          <h1>بانتظار المضيف</h1>
          <p>
            {formatNumber(snapshot?.participantCount ?? 0)} لاعب متصل
            {(snapshot?.participantCount ?? 0) > 0
              ? ' — سيبدأ السؤال عند بدء المضيف للجولة.'
              : ' — ستظهر خيارات السؤال هنا فور بدء الجولة.'}
          </p>
          <div className="royal-player-waiting-indicator" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : snapshot.phase === 'FINISHED' ? (
        <LiveFinaleExperience
          players={snapshot.leaderboard}
          participantId={participantId}
          roundNumber={snapshot.question?.questionNumber}
          totalRounds={snapshot.question?.totalQuestions}
        />
      ) : snapshot.phase === 'LEADERBOARD' ? (
        <section className="royal-player-waiting royal-panel">
          <h1>يُعرض الترتيب الآن</h1>
          <p>السؤال التالي سيظهر تلقائيًا خلال لحظات.</p>
        </section>
      ) : snapshot.question ? (
        <section className="royal-player-question-shell" aria-label="السؤال الحالي">
          <div className="royal-player-progress" aria-hidden="true">
            <span className="royal-player-progress-track">
              <i
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (snapshot.question.questionNumber / snapshot.question.totalQuestions) * 100,
                    ),
                  )}%`,
                }}
              />
            </span>
            <b>
              {formatNumber(snapshot.question.questionNumber)}/{formatNumber(snapshot.question.totalQuestions)}
            </b>
          </div>
          <LiveQuestionStage
            question={snapshot.question}
            phase={snapshot.phase}
            reveal={snapshot.reveal}
            stats={snapshot.phase === 'REVEAL' ? game.stats : null}
            clockOffset={game.clockOffset}
            selectedOptionId={selectedOptionId}
            onSelect={(optionId) => game.submitAnswer(snapshot.question!.questionId, optionId)}
            disabled={game.busy || Boolean(snapshot.playerAnswer)}
            className="royal-question-stage--player"
          />
          {snapshot.playerAnswer && snapshot.phase === 'QUESTION' && (
            <aside className="royal-answer-confirmed" role="status">
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>تم تسجيل إجابتك</strong>بانتظار نتيجة السؤال بعد انتهاء الوقت
              </span>
            </aside>
          )}
          {snapshot.phase === 'QUESTION' && (
            <p className="royal-answer-hint">
              <Info aria-hidden="true" /> اختر إجابتك قبل انتهاء الوقت
            </p>
          )}
          {(() => {
            const me = snapshot.leaderboard.find((player) => player.id === participantId);
            if (!me) return null;
            return (
              <dl className="royal-player-mystats" aria-label="نقاطك وترتيبك">
                <div>
                  <dt>نقاطك</dt>
                  <dd>{formatNumber(me.score)}</dd>
                </div>
                <div>
                  <dt>ترتيبك الحالي</dt>
                  <dd>{formatNumber(me.rank)}</dd>
                </div>
              </dl>
            );
          })()}
          {snapshot.phase === 'REVEAL' && (
            <section
              className={`royal-player-result${
                snapshot.playerResult?.correct ? ' is-correct' : ' is-incorrect'
              }`}
              role="status"
            >
              {snapshot.playerResult ? (
                <>
                  <span className="royal-player-result-emblem" aria-hidden="true">
                    {snapshot.playerResult.correct ? <Check /> : <X />}
                  </span>
                  <h2>{snapshot.playerResult.correct ? 'إجابة صحيحة' : 'إجابة غير صحيحة'}</h2>
                  {snapshot.playerResult.correct && (
                    <p className="royal-player-result-points">
                      <b>+{formatNumber(snapshot.playerResult.earnedPoints)}</b>
                      <span>نقطة</span>
                    </p>
                  )}
                  <dl className="royal-player-result-stats">
                    <div>
                      <dt>مجموعك</dt>
                      <dd>{formatNumber(snapshot.playerResult.totalScore)}</dd>
                    </div>
                    <div>
                      <dt>ترتيبك</dt>
                      <dd>{formatNumber(snapshot.playerResult.rank)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <span className="royal-player-result-emblem is-timeout" aria-hidden="true">
                    <Hourglass />
                  </span>
                  <h2>انتهى وقت السؤال</h2>
                  <p>لم تُسجل إجابة لهذه الجولة.</p>
                </>
              )}
            </section>
          )}
        </section>
      ) : null}
    </div>
  );
}
