'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { joinLiveSessionByCode } from '@/app/live/actions';
import { Button, Input } from '@/components/ui';
import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

const CHESS_ROOM_CODE_RE = /^\d{6}$/;

export function JoinQuizForm({
  initialCode = '',
  inviteMode = false,
}: {
  initialCode?: string;
  inviteMode?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [joining, startJoining] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomCode = normalizeRoomCode(code);
    const isQuizCode = isRoomCode(roomCode);
    const isChessCode = CHESS_ROOM_CODE_RE.test(roomCode);
    if (!isQuizCode && !isChessCode) {
      setError('الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.');
      return;
    }
    if (playerName.trim().length < 2) {
      setError('اكتب اسمًا من حرفين على الأقل.');
      return;
    }

    setError('');
    startJoining(async () => {
      if (isQuizCode) {
        const result = await joinLiveSessionByCode(roomCode, playerName);
        if (result.status === 'success') {
          const query = new URLSearchParams({
            participantId: result.participantId,
            code: result.roomCode,
          });
          if (result.gameType === 'quiz') {
            query.set('token', result.participantToken);
          }
          const basePath =
            result.gameType === 'mafia'
              ? `/mafia/${result.sessionId}/play`
              : `/live/${result.sessionId}/play`;
          router.push(`${basePath}?${query.toString()}`);
          return;
        }
        if (!isChessCode) {
          setError(result.message);
          return;
        }
      }

      localStorage.setItem('tahaddi-chess-player-name', playerName.trim());
      router.push(`/games/chess/?join=${roomCode}`);
    });
  }

  return (
    <form className="join-box" id="join" onSubmit={handleSubmit} noValidate>
      {inviteMode && (
        <p className="join-notice" role="note">
          دخول لاعب زائر. لا تحتاج إلى حساب؛ اكتب اسمك فقط ثم ادخل الغرفة.
        </p>
      )}
      <Input
        id="player-name"
        name="playerName"
        label="اسم اللاعب"
        className="join-field"
        placeholder="الاسم الذي سيظهر في الغرفة"
        value={playerName}
        onChange={(event) => {
          setPlayerName(event.target.value);
          if (error) setError('');
        }}
        autoComplete="nickname"
        maxLength={40}
        required
      />
      <Input
        id="room-code"
        name="roomCode"
        label="رمز الغرفة"
        className="join-field"
        placeholder="الرمز المرسل من المضيف"
        value={code}
        onChange={(event) => {
          setCode(event.target.value.toUpperCase());
          if (error) setError('');
        }}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
        error={error || undefined}
        required
      />
      <Button size="lg" type="submit" loading={joining} disabled={joining}>
        انضم الآن
        <ArrowLeft />
      </Button>
    </form>
  );
}
