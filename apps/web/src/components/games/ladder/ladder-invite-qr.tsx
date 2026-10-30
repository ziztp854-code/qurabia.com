'use client';

import QRCode from 'react-qr-code';
import styles from './ladder-invite-qr.module.css';

type LadderInviteQrProps = {
  inviteUrl: string;
  roomCode: string;
};

export function LadderInviteQr({ inviteUrl, roomCode }: LadderInviteQrProps) {
  return (
    <section className={styles.invite} aria-label="الدخول إلى غرفة السلم">
      <div className={styles.paper}>
        {inviteUrl ? (
          <QRCode
            aria-label={`رمز مسح للانضمام إلى غرفة السلم ${roomCode}`}
            bgColor="var(--qr-paper, #ffffff)"
            fgColor="var(--qr-ink, #111827)"
            level="M"
            role="img"
            size={176}
            style={{ backgroundColor: 'var(--qr-paper, #ffffff)' }}
            title={`امسح الرمز للانضمام إلى غرفة السلم ${roomCode}`}
            value={inviteUrl}
          />
        ) : (
          <span className={styles.loading} role="status">جارٍ تجهيز رمز الدخول</span>
        )}
      </div>
      <div className={styles.copy}>
        <strong>دعوة اللاعبين</strong>
        <span>امسح الرمز بكاميرا الجوال للانضمام</span>
      </div>
    </section>
  );
}
