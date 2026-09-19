import 'server-only';

import { cookies } from 'next/headers';

const GAME_ID_RE = /^[a-zA-Z0-9_-]{1,191}$/;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

function accessCookieName(gameId: string) {
  if (!GAME_ID_RE.test(gameId)) return null;
  return `tahaddi-mafia-${gameId}`;
}

export async function getMafiaAccessToken(gameId: string) {
  const name = accessCookieName(gameId);
  if (!name) return '';
  return (await cookies()).get(name)?.value ?? '';
}

export async function setMafiaAccessToken(gameId: string, token: string) {
  const name = accessCookieName(gameId);
  if (!name) throw new Error('Invalid Mafia game identifier.');

  (await cookies()).set({
    name,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
