'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './ladder-intro.module.css';

const INTRO_VIDEO = '/game-art/ladder/challenge-intro.mp4';

export interface LadderIntroProps {
  rightName: string;
  leftName: string;
  startedAt: number;
  endsAt: number;
  serverNow: number;
  active?: boolean;
}

/** Presentation only: the room snapshot, never media events, opens question one. */
export function LadderIntro({ rightName, leftName, startedAt, endsAt, serverNow, active = true }: LadderIntroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();
  const anchor = useRef({ serverNow, receivedAt: 0 });
  const [muted, setMuted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    anchor.current = { serverNow, receivedAt: Date.now() };
  }, [serverNow]);

  const elapsedSeconds = useCallback(() => {
    const now = anchor.current.serverNow + Date.now() - anchor.current.receivedAt;
    return Math.max(0, Math.min(now - startedAt, endsAt - startedAt) / 1000);
  }, [endsAt, startedAt]);

  const syncVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    const target = elapsedSeconds();
    // Late loads and reconnects join the shared presentation instead of replaying it.
    if (Math.abs(video.currentTime - target) > 0.6) video.currentTime = target;
    setElapsed(target);
  }, [active, elapsedSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || reducedMotion) return;
    let cancelled = false;
    syncVideo();
    const play = async () => {
      try {
        await video.play();
      } catch {
        if (cancelled) return;
        video.muted = true;
        setMuted(true);
        try { await video.play(); } catch { if (!cancelled) setUnavailable(true); }
      }
    };
    void play();
    const interval = window.setInterval(syncVideo, 250);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (!video.paused) video.pause();
    };
  }, [active, reducedMotion, syncVideo]);

  const toggleSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    syncVideo();
    try {
      await video.play();
      setUnavailable(false);
    } catch {
      video.muted = true;
      setMuted(true);
      setUnavailable(true);
    }
  };

  const staticPresentation = reducedMotion || unavailable;
  const namesVisible = staticPresentation || (elapsed >= 1.8 && elapsed < 8.9);

  return (
    <section className={styles.intro} hidden={!active} aria-label="بداية المواجهة" dir="rtl">
      <div className={styles.stage} data-static={staticPresentation || undefined}
        data-long-names={rightName.length > 18 || leftName.length > 18 || undefined}>
        <video
          ref={videoRef}
          className={styles.video}
          src={INTRO_VIDEO}
          preload="auto"
          playsInline
          muted={muted}
          aria-label="مقدمة مواجهة السلم"
          onLoadedMetadata={syncVideo}
          onEnded={() => setEnded(true)}
          onError={() => setUnavailable(true)}
        />
        {staticPresentation && <span className={styles.versus} aria-hidden="true">VS</span>}
        {active && <div className={styles.names} data-visible={namesVisible || undefined}>
          <strong className={styles.rightName}><bdi>{rightName}</bdi></strong>
          <strong className={styles.leftName}><bdi>{leftName}</bdi></strong>
        </div>}
      </div>
      <div className={styles.footer}>
        <p role="status">
          {unavailable ? 'تعذّر تشغيل المقدمة. تستمر المواجهة تلقائيًا عند بدء السؤال.' :
            ended ? 'بانتظار السؤال الأول…' : 'استعد للمواجهة — وقت الإجابة يبدأ مع السؤال.'}
        </p>
        {!reducedMotion && (
          <Button variant="outline" type="button" onClick={() => void toggleSound()} aria-pressed={muted} disabled={ended}>
            {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            {muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          </Button>
        )}
      </div>
    </section>
  );
}
