import { Track, type Room } from 'livekit-client';
import { formatNumber } from '@/lib/utils';

export type VoiceCheckRow = {
  label: string;
  state: 'passed' | 'warning' | 'failed' | 'info';
  detail: string;
};

type AudioStats = {
  type: string;
  kind?: string;
  mediaType?: string;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
};

/** Inspect the current SDK transport. No new participant, microphone capture or recording. */
export async function inspectVoiceConnection(room: Room | null, microphoneExpected: boolean) {
  const connected = room?.state === 'connected';
  const rows: VoiceCheckRow[] = [
    {
      label: 'اتصال الغرفة',
      state: connected ? 'passed' : 'failed',
      detail: connected ? 'اتصال الصوت قائم الآن.' : 'الصوت غير متصل. أعد الاتصال ثم كرر الفحص.',
    },
  ];
  if (!room || !connected) return rows;
  rows.push({
    label: 'تشغيل الصوت',
    state: room.canPlaybackAudio ? 'passed' : 'warning',
    detail: room.canPlaybackAudio
      ? 'المتصفح يسمح بتشغيل الصوت.'
      : 'اضغط تفعيل الاستماع للسماح بتشغيل الصوت.',
  });
  const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  const track = mic?.track?.mediaStreamTrack;
  const active = track?.readyState === 'live' && track.enabled && !mic?.isMuted;
  rows.push({
    label: 'الميكروفون',
    state: microphoneExpected ? (active ? 'passed' : 'warning') : 'info',
    detail: microphoneExpected
      ? active
        ? 'الميكروفون يعمل في الجلسة الحالية.'
        : 'لم يصبح الميكروفون جاهزًا. تحقق من الإذن والجهاز المختار.'
      : 'الميكروفون مكتوم أو أنت مستمع. يمكنك إجراء الفحص المحلي أدناه.',
  });
  const quality = room.localParticipant.connectionQuality;
  rows.push({
    label: 'جودة الشبكة',
    state:
      quality === 'excellent' || quality === 'good'
        ? 'passed'
        : quality === 'poor' || quality === 'lost'
          ? 'warning'
          : 'info',
    detail:
      quality === 'excellent'
        ? 'ممتازة وفق قياس LiveKit.'
        : quality === 'good'
          ? 'جيدة وفق قياس LiveKit.'
          : quality === 'poor' || quality === 'lost'
            ? 'الاتصال ضعيف. جرّب شبكة أكثر استقرارًا.'
            : 'لم تتوفر عينة كافية لقياس الجودة بعد.',
  });
  const audioTracks = [...room.remoteParticipants.values()]
    .flatMap((p) =>
      [...p.audioTrackPublications.values()].flatMap((publication) =>
        publication.track ? [publication.track] : [],
      ),
    )
    .slice(0, 4);
  if (!audioTracks.length) {
    rows.push({
      label: 'الصوت الوارد',
      state: 'info',
      detail: 'انتظر عضوًا يتحدث لقياس استقبال الصوت.',
    });
    return rows;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reports = await Promise.race([
      Promise.all(audioTracks.map((track) => track.getRTCStatsReport())),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 2000);
      }),
    ]);
    let received = 0,
      lost = 0,
      jitter = 0;
    reports?.forEach((report) =>
      report?.forEach((value: AudioStats) => {
        if (value.type !== 'inbound-rtp' || (value.kind ?? value.mediaType) !== 'audio') return;
        received += Math.max(0, value.packetsReceived ?? 0);
        lost += Math.max(0, value.packetsLost ?? 0);
        jitter = Math.max(jitter, value.jitter ?? 0);
      }),
    );
    const loss = received + lost ? (lost / (received + lost)) * 100 : 0;
    rows.push({
      label: 'الصوت الوارد',
      state: !received ? 'info' : loss > 5 || jitter > 0.1 ? 'warning' : 'passed',
      detail: received
        ? `فقد الحزم التراكمي ${formatNumber(loss, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}٪، وتذبذب الوصول ${formatNumber(Math.round(jitter * 1000))} مللي ثانية، لعينة من المتحدثين.`
        : 'لم تصل حزم صوت قابلة للقياس بعد. أعد الفحص أثناء حديث عضو آخر.',
    });
  } catch {
    rows.push({
      label: 'الصوت الوارد',
      state: 'info',
      detail: 'تعذر قراءة إحصاءات الصوت. أعد الفحص بعد لحظات.',
    });
  } finally {
    clearTimeout(timer);
  }
  return rows;
}
