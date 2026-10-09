import type { BoundingBox, MapPayload } from '@mamluk/world-map-core';
import type { MapLibreAdapter, MapLibrePort } from './adapter';

/** Server query limit and the lower bound at which the host returns from the overview. */
export const VIEWPORT_OVERVIEW_ENTER_SPAN = 90;
export const VIEWPORT_OVERVIEW_EXIT_SPAN = 85;
export const VIEWPORT_DEFAULT_DEBOUNCE_MS = 150;
export const VIEWPORT_DEFAULT_REFRESH_MS = 5000;
/** A request that never settles must not stall the polling chain. */
export const VIEWPORT_DEFAULT_REQUEST_TIMEOUT_MS = 20000;
/** An expiry-triggered refresh yields to a request issued this recently. */
const FRESH_REQUEST_MS = 3000;

export class ViewportTimeoutError extends Error {
  constructor() {
    super('Viewport request timed out');
  }
}

export interface ViewportRetryPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Fraction of the delay randomised in both directions; 0 disables jitter. */
  readonly jitter: number;
}

/** Bounded exponential backoff: 1 s, 2 s, 4 s … never above 30 s, never a tight loop. */
export const VIEWPORT_DEFAULT_RETRY: ViewportRetryPolicy = Object.freeze({
  baseMs: 1000,
  maxMs: 30000,
  jitter: 0.25,
});

export function viewportRetryDelay(
  failures: number,
  policy: ViewportRetryPolicy = VIEWPORT_DEFAULT_RETRY,
  random: () => number = Math.random,
): number {
  const attempt = Math.max(0, Math.min(30, Math.floor(failures)));
  const exponential = Math.min(policy.maxMs, policy.baseMs * 2 ** attempt);
  const spread = Math.max(0, Math.min(1, policy.jitter));
  const factor = 1 - spread + 2 * spread * Math.min(1, Math.max(0, random()));
  return Math.max(policy.baseMs * (1 - spread), Math.min(policy.maxMs, exponential * factor));
}

interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Browser lifecycle sources; injectable so non-DOM hosts and tests stay deterministic. */
export interface ViewportLifecycle {
  readonly document?: (EventTargetLike & { readonly visibilityState?: string }) | undefined;
  readonly window?: EventTargetLike | undefined;
  readonly isOnline?: (() => boolean) | undefined;
}

export interface ViewportLoaderOptions {
  /** Implement with authenticated, no-store transport and runtime payload decoding. */
  readonly load: (bounds: BoundingBox, signal: AbortSignal) => Promise<MapPayload>;
  readonly now?: () => number;
  readonly debounceMs?: number;
  readonly refreshMs?: number;
  /** Request authoritative arrival/return state at the next visible own-route deadline. */
  readonly refreshAtArmyArrivals?: boolean;
  readonly requestTimeoutMs?: number;
  readonly maxLongitudeSpan?: number;
  readonly maxLatitudeSpan?: number;
  /** Span below which an active overview returns to local detail; defaults below the entry span. */
  readonly overviewExitSpan?: number;
  readonly onError?: (error: unknown) => void;
  /** Optional bounded public aggregation for viewports beyond private-query limits. */
  readonly loadOverview?: (bounds: BoundingBox, signal: AbortSignal) => Promise<boolean>;
  readonly retainOnError?: (error: unknown) => boolean;
  /** Return false for failures that backoff cannot fix (for example revoked access). */
  readonly shouldRetry?: (error: unknown) => boolean;
  readonly retry?: ViewportRetryPolicy;
  readonly random?: () => number;
  readonly lifecycle?: ViewportLifecycle;
}

/** Coordinates requests; cannot calculate game state or derive visibility. */
export class ViewportLoader {
  private request: AbortController | undefined;
  private requestStartedAt: number | undefined;
  private generation = 0;
  private disposed = false;
  private broad = false;
  private hasLocalSnapshot = false;
  private failures = 0;
  private snapshotServerTime: number | undefined;
  private snapshotReceivedAt = 0;
  private lastPayload: MapPayload | undefined;
  private authorizationDeadline = 0;
  private acceptedRevision: bigint | undefined;
  private pendingRevision: bigint | undefined;
  private pendingResync = false;
  private realtimeHealthy: boolean | undefined;
  private fallbackPolls = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;
  private readonly lifecycle: ViewportLifecycle;
  private readonly onMove = () => this.queue();
  private readonly onVisibility = () => {
    if (this.disposed) return;
    if (this.suspended()) this.suspend();
    else this.resume();
  };
  private readonly onOffline = () => {
    if (!this.disposed) this.suspend();
  };
  private readonly onOnline = () => {
    if (!this.disposed && !this.suspended()) this.resume();
  };

  constructor(
    private readonly map: Pick<MapLibrePort, 'on' | 'off'>,
    private readonly adapter: MapLibreAdapter,
    private readonly options: ViewportLoaderOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.lifecycle = options.lifecycle ?? {
      document: typeof document === 'undefined' ? undefined : document,
      window: typeof window === 'undefined' ? undefined : window,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    };
    map.on('moveend', this.onMove);
    this.lifecycle.document?.addEventListener('visibilitychange', this.onVisibility);
    this.lifecycle.window?.addEventListener('online', this.onOnline);
    this.lifecycle.window?.addEventListener('offline', this.onOffline);
  }

  /** True while the viewport is too broad for private detail, with hysteresis. */
  isBroad(bounds: BoundingBox = this.adapter.getViewportBounds()): boolean {
    return !this.fits(bounds, this.broad);
  }

  /** Always requests now; for explicit user or lifecycle triggers. */
  async refresh(): Promise<void> {
    if (this.disposed) return;
    const generation = this.invalidate();
    const minimumRevision = this.pendingRevision;
    this.pendingResync = false;
    const bounds = this.adapter.getViewportBounds();
    const request = new AbortController();
    this.request = request;
    const started = this.now();
    this.requestStartedAt = started;
    let timedOut = false;
    let succeeded = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, this.options.requestTimeoutMs ?? VIEWPORT_DEFAULT_REQUEST_TIMEOUT_MS);
    const aborted = new Promise<never>((_, reject) =>
      request.signal.addEventListener(
        'abort',
        () => reject(new Error('Viewport request aborted')),
        {
          once: true,
        },
      ),
    );
    aborted.catch(() => {});
    const superseded = () => this.disposed || generation !== this.generation;
    const settled = () => {
      if (superseded()) return false;
      if (request.signal.aborted) throw new ViewportTimeoutError();
      return true;
    };
    try {
      const local = this.fits(bounds, this.broad);
      this.broad = !local;
      if (!local) {
        this.lastPayload = undefined;
        if (this.options.loadOverview) {
          const accepted = await Promise.race([
            this.options.loadOverview(bounds, request.signal),
            aborted,
          ]);
          if (settled()) {
            // Detail is dropped once on entry; later overview polls leave the adapter alone.
            if (accepted && this.hasLocalSnapshot) {
              this.adapter.clear();
              this.hasLocalSnapshot = false;
            }
            if (this.pendingRevision === minimumRevision) this.pendingRevision = undefined;
            this.lastPayload = undefined;
            this.failures = 0;
            succeeded = true;
            this.arm(this.options.refreshMs ?? VIEWPORT_DEFAULT_REFRESH_MS);
          }
        } else {
          this.adapter.clear();
          this.hasLocalSnapshot = false;
          this.pendingRevision = undefined;
        }
        return;
      }
      const payload = await Promise.race([this.options.load(bounds, request.signal), aborted]);
      if (!settled()) return;
      if (!this.sameBounds(bounds, payload.bounds)) throw new Error('Payload viewport mismatch');
      const payloadRevision = BigInt(payload.revision);
      if (minimumRevision !== undefined && payloadRevision < minimumRevision)
        throw new Error('Viewport revision has not caught up');
      const deliveryAge = Math.max(0, this.now() - started);
      this.adapter.render(payload, deliveryAge);
      this.acceptedRevision =
        this.acceptedRevision === undefined || payloadRevision > this.acceptedRevision
          ? payloadRevision
          : this.acceptedRevision;
      if (this.pendingRevision !== undefined && payloadRevision >= this.pendingRevision)
        this.pendingRevision = undefined;
      this.lastPayload = payload;
      const issuedDeadline = this.now() + payload.expiresAt - payload.serverTime - deliveryAge;
      this.authorizationDeadline =
        payload.serverTime === this.snapshotServerTime
          ? Math.min(this.authorizationDeadline, issuedDeadline)
          : issuedDeadline;
      this.hasLocalSnapshot = true;
      this.failures = 0;
      succeeded = true;
      this.arm(this.refreshDelay(payload));
      if (this.realtimeHealthy === false) this.fallbackPolls = Math.min(3, this.fallbackPolls + 1);
    } catch (caught: unknown) {
      if (superseded() || (request.signal.aborted && !timedOut)) return;
      this.fallbackPolls = 0;
      const error = timedOut ? new ViewportTimeoutError() : caught;
      if (!this.options.retainOnError?.(error)) {
        this.adapter.clear();
        this.hasLocalSnapshot = false;
        this.lastPayload = undefined;
      }
      this.options.onError?.(error);
      if (superseded()) return;
      if (this.options.shouldRetry?.(error) ?? true) {
        const delay = viewportRetryDelay(
          this.failures,
          this.options.retry ?? VIEWPORT_DEFAULT_RETRY,
          this.options.random,
        );
        this.failures += 1;
        this.arm(delay);
      }
    } finally {
      clearTimeout(timeout);
      if (this.request === request) {
        this.requestStartedAt = undefined;
        this.request = undefined;
      }
      if (
        !superseded() &&
        succeeded &&
        this.failures === 0 &&
        !this.suspended() &&
        (this.pendingRevision !== undefined || this.pendingResync)
      )
        void this.refresh();
    }
  }

  /**
   * For passive triggers (expiry, revision events): skipped while hidden or offline, since the
   * resume path catches up, and while a just-issued request is still expected to deliver.
   */
  requestRefresh(): void {
    if (this.disposed || this.suspended()) return;
    if (
      this.requestStartedAt !== undefined &&
      this.now() - this.requestStartedAt < FRESH_REQUEST_MS
    )
      return;
    void this.refresh();
  }

  get currentRevision(): string | undefined {
    return this.acceptedRevision?.toString();
  }

  /** Coalesces notifications during a fetch; only the maximum demanded revision is retained. */
  requestRevision(revision?: number): void {
    if (this.disposed) return;
    if (revision === undefined) this.pendingResync = true;
    else {
      if (!Number.isSafeInteger(revision) || revision < 0) return;
      const incoming = BigInt(revision);
      if (this.acceptedRevision !== undefined && incoming <= this.acceptedRevision) return;
      if (this.pendingRevision === undefined || incoming > this.pendingRevision)
        this.pendingRevision = incoming;
    }
    if (
      this.suspended() ||
      this.requestStartedAt !== undefined ||
      (this.failures > 0 && this.refreshTimer !== undefined)
    )
      return;
    void this.refresh();
  }

  /** Channel health is useful only together with a currently authorized API snapshot. */
  setRealtimeHealth(healthy: boolean): void {
    if (this.disposed || this.realtimeHealthy === healthy) return;
    this.realtimeHealthy = healthy;
    this.fallbackPolls = 0;
    if (this.failures > 0 || this.requestStartedAt !== undefined || !this.lastPayload) return;
    this.arm(this.refreshDelay(this.lastPayload));
  }
  dispose(): void {
    if (this.disposed) return;
    this.invalidate();
    this.lastPayload = undefined;
    this.pendingRevision = undefined;
    this.pendingResync = false;
    this.adapter.clear();
    this.map.off('moveend', this.onMove);
    this.lifecycle.document?.removeEventListener('visibilitychange', this.onVisibility);
    this.lifecycle.window?.removeEventListener('online', this.onOnline);
    this.lifecycle.window?.removeEventListener('offline', this.onOffline);
    this.disposed = true;
  }

  private suspended(): boolean {
    return (
      this.lifecycle.document?.visibilityState === 'hidden' || this.lifecycle.isOnline?.() === false
    );
  }

  /** Stops timers only: the accepted snapshot and any in-flight response stay usable. */
  private suspend(): void {
    clearTimeout(this.debounce);
    clearTimeout(this.refreshTimer);
    this.debounce = undefined;
    this.refreshTimer = undefined;
  }

  private resume(): void {
    this.failures = 0;
    this.fallbackPolls = 0;
    void this.refresh();
  }

  private refreshDelay(payload: MapPayload): number | undefined {
    const polling = this.options.refreshMs ?? VIEWPORT_DEFAULT_REFRESH_MS;
    const authorization = Math.max(1, this.authorizationDeadline - this.now());
    const live =
      this.realtimeHealthy === true &&
      this.hasLocalSnapshot &&
      this.authorizationDeadline > this.now();
    const fallback =
      this.realtimeHealthy === false ? Math.min(30000, polling * 2 ** this.fallbackPolls) : polling;
    let delay = live
      ? authorization
      : this.realtimeHealthy === false
        ? Math.min(fallback, authorization)
        : polling;
    if (payload.serverTime !== this.snapshotServerTime) {
      this.snapshotServerTime = payload.serverTime;
      this.snapshotReceivedAt = this.now();
    }
    if (!this.options.refreshAtArmyArrivals) return delay;
    const serverNow = payload.serverTime + Math.max(0, this.now() - this.snapshotReceivedAt);
    const ownIds = new Set(
      payload.layers.armies.features
        .filter((army) => army.properties.own === true)
        .map((army) => army.id),
    );

    for (const route of payload.layers.armyRoutes.features) {
      if (!ownIds.has(route.properties.armyId as string)) continue;
      const arrival = route.properties.arrivalTime;
      if (typeof arrival !== 'number' || !Number.isFinite(arrival) || arrival <= serverNow)
        continue;
      delay = Math.min(delay, Math.max(1, arrival - serverNow));
    }
    return delay;
  }
  private arm(delay: number | undefined): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    if (this.suspended() || delay === undefined) return;
    this.refreshTimer = setTimeout(() => void this.refresh(), delay);
  }

  private queue(): void {
    this.invalidate();
    this.debounce = setTimeout(
      () => void this.refresh(),
      this.options.debounceMs ?? VIEWPORT_DEFAULT_DEBOUNCE_MS,
    );
  }

  private invalidate(): number {
    this.generation += 1;
    this.request?.abort();
    clearTimeout(this.debounce);
    clearTimeout(this.refreshTimer);
    return this.generation;
  }

  /** Entering the overview needs the full limit; leaving it needs a smaller span. */
  private fits(bounds: BoundingBox, overviewActive: boolean): boolean {
    const width =
      bounds.east > bounds.west ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
    const height = bounds.north - bounds.south;
    const enterLongitude = this.options.maxLongitudeSpan ?? VIEWPORT_OVERVIEW_ENTER_SPAN;
    const enterLatitude = this.options.maxLatitudeSpan ?? VIEWPORT_OVERVIEW_ENTER_SPAN;
    const exit = this.options.overviewExitSpan ?? VIEWPORT_OVERVIEW_EXIT_SPAN;
    const longitude = overviewActive ? Math.min(exit, enterLongitude) : enterLongitude;
    const latitude = overviewActive ? Math.min(exit, enterLatitude) : enterLatitude;
    return width > 0 && width <= longitude && height > 0 && height <= latitude;
  }

  private sameBounds(left: BoundingBox, right: BoundingBox): boolean {
    return (
      left.west === right.west &&
      left.east === right.east &&
      left.south === right.south &&
      left.north === right.north
    );
  }
}
