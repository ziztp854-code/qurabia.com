import type { PlanCode } from '@tahaddi/domain';

const SHIELD = 'M24 4 L40 9 V22 C40 33 33 40 24 44 C15 40 8 33 8 22 V9 Z';

/** شارة موحدة لمسار الرتبة الحالية داخل قاعة الأوسمة. */
export function RankCrest({ plan, className }: { plan: PlanCode; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={SHIELD} fill="currentColor" fillOpacity={0.06} strokeWidth={1.6} />

      {plan === 'SPECTATOR' && (
        <>
          <path d="M14 23 Q24 15 34 23 Q24 31 14 23 Z" strokeWidth={1.8} />
          <circle cx="24" cy="23" r="3.4" fill="currentColor" stroke="none" />
        </>
      )}

      {plan === 'KNIGHT' && (
        <>
          <path d="M15 33 L31 15" strokeWidth={2.2} />
          <path d="M33 33 L17 15" strokeWidth={2.2} />
          <path d="M12.5 30.5 L18.5 35.5" strokeWidth={2} />
          <path d="M35.5 30.5 L29.5 35.5" strokeWidth={2} />
          <circle cx="31" cy="15" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="15" r="1.5" fill="currentColor" stroke="none" />
        </>
      )}

      {plan === 'PRINCE' && (
        <>
          <path
            d="M13.5 31 L15 21 L20 26 L24 17 L28 26 L33 21 L34.5 31 Z"
            fill="currentColor"
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <path d="M13 34 H35" strokeWidth={2} />
          <circle cx="24" cy="17" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="21" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="33" cy="21" r="1.3" fill="currentColor" stroke="none" />
        </>
      )}

      {plan === 'SULTAN' && (
        <>
          <path
            d="M13 30 L14 20 L19 25 L24 16 L29 25 L34 20 L35 30 Z"
            fill="currentColor"
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <path d="M12 33 H36" strokeWidth={2} />
          <path
            d="M25 7 a4.5 4.5 0 1 0 0 9 a3.2 3.2 0 0 1 0 -9 Z"
            fill="currentColor"
            stroke="none"
          />
          <circle cx="24" cy="16" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="14" cy="20" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="34" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
