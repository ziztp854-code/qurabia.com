'use client';

import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

export function RoomCodeShortcut() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = normalizeRoomCode(code);
    if (!isRoomCode(normalizedCode)) {
      setError('أدخل رمز غرفة صالحًا من 6 إلى 8 خانات.');
      return;
    }
    router.push(`/join/${normalizedCode}`);
  }

  return (
    <form className="home-room-shortcut" onSubmit={handleSubmit} noValidate>
      <label className="sr-only" htmlFor="home-room-code">
        رمز الغرفة
      </label>
      <input
        id="home-room-code"
        name="roomCode"
        value={code}
        onChange={(event) => {
          setCode(event.target.value.toUpperCase());
          if (error) setError('');
        }}
        placeholder="اكتب رمز الغرفة"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={9}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'home-room-code-error' : undefined}
      />
      <button type="submit">
        انضم
        <LogIn aria-hidden="true" />
      </button>
      {error && (
        <span id="home-room-code-error" className="home-room-shortcut-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
