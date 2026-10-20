import type { EntranceTier } from '@/lib/community/contracts';

export type EntranceAnnouncement = {
  id: string;
  createdAt: number;
  name: string;
  avatarUrl: string | null;
  tier: EntranceTier;
  badge?: string | null;
  badgeId?: string | null;
  effectAssetUrl?: string | null;
  badgeAssetUrl?: string | null;
};

/** A bounded, session-scoped queue. Replayed heartbeats cannot replay an animation. */
export class EntranceQueue {
  private seen = new Set<string>();
  private pending: EntranceAnnouncement[] = [];
  private lastShown = 0;

  ingest(events: EntranceAnnouncement[], now: number, enabled: boolean) {
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (enabled && now - event.createdAt < 8000 && event.createdAt <= now + 2000) {
        this.pending.push(event);
      }
    }
    this.pending = enabled ? this.pending.slice(-3) : [];
    // Server entrance retention is short; cap dedup storage for long-running rooms.
    if (this.seen.size > 512) this.seen = new Set([...this.seen].slice(-256));
  }

  next(now: number): EntranceAnnouncement | null {
    this.pending = this.pending.filter((event) => now - event.createdAt < 8000);
    if (now - this.lastShown < 3000) return null;
    const next = this.pending.shift() ?? null;
    if (next) this.lastShown = now;
    return next;
  }

  clear() {
    this.pending = [];
  }
}
