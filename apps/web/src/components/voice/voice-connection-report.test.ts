import { describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';
import { formatNumber } from '@/lib/utils';
import { inspectVoiceConnection } from './voice-connection-report';

function fixture({
  active = false,
  playback = true,
  quality = 'excellent',
  stats,
}: {
  active?: boolean;
  playback?: boolean;
  quality?: string;
  stats?: () => Promise<RTCStatsReport | undefined>;
} = {}) {
  return {
    state: 'connected',
    canPlaybackAudio: playback,
    localParticipant: {
      connectionQuality: quality,
      getTrackPublication: () => ({
        isMuted: !active,
        track: { mediaStreamTrack: { readyState: 'live', enabled: active } },
      }),
    },
    remoteParticipants: new Map(
      stats
        ? [
            [
              'other',
              {
                audioTrackPublications: new Map([
                  ['track', { track: { getRTCStatsReport: stats } }],
                ]),
              },
            ],
          ]
        : [],
    ),
  } as unknown as Room;
}

describe('current LiveKit connection diagnostics', () => {
  it('reports a missing transport as failed, never as a successful sound test', async () => {
    expect(await inspectVoiceConnection(null, false)).toMatchObject([{ state: 'failed' }]);
  });
  it('treats listeners as listeners and reports blocked playback and unmeasured quality honestly', async () => {
    const rows = await inspectVoiceConnection(
      fixture({ playback: false, quality: 'unknown' }),
      false,
    );
    expect(rows.find((r) => r.label === 'تشغيل الصوت')?.state).toBe('warning');
    expect(rows.find((r) => r.label === 'الميكروفون')?.state).toBe('info');
    expect(rows.find((r) => r.label === 'جودة الشبكة')?.state).toBe('info');
    expect(rows.find((r) => r.label === 'الصوت الوارد')?.state).toBe('info');
  });
  it('warns about a missing publishing microphone and a poor network', async () => {
    const rows = await inspectVoiceConnection(fixture({ quality: 'poor' }), true);
    expect(rows.find((r) => r.label === 'الميكروفون')?.state).toBe('warning');
    expect(rows.find((r) => r.label === 'جودة الشبكة')?.state).toBe('warning');
  });
  it('reads received RTP statistics and flags significant loss without opening a second transport', async () => {
    const stats = vi.fn(
      async () =>
        new Map([
          [
            'audio',
            {
              type: 'inbound-rtp',
              kind: 'audio',
              packetsReceived: 90,
              packetsLost: 10,
              jitter: 0.12,
            },
          ],
        ]) as unknown as RTCStatsReport,
    );
    const rows = await inspectVoiceConnection(fixture({ active: true, stats }), true);
    expect(rows.find((r) => r.label === 'الميكروفون')?.state).toBe('passed');
    expect(rows.find((r) => r.label === 'الصوت الوارد')).toMatchObject({
      state: 'warning',
      detail: expect.stringContaining(
        formatNumber(10, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      ),
    });
    expect(stats).toHaveBeenCalledTimes(1);
  });
  it('never labels unavailable receiver statistics as a pass', async () => {
    const rows = await inspectVoiceConnection(
      fixture({
        stats: async () => {
          throw new Error('unavailable');
        },
      }),
      false,
    );
    expect(rows.find((r) => r.label === 'الصوت الوارد')?.state).toBe('info');
  });
});
