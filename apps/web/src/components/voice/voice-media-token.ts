import { voiceRequest, VoiceRequestError } from './voice-client';

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
    try {
      // Token issuance shares the bounded permission-write request path. A stalled
      // fetch or response body must return control to AudioSession's recovery loop.
      return await voiceRequest<{ token: string; url: string; canPublish: boolean }>(
        `rooms/${encodeURIComponent(roomId)}/token`,
        {},
        'POST',
        { signal },
      );
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof VoiceRequestError)) throw error;
      if (error.status === 409 && error.code === 'MEDIA_RETRY' && attempt < 4) {
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
      throw new VoiceMediaTokenError(error.message, error.status, error.code);
    }
  }
}
