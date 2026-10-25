import { voiceApiPath } from './voice-client';

export class VoiceMediaTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A strict Cloud revocation has a short cutoff before a replacement JWT is valid. */
export async function requestVoiceMediaToken(roomId: string, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(voiceApiPath(`rooms/${encodeURIComponent(roomId)}/token`), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json();
    signal.throwIfAborted();
    if (response.ok) return payload as { token: string; url: string; canPublish: boolean };
    if (response.status === 409 && payload.code === 'MEDIA_RETRY' && attempt < 4) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, 1000);
        signal.addEventListener('abort', abort, { once: true });
      });
      continue;
    }
    throw new VoiceMediaTokenError(
      payload.error || 'تعذّر الحصول على صلاحية الصوت.',
      response.status,
      payload.code,
    );
  }
}
