import { useId } from 'react';
import Image from 'next/image';
import styles from './intelligence-test.module.css';

function GoldGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2=".6" gradientUnits="objectBoundingBox">
      <stop stopColor="var(--report-metal-dark)" />
      <stop offset=".18" stopColor="var(--report-metal)" />
      <stop offset=".38" stopColor="var(--report-metal-light)" />
      <stop offset=".55" stopColor="var(--report-metal)" />
      <stop offset=".77" stopColor="var(--report-metal-dark)" />
      <stop offset="1" stopColor="var(--report-metal-light)" />
    </linearGradient>
  );
}

export function ReportHeroArtwork() {
  return (
    <Image
      className={styles.reportHeroArtwork}
      src="/game-art/intelligence-test/report-hero.webp"
      width={2172}
      height={724}
      alt=""
      loading="eager"
      unoptimized
    />
  );
}

export function ReportMedal() {
  const id = `report-medal-${useId().replaceAll(':', '')}`;
  return (
    <svg className={styles.medalArtwork} viewBox="0 0 220 230" fill="none" aria-hidden="true">
      <defs>
        <GoldGradient id={id} />
        <radialGradient id={`${id}-face`}>
          <stop stopColor="var(--report-paper)" />
          <stop offset=".8" stopColor="var(--report-ivory)" />
          <stop offset="1" stopColor="var(--report-metal-light)" />
        </radialGradient>
      </defs>
      <path
        d="M58 44C-5 90 8 179 80 209M162 44C225 90 212 179 140 209"
        stroke={`url(#${id})`}
        strokeWidth="2"
      />
      {[0, 1].map((side) => (
        <g key={side} transform={side ? 'translate(220 0) scale(-1 1)' : undefined}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const a = ((215 - i * 13) * Math.PI) / 180;
            const x = 110 + 91 * Math.cos(a),
              y = 117 + 91 * Math.sin(a);
            return (
              <g key={i} transform={`translate(${x} ${y}) rotate(${i * 13 - 55})`}>
                <path d="M0 0C-18-4-22-18-19-27C-5-24 1-13 0 0Z" fill={`url(#${id})`} />
                <path d="M0 0C8-14 20-16 25-12C20-2 12 2 0 0Z" fill={`url(#${id})`} />
              </g>
            );
          })}
        </g>
      ))}
      <circle
        cx="110"
        cy="117"
        r="75"
        fill={`url(#${id})`}
        stroke="var(--report-metal-dark)"
        strokeWidth="1"
      />
      <circle cx="110" cy="117" r="69" stroke="var(--report-metal-light)" strokeWidth="2" />
      <circle
        cx="110"
        cy="117"
        r="62"
        fill={`url(#${id}-face)`}
        stroke="var(--report-metal-dark)"
        strokeWidth="2"
      />
      <path
        d="M89 18L96 39H124L131 18 117 28 110 9 103 28Z"
        fill={`url(#${id})`}
        stroke="var(--report-metal-dark)"
        strokeWidth="1"
      />
      <path d="M74 213Q110 192 146 213" stroke={`url(#${id})`} strokeWidth="4" />
    </svg>
  );
}

export function ReportFooterArtwork() {
  const id = `report-ribbon-${useId().replaceAll(':', '')}`;
  return (
    <svg
      className={styles.reportFooterArtwork}
      viewBox="0 0 1000 130"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <GoldGradient id={id} />
      </defs>
      <path
        d="M0 3C168 91 252-15 489 83C700 137 827-14 1000 8V68C825 38 700 147 489 106C253 20 168 113 0 63Z"
        fill={`url(#${id})`}
      />
      <path
        d="M0 26C168 113 252 3 489 97C700 151 827 4 1000 28V54C825 23 700 148 489 114C253 27 168 133 0 78Z"
        fill="var(--report-navy)"
      />
      <path
        d="M0 30C168 117 252 7 489 101C700 155 827 8 1000 32"
        stroke="var(--report-metal-light)"
        strokeWidth="2"
      />
      <path
        d="M0 92C168 138 252 53 489 124C700 164 827 46 1000 77V130H0Z"
        fill="var(--report-ivory)"
      />
    </svg>
  );
}
