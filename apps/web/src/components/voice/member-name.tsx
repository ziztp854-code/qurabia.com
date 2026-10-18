import { BadgeCheck, Crown, Shield, Gem } from 'lucide-react';
import type { VoiceAccountBadge } from '@/lib/voice/account-badges';
import styles from './member-name.module.css';
const labels: Record<VoiceAccountBadge, string> = {
  verified: 'حساب إدارة موثّق',
  owner: 'مالك المنصة',
  admin: 'إدارة المنصة',
  knight: 'باقة الفارس',
  prince: 'باقة الأمير',
  sultan: 'باقة السلطان',
};
export function MemberName({ name, badges = [] }: { name: string; badges?: VoiceAccountBadge[] }) {
  return (
    <span className={styles.name}>
      <bdi>{name}</bdi>
      {badges
        .filter((badge, index) => labels[badge] && badges.indexOf(badge) === index)
        .map((badge) => {
          const Icon =
            badge === 'verified'
              ? BadgeCheck
              : badge === 'owner' || badge === 'sultan'
                ? Crown
                : badge === 'admin'
                  ? Shield
                  : Gem;
          return (
            <span
              key={badge}
              className={badge === 'verified' ? styles.verified : styles.badge}
              role="img"
              aria-label={labels[badge]}
              title={labels[badge]}
            >
              <Icon size={15} aria-hidden="true" />
            </span>
          );
        })}
    </span>
  );
}
