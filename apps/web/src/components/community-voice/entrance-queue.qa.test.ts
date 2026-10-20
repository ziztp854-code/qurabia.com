import { describe, expect, it } from 'vitest';
import { EntranceQueue, type EntranceAnnouncement } from './entrance-queue';

const epoch = 1_800_000_000_000;
function entry(id: string, createdAt = epoch): EntranceAnnouncement {
  return { id, createdAt, name: 'ضيف', avatarUrl: null, tier: 'gold' };
}

describe('entrance queue independent QA', () => {
  it('does not replay a trusted entrance after reconnect or repeated heartbeats', () => {
    const queue = new EntranceQueue();
    queue.ingest([entry('join-1')], epoch, true);
    expect(queue.next(epoch)?.id).toBe('join-1');
    queue.ingest([entry('join-1')], epoch + 3_000, true);
    expect(queue.next(epoch + 3_000)).toBeNull();
  });

  it('records suppressed events so enabling effects cannot replay room history', () => {
    const queue = new EntranceQueue();
    queue.ingest([entry('old-join')], epoch, false);
    queue.ingest([entry('old-join'), entry('new-join', epoch + 1_000)], epoch + 1_000, true);
    expect(queue.next(epoch + 1_000)?.id).toBe('new-join');
    expect(queue.next(epoch + 4_000)).toBeNull();
  });

  it('drops stale history and implausibly future events', () => {
    const queue = new EntranceQueue();
    queue.ingest(
      [entry('stale', epoch - 8_001), entry('future', epoch + 2_001), entry('current')],
      epoch,
      true,
    );
    expect(queue.next(epoch)?.id).toBe('current');
    expect(queue.next(epoch + 3_000)).toBeNull();
  });

  it('limits an entry burst to three pending cards and spaces them three seconds apart', () => {
    const queue = new EntranceQueue();
    queue.ingest(
      Array.from({ length: 24 }, (_, n) => entry(`join-${n}`)),
      epoch,
      true,
    );
    expect(queue.next(epoch)?.id).toBe('join-21');
    expect(queue.next(epoch + 2_999)).toBeNull();
    expect(queue.next(epoch + 3_000)?.id).toBe('join-22');
    expect(queue.next(epoch + 6_000)?.id).toBe('join-23');
    expect(queue.next(epoch + 9_000)).toBeNull();
  });

  it('expires queued effects during stalls and clears pending cards on disable', () => {
    const queue = new EntranceQueue();
    queue.ingest([entry('expired-before-display')], epoch, true);
    expect(queue.next(epoch + 8_001)).toBeNull();
    queue.ingest([entry('disabled-before-display', epoch + 9_000)], epoch + 9_000, true);
    queue.ingest([], epoch + 9_001, false);
    expect(queue.next(epoch + 9_001)).toBeNull();
  });
});
