import { line } from 'd3-shape';
import { useId } from 'react';
import type { SparkTone } from '@/lib/profile/metrics';
import { sparkTrend, sparkTrendLabel } from '@/lib/profile/metrics';
import { formatNumber } from '@/lib/utils';
import styles from './command-profile.module.css';

const TONE_STROKE: Readonly<Record<SparkTone, string>> = {
  gold: '#e8c56b',
  azure: '#7ec8e3',
  ivory: '#f4efe4',
  muted: '#7a736c',
};

export function CommandSparkline({
  values,
  tone,
  label,
}: {
  values: readonly number[];
  tone: SparkTone;
  label: string;
}) {
  const descriptionId = useId();
  const width = 132;
  const height = 36;
  const padX = 4;
  const padY = 4;
  const series = values.length > 0 ? values : [0, 0];
  const trend = sparkTrend(series);
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = Math.max(max - min, 1);
  const step = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;

  const path = line<number>()
    .x((_, index) => padX + index * step)
    .y((value) => height - padY - ((value - min) / range) * (height - padY * 2))(series);

  return (
    <span dir="ltr" className={styles.sparklineWrap}>
      <svg
        className={styles.sparkline}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-describedby={descriptionId}
        aria-label={`${label}: مسار ${formatNumber(series.length)} أسابيع، الاتجاه ${sparkTrendLabel(trend)}`}
        preserveAspectRatio="none"
      >
        <desc id={descriptionId}>
          {`من الأقدم إلى الأحدث: ${series.map((value) => formatNumber(value)).join('، ')}`}
        </desc>
        <path
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          d={path ?? undefined}
        />
      </svg>
    </span>
  );
}
