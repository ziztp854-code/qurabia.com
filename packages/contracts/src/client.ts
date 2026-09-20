/**
 * React Native/browser-safe live protocol entrypoint.
 *
 * Keep Node-only token signing helpers out of this module. Applications obtain
 * an opaque LiveConnectionTicket from their authenticated API and send it to
 * the existing `game:join` Socket.IO event.
 */
export * from './live';
export * from './live-timing';
export * from './clock-sync';
