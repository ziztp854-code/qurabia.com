export class VoiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'VOICE_REQUEST_REJECTED',
  ) {
    super(message);
  }
}
