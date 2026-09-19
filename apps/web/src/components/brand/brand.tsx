import { useId } from 'react';
import { cn } from '@/lib/utils';

export function BrandMark({
  className,
  title,
  tone = 'gold',
}: {
  className?: string;
  title?: string;
  tone?: 'gold' | 'light' | 'dark';
}) {
  const gradientId = useId().replaceAll(':', '');
  const labelled = Boolean(title);

  return (
    <svg
      className={cn('brand-mark', className)}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : undefined}
      aria-label={title}
      aria-hidden={labelled ? undefined : 'true'}
    >
      <defs>
        <linearGradient id={gradientId} x1="18" y1="14" x2="105" y2="91">
          <stop stopColor="#F3D58B" />
          <stop offset="0.52" stopColor="#D4AF37" />
          <stop offset="1" stopColor="#96651D" />
        </linearGradient>
      </defs>
      <path
        d="M9 39 39 57 60 10 81 57 111 39 93 88H27L9 39Z"
        stroke={tone === 'gold' ? `url(#${gradientId})` : 'currentColor'}
        strokeWidth="7"
        strokeLinejoin="miter"
      />
      <path
        d="m39 57-12 31m54-31 12 31M60 10v78M9 39l51 49 51-49"
        stroke={tone === 'gold' ? `url(#${gradientId})` : 'currentColor'}
        strokeWidth="5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  variant = 'horizontal',
  tone = 'dark',
}: {
  className?: string;
  variant?: 'horizontal' | 'stacked';
  tone?: 'dark' | 'light';
}) {
  return (
    <span className={cn('brand-logo', `brand-logo-${variant}`, `brand-logo-${tone}`, className)}>
      <BrandMark tone="gold" />
      <span className="brand-logo-copy">
        <strong>تحدي</strong>
        <small>تفاعل، تنافس، تميّز</small>
      </span>
    </span>
  );
}

export function BrandBadge({ className }: { className?: string }) {
  return (
    <span className={cn('brand-badge', className)} aria-hidden="true">
      <span className="brand-badge-ring" />
      <BrandMark tone="gold" />
    </span>
  );
}
