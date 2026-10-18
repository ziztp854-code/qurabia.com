'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Headphones, Mic, Square } from 'lucide-react';
import styles from './voice-enhancements.module.css';

type MicState = 'idle' | 'starting' | 'listening' | 'heard' | 'quiet' | 'error';
type SpeakerState = 'idle' | 'playing' | 'played' | 'heard' | 'error';
type Props = {
  inputId: string;
  outputId: string;
  roomMicActive: boolean;
  getMicrophoneTrack: () => MediaStreamTrack | undefined;
};

/** Local diagnostics only. Never records, publishes, or changes the room microphone. */
export function SoundCheck(props: Props) {
  return (
    <SoundCheckSession
      key={`${props.inputId}:${props.outputId}:${props.roomMicActive}`}
      {...props}
    />
  );
}
function SoundCheckSession({ inputId, outputId, roomMicActive, getMicrophoneTrack }: Props) {
  const [mic, setMic] = useState<MicState>('idle');
  const [speaker, setSpeaker] = useState<SpeakerState>('idle');
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('');
  const [defaultOutput, setDefaultOutput] = useState(false);
  const generation = useRef(0);
  const resources = useRef<{
    context?: AudioContext;
    stream?: MediaStream;
    ownsStream?: boolean;
    source?: MediaStreamAudioSourceNode;
    analyser?: AnalyserNode;
    timer?: ReturnType<typeof setTimeout>;
    meter?: ReturnType<typeof setInterval>;
  }>({});
  const dispose = useCallback(() => {
    generation.current += 1;
    const current = resources.current;
    resources.current = {};
    clearTimeout(current.timer);
    clearInterval(current.meter);
    current.source?.disconnect();
    current.analyser?.disconnect();
    if (current.ownsStream) current.stream?.getTracks().forEach((track) => track.stop());
    if (current.context && current.context.state !== 'closed')
      void current.context.close().catch(() => {});
  }, []);
  const stop = useCallback(() => {
    dispose();
    setMic('idle');
    setSpeaker('idle');
    setLevel(0);
    setMessage('توقف فحص الصوت.');
  }, [dispose]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      dispose();
    };
  }, [dispose, stop]);
  async function testMicrophone() {
    dispose();
    const run = generation.current;
    setMic('starting');
    setSpeaker('idle');
    setLevel(0);
    setMessage('');
    let stream: MediaStream | undefined;
    let ownsStream = false;
    try {
      if (!window.AudioContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error('UNSUPPORTED');
      const liveTrack = getMicrophoneTrack();
      if (roomMicActive && liveTrack?.readyState === 'live' && liveTrack.enabled)
        stream = new MediaStream([liveTrack]);
      else {
        if (roomMicActive) throw new Error('MIC_STARTING');
        ownsStream = true;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: inputId === 'default' ? undefined : { exact: inputId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }
      if (run !== generation.current) {
        if (ownsStream) stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      resources.current = { context, stream, ownsStream };
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      const source = context.createMediaStreamSource(stream);
      resources.current = { context, stream, ownsStream, source, analyser };
      source.connect(analyser); // No connection to speakers: no feedback or broadcast.
      await context.resume();
      if (run !== generation.current) return;
      setMic('listening');
      const data = new Uint8Array(analyser.fftSize);
      let signalDetected = false;
      resources.current.meter = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(
          data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length,
        );
        signalDetected ||= rms > 0.015;
        setLevel(Math.min(100, Math.round(rms * 600)));
      }, 100);
      resources.current.timer = setTimeout(() => {
        dispose();
        setLevel(0);
        setMic(signalDetected ? 'heard' : 'quiet');
      }, 10_000);
    } catch (cause) {
      if (run !== generation.current) return;
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
      dispose();
      setMic('error');
      const error = cause as Error;
      setMessage(
        error.name === 'NotAllowedError'
          ? 'اسمح باستخدام الميكروفون من إعدادات الموقع ثم أعد الفحص.'
          : error.message === 'MIC_STARTING'
            ? 'الميكروفون قيد التشغيل في الغرفة. انتظر لحظة ثم أعد الفحص.'
            : 'تعذّر فحص الميكروفون. تحقق من توصيله واختيار الجهاز الصحيح.',
      );
    }
  }
  async function testSpeaker() {
    dispose();
    const run = generation.current;
    setMic('idle');
    setLevel(0);
    setSpeaker('playing');
    setMessage('');
    setDefaultOutput(false);
    try {
      const context = new AudioContext();
      resources.current.context = context;
      const routed = context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (outputId !== 'default') {
        if (routed.setSinkId) await routed.setSinkId(outputId);
        else setDefaultOutput(true);
      }
      await context.resume();
      if (run !== generation.current) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, context.currentTime);
      oscillator.frequency.setValueAtTime(659.25, context.currentTime + 0.35);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.03);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.8);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.85);
      resources.current.timer = setTimeout(() => {
        dispose();
        setSpeaker('played');
      }, 900);
    } catch {
      if (run !== generation.current) return;
      dispose();
      setSpeaker('error');
      setMessage('تعذّر تشغيل النغمة. تحقق من مستوى الصوت والسماعة ثم أعد الفحص.');
    }
  }
  const busy = mic === 'starting' || mic === 'listening' || speaker === 'playing';
  return (
    <details
      className={styles.check}
      onToggle={(event) => {
        if (!event.currentTarget.open) stop();
      }}
    >
      <summary>
        <AudioLines size={17} aria-hidden="true" /> فحص الصوت
      </summary>
      <div className={styles.checkPanel}>
        <header>
          <Headphones size={22} aria-hidden="true" />
          <div>
            <strong>خلّ صوتك واضحًا</strong>
            <p>
              {roomMicActive
                ? 'نقيس ميكروفونك المفتوح في الغرفة، دون تسجيل أو تغيير البث.'
                : 'فحص محلي لمدة ١٠ ثوانٍ، دون تسجيل أو إرسال صوت الاختبار.'}
            </p>
          </div>
        </header>
        <div className={styles.testActions}>
          <button type="button" disabled={busy} onClick={() => void testMicrophone()}>
            <Mic size={17} aria-hidden="true" />
            اختبار الميكروفون
          </button>
          <button type="button" disabled={busy} onClick={() => void testSpeaker()}>
            <Headphones size={17} aria-hidden="true" />
            تشغيل نغمة الاختبار
          </button>
          {busy && (
            <button type="button" onClick={stop}>
              <Square size={15} aria-hidden="true" />
              إيقاف الفحص
            </button>
          )}
        </div>
        <label className={styles.meter}>
          مستوى الميكروفون
          <meter min={0} max={100} value={level} aria-label="مستوى الميكروفون" />
        </label>
        <p role="status" aria-live="polite" className={styles.result}>
          {mic === 'starting'
            ? 'جارٍ فتح الميكروفون…'
            : mic === 'listening'
              ? 'تحدث الآن وراقب المؤشر.'
              : mic === 'heard'
                ? 'رُصد صوت من الميكروفون على هذا الجهاز.'
                : mic === 'quiet'
                  ? 'لم يُرصد صوت واضح. اقترب من الميكروفون وتحقق من الجهاز المختار.'
                  : speaker === 'playing'
                    ? 'تُشغّل الآن نغمة قصيرة.'
                    : speaker === 'played'
                      ? 'هل سمعت النغمة؟'
                      : speaker === 'heard'
                        ? 'أكدت سماع نغمة الاختبار.'
                        : 'ابدأ الفحص للتأكد من أجهزتك.'}
        </p>
        {speaker === 'played' && (
          <button type="button" onClick={() => setSpeaker('heard')}>
            <Check size={17} aria-hidden="true" />
            سمعت النغمة
          </button>
        )}
        {defaultOutput && <p>نغمة الاختبار تستخدم سماعة النظام الافتراضية في هذا المتصفح.</p>}
        {message && (
          <p role={mic === 'error' || speaker === 'error' ? 'alert' : 'status'}>{message}</p>
        )}
        <small>اتصال الغرفة منفصل عن هذا الفحص. للتأكد من وصول صوتك، جرّب الحديث مع عضو آخر.</small>
      </div>
    </details>
  );
}
