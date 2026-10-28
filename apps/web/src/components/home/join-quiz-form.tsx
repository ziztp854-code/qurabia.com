'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { joinLiveSessionByCode } from '@/app/live/actions';
import { Button, Input, Select } from '@/components/ui';
import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

const CHESS_ROOM_CODE_RE = /^\d{6}$/;
const ROOM_TYPES = {
  chess: { label: 'الشطرنج', pattern: /^\d{6}$/, route: '/games/chess?join=', hint: '٦ أرقام' },
  baloot: { label: 'البلوت', pattern: /^\d{6}$/, route: '/games/baloot/join/', hint: '٦ أرقام' },
  parallel: { label: 'العالم الموازي', pattern: /^\d{6}$/, route: '/games/parallel-world?join=', hint: '٦ أرقام' },
  reverse: { label: 'الزمن المقلوب', pattern: /^\d{6}$/, route: '/games/reverse-time?join=', hint: '٦ أرقام' },
  infiltrator: { label: 'الدخيل', pattern: /^\d{6}$/, route: '/games/infiltrator?join=', hint: '٦ أرقام' },
  fastest: { label: 'أسرع كبسة زر', pattern: /^\d{6}$/, route: '/games/fastest-button/join/', hint: '٦ أرقام' },
  ladder: { label: 'السلم', pattern: /^[0-9A-F]{8}$/, route: '/games/ladder/join/', hint: '٨ أحرف أو أرقام من الرمز' },
  elimination: { label: 'حلقة الإقصاء', pattern: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, route: '/games/elimination-live/join/', hint: '٦ أحرف أو أرقام من الرمز' },
  scrambled: { label: 'كلمات مفككة — مباشرة', pattern: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/, route: '/games/scrambled-words-live/join/', hint: '٦ أحرف أو أرقام من الرمز' },
} as const;
type RoomType = 'auto' | keyof typeof ROOM_TYPES;
const NUMERIC_ROOM_TYPES: readonly RoomType[] = ['chess', 'baloot', 'parallel', 'reverse', 'infiltrator', 'fastest'];

export function JoinQuizForm({
  initialCode = '',
  inviteMode = false,
}: {
  initialCode?: string;
  inviteMode?: boolean;
}) {
  const router = useRouter();
  const [roomType, setRoomType] = useState<RoomType>('auto');
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'name' | 'code'>('code');
  const [joining, startJoining] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomCode = normalizeRoomCode(code);
    if (roomType !== 'auto') {
      const room = ROOM_TYPES[roomType];
      if (!room.pattern.test(roomCode)) {
        setErrorField('code');
        setError(`تحقق من رمز ${room.label}: ${room.hint}.`);
        return;
      }
      router.push(`${room.route}${roomCode}`);
      return;
    }
    const isQuizCode = isRoomCode(roomCode);
    const isChessCode = CHESS_ROOM_CODE_RE.test(roomCode);
    if (!isQuizCode && !isChessCode) {
      setErrorField('code');
      setError('الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.');
      return;
    }
    if (playerName.trim().length < 2) {
      setErrorField('name');
      setError('اكتب اسمًا من حرفين على الأقل.');
      return;
    }

    setError('');
    startJoining(async () => {
      if (isQuizCode) {
        let result: Awaited<ReturnType<typeof joinLiveSessionByCode>>;
        try {
          result = await joinLiveSessionByCode(roomCode, playerName);
        } catch {
          setErrorField('code');
          setError('تعذّر الاتصال بخدمة الانضمام. تحقق من اتصالك وحاول مجددًا.');
          return;
        }
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
        if (!isChessCode || result.reason !== 'not_found') {
          setErrorField(result.reason === 'name_taken' ? 'name' : 'code');
          setError(result.message);
          return;
        }
      }

      try {
        localStorage.setItem('tahaddi-chess-player-name', playerName.trim());
      } catch {
        setErrorField('name');
        setError('تعذّر حفظ اسم اللاعب على هذا الجهاز. فعّل التخزين المحلي ثم حاول مجددًا.');
        return;
      }
      router.push(`/games/chess/?join=${roomCode}`);
    });
  }

  return (
    <form className="join-box" id="join" onSubmit={handleSubmit} noValidate>
      {inviteMode && (
        <p className="join-notice" role="note">
          اختر نوع الغرفة؛ ستُدخل اسمك في شاشة اللعبة إذا كان مطلوبًا.
        </p>
      )}
      <Select
        id="room-type"
        className="join-room-type"
        label="نوع الغرفة"
        value={roomType}
        onChange={(event) => {
          setRoomType(event.target.value as RoomType);
          setError('');
        }}
        description="اختر اللعبة إذا كان الرمز خاصًا بها."
      >
        <option value="auto">مسابقة أو قاتل أو شطرنج</option>
        {Object.entries(ROOM_TYPES).map(([value, room]) => (
          <option key={value} value={value}>{room.label}</option>
        ))}
      </Select>
      {roomType === 'auto' && <Input
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
        error={errorField === 'name' ? error || undefined : undefined}
        autoComplete="nickname"
        maxLength={40}
        required
      />}
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
        inputMode={NUMERIC_ROOM_TYPES.includes(roomType) ? 'numeric' : 'text'}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
        error={errorField === 'code' ? error || undefined : undefined}
        required
      />
      <Button size="lg" type="submit" loading={joining} disabled={joining}>
        انضم الآن
        <ArrowLeft aria-hidden="true" />
      </Button>
    </form>
  );
}
