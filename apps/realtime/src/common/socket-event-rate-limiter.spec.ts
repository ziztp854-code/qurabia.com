import { SocketEventRateLimiter } from './socket-event-rate-limiter.js';

describe('SocketEventRateLimiter', () => {
  it('bounds stored buckets and frees expired entries', () => {
    const limiter = new SocketEventRateLimiter(2);

    expect(limiter.consume('first', 1, 1_000, 0)).toBe(true);
    expect(limiter.consume('second', 1, 1_000, 0)).toBe(true);
    expect(limiter.consume('third', 1, 1_000, 0)).toBe(false);
    expect(limiter.consume('third', 1, 1_000, 1_001)).toBe(true);
  });
});
