'use client';

import {
  Crown,
  Eye,
  Medal,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QUESTION_WORD_BANK, QUESTION_WORD_STORAGE_KEY } from '@/components/instant-games';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/utils';

const ROOM_CODE = '739421';
type RoomSnapshot = {
  players: string[];
  playerScores: Record<string, number>;
  activePlayer: string;
  answeredPlayers: string[];
  roundIndex: number;
  seconds: number;
};

const EMPTY_ROOM: RoomSnapshot = {
  players: [],
  playerScores: {},
  activePlayer: '',
  answeredPlayers: [],
  roundIndex: 0,
  seconds: 60,
};

function readRoomSnapshot(): RoomSnapshot {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(QUESTION_WORD_STORAGE_KEY) || '',
    ) as Partial<RoomSnapshot>;
    if (!Array.isArray(parsed.players)) return EMPTY_ROOM;
    return {
      ...EMPTY_ROOM,
      ...parsed,
      players: parsed.players.filter((player): player is string => typeof player === 'string'),
      playerScores:
        parsed.playerScores && typeof parsed.playerScores === 'object' ? parsed.playerScores : {},
      answeredPlayers: Array.isArray(parsed.answeredPlayers) ? parsed.answeredPlayers : [],
    };
  } catch {
    return EMPTY_ROOM;
  }
}

export function QuestionWordHost() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [paused, setPaused] = useState(false);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [finished, setFinished] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot>(EMPTY_ROOM);
  const question = QUESTION_WORD_BANK[questionIndex] ?? QUESTION_WORD_BANK[0]!;
  const hostPlayers = room.players
    .map((name) => ({
      name,
      initials: name.slice(0, 2),
      score: room.playerScores[name] ?? 0,
      correctAnswers: room.answeredPlayers.includes(name) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score);

  useEffect(() => {
    const syncRoom = () => {
      const next = readRoomSnapshot();
      setRoom(next);
      setQuestionIndex(next.roundIndex);
      setSeconds(next.seconds);
    };
    syncRoom();
    window.addEventListener('storage', syncRoom);
    return () => window.removeEventListener('storage', syncRoom);
  }, []);

  useEffect(() => {
    if (paused || finished || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [finished, paused, seconds]);

  const nextQuestion = () => {
    setQuestionIndex((value) => (value + 1) % QUESTION_WORD_BANK.length);
    setSeconds(60);
    setAnswerVisible(false);
    setPaused(false);
  };

  if (finished) {
    const champion = hostPlayers[0];
    return (
      <main className="question-word-host question-word-host--final">
        <div className="question-word-host__finale">
          <div className="question-word-host__finale-kicker">
            <Sparkles aria-hidden="true" />
            <span>النتيجة النهائية · كلمة وسؤال</span>
          </div>
          {champion ? (
            <>
              <header className="question-word-host__champion">
                <span className="question-word-host__champion-seal" aria-hidden="true">
                  <Crown />
                </span>
                <p>بطل المباراة</p>
                <h1>{champion.name}</h1>
                <strong dir="ltr">{formatNumber(champion.score)} نقطة</strong>
              </header>

              <ol className="question-word-host__podium" aria-label="منصة أبطال كلمة وسؤال">
                {hostPlayers.slice(0, 3).map((player, index) => {
                  const rank = index + 1;
                  const place = ['الأول', 'الثاني', 'الثالث'][index];
                  return (
                    <li key={player.name} data-rank={rank}>
                      <span className="question-word-host__medal" aria-hidden="true">
                        {rank === 1 ? <Crown /> : <Medal />}
                      </span>
                      <span className="question-word-host__avatar" aria-hidden="true">
                        {player.initials}
                      </span>
                      <small>المركز {place}</small>
                      <strong>{player.name}</strong>
                      <span dir="ltr">{formatNumber(player.score)} نقطة</span>
                      <div className="question-word-host__pedestal" aria-hidden="true">
                        <b>{formatNumber(rank)}</b>
                        <i />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="question-word-host__finale-empty" role="status">
              <Trophy aria-hidden="true" />
              <h1>لا توجد نتائج للتتويج</h1>
            </div>
          )}
          <Button variant="gold" size="lg" onClick={() => setFinished(false)}>
            <RotateCcw aria-hidden="true" />
            إعادة العرض
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="question-word-host">
      <header className="question-word-host__header">
        <div>
          <span>لوحة المضيف · الغرفة الحالية</span>
          <h1>كلمة وسؤال</h1>
        </div>
        <div className="question-word-host__room">
          <small>رمز الدخول</small>
          <strong dir="ltr">{ROOM_CODE}</strong>
        </div>
        <nav aria-label="روابط اللعبة">
          <Link href="/games/question-word">فتح شاشة اللاعبين</Link>
          <Link href="/questions?game=QUESTION_WORD">بنك أسئلة اللعبة</Link>
        </nav>
      </header>

      <div className="question-word-host__grid">
        <section className="question-word-host__stage" aria-labelledby="host-question">
          <div className="question-word-host__status">
            <span>
              السؤال {formatNumber(questionIndex + 1)} / {formatNumber(QUESTION_WORD_BANK.length)}
            </span>
            <strong data-ending={seconds <= 10 || undefined}>{formatNumber(seconds)}</strong>
            <span role="status" aria-atomic="true">
              أجاب {formatNumber(room.answeredPlayers.length)} من{' '}
              {formatNumber(room.players.length)} لاعبين
            </span>
          </div>

          <div className="question-word-host__question">
            <span>السؤال الحالي</span>
            <h2 id="host-question">{question.question}</h2>
            <div className="question-word-host__slots" aria-label="خانات الإجابة">
              {[...question.answer].map((letter, index) => (
                <b key={`${letter}-${index}`}>{answerVisible ? letter : ''}</b>
              ))}
            </div>
            {answerVisible ? (
              <p className="question-word-host__answer" role="status">
                الإجابة الصحيحة: <strong>{question.answer}</strong>
              </p>
            ) : null}
            <div className="question-word-host__letters" aria-label="الحروف المتاحة">
              {question.letters.map((letter, index) => (
                <span key={`${letter}-${index}`}>{letter}</span>
              ))}
            </div>
          </div>

          <div className="question-word-host__controls">
            <Button variant="outline" onClick={() => setPaused((value) => !value)}>
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? 'استئناف الوقت' : 'إيقاف الوقت'}
            </Button>
            <Button variant="outline" onClick={() => setAnswerVisible(true)}>
              <Eye aria-hidden="true" />
              إظهار الإجابة
            </Button>
            <Button variant="gold" onClick={nextQuestion}>
              <SkipForward aria-hidden="true" />
              السؤال التالي
            </Button>
            <Button variant="destructive" onClick={() => setFinished(true)}>
              <Trophy aria-hidden="true" />
              إنهاء وتتويج
            </Button>
          </div>
        </section>

        <aside className="question-word-host__ranking" aria-label="ترتيب اللاعبين المباشر">
          <header>
            <div>
              <Users aria-hidden="true" />
              <span>{formatNumber(room.players.length)} لاعبين</span>
            </div>
            <h2>الترتيب المباشر</h2>
          </header>
          {hostPlayers.length === 0 ? (
            <div className="question-word-host__empty" role="status">
              <Users aria-hidden="true" />
              <strong>بانتظار دخول اللاعبين</strong>
              <span>افتح شاشة اللاعبين وأضف لاعبين لظهور الترتيب هنا.</span>
            </div>
          ) : (
            <ol>
              {hostPlayers.map((player, index) => (
                <li key={player.name} data-rank={index + 1}>
                  <span>{formatNumber(index + 1)}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <small>{formatNumber(player.correctAnswers)} إجابات صحيحة</small>
                  </div>
                  <b>{formatNumber(player.score)}</b>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </main>
  );
}
