'use client';

import { Target, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { mafiaRoleLabels, type MafiaRoleName } from '@/lib/mafia/rules';
import { mafiaRoleGuides } from '@/lib/mafia/guidance';
import { cn } from '@/lib/utils';

const PHASE_BADGE_CLASS: Record<string, string> = {
  LOBBY: 'mafia-phase-badge-lobby',
  NIGHT: 'mafia-phase-badge-night',
  DAY: 'mafia-phase-badge-day',
  VOTING: 'mafia-phase-badge-voting',
  FINISHED: 'mafia-phase-badge-finished',
};

export function MafiaRoleReveal({
  role,
  onRevealed,
}: {
  role: MafiaRoleName | null;
  onRevealed: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!role) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
  }, [role]);

  useEffect(() => {
    if (!revealed && role) {
      primaryButtonRef.current?.focus();
    }
  }, [revealed, role]);

  useEffect(() => {
    if (!role || revealed) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRevealed();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [role, revealed, onRevealed]);

  const handleReveal = () => {
    setAnimating(true);
    setTimeout(() => {
      setRevealed(true);
      setAnimating(false);
      onRevealed();
      previousFocusRef.current?.focus();
    }, 400);
  };

  if (!role) {
    return (
      <div className="mafia-reveal-overlay" role="status">
        <div className="mafia-reveal-warning">
          <p>بانتظار توزيع الأدوار من المضيف...</p>
        </div>
      </div>
    );
  }

  if (!revealed) {
    return (
      <div
        ref={dialogRef}
        className="mafia-reveal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="كشف الدور"
      >
        <div className={cn('mafia-reveal-warning', animating && 'mafia-reveal-warning-animating')}>
          <div className="mafia-reveal-shield" aria-hidden="true">
            <svg inline-size="3rem" block-size="3rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="mafia-reveal-warning-title">لا تدع أحدًا يرى شاشتك</h2>
          <p>دورك سري. تأكد من أنك بمفردك قبل الكشف عنه.</p>
          <Button ref={primaryButtonRef} size="lg" onClick={handleReveal} className="mafia-reveal-btn">
            <svg aria-hidden="true" inline-size="1.1rem" block-size="1.1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            اكشف دوري
          </Button>
        </div>
      </div>
    );
  }

  const guide = mafiaRoleGuides[role];
  const badgeClass = PHASE_BADGE_CLASS[role === 'KILLER' ? 'NIGHT' : 'DAY'] ?? 'mafia-phase-badge-lobby';

  return (
    <div
      ref={dialogRef}
      className="mafia-reveal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="بطاقة الدور"
    >
      <div className="mafia-reveal-warning">
        <div className="mafia-reveal-card-wrapper">
          <div className="mafia-reveal-card">
            <Badge className={badgeClass}>{mafiaRoleLabels[role]}</Badge>
            <h2>{mafiaRoleLabels[role]}</h2>
            <p className="mafia-reveal-card-quote">{`"${guide.identity}"`}</p>
            <div className="mafia-reveal-card-details">
              <div>
                <strong className="mafia-reveal-detail-label">
                  <Target aria-hidden="true" />
                  هدفك
                </strong>
                <p className="mafia-reveal-detail-text">{guide.objective}</p>
              </div>
              <div>
                <strong className="mafia-reveal-detail-label">
                  <EyeOff aria-hidden="true" />
                  حافظ على السر
                </strong>
                <p className="mafia-reveal-detail-text">{guide.privacy}</p>
              </div>
            </div>
          </div>
        </div>
        <Button size="lg" onClick={onRevealed} className="mafia-reveal-btn">
          فهمت دوري
        </Button>
      </div>
    </div>
  );
}
