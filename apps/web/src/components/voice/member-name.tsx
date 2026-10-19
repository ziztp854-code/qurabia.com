import Image from 'next/image';
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
export function MemberName({
  name,
  badges = [],
  showRankBadge = true,
  showVerificationBadge = true,
}: {
  name: string;
  badges?: VoiceAccountBadge[];
  showRankBadge?: boolean;
  showVerificationBadge?: boolean;
}) {
  return (
    <span className={styles.name}>
      <bdi>{name}</bdi>
      <span className={styles.credentials}>
        {badges
          .filter(
            (badge, index) =>
              labels[badge] &&
              (showRankBadge || badge === 'verified') &&
              (showVerificationBadge || badge !== 'verified') &&
              badges.indexOf(badge) === index &&
              (badge !== 'verified' || badges.includes('owner') || badges.includes('admin')),
          )
          .map((badge) => {
            const Icon =
              badge === 'verified'
                ? BadgeCheck
                : badge === 'sultan'
                  ? Crown
                  : badge === 'admin'
                    ? Shield
                    : Gem;
            return (
              <span
                key={badge}
                className={badge === 'verified' ? styles.verified : styles.badge}
                role="img"
                aria-label={
                  badge === 'verified' && badges.includes('owner')
                    ? 'مالك المنصة موثّق'
                    : labels[badge]
                }
                title={
                  badge === 'verified' && badges.includes('owner')
                    ? 'مالك المنصة موثّق'
                    : labels[badge]
                }
              >
                {badge === 'owner' ? (
                  <Image
                    src="/ranks/crown-owner.png"
                    width={28}
                    height={28}
                    className={styles.ownerCrown}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <Icon size={15} aria-hidden="true" />
                )}
              </span>
            );
          })}
      </span>
    </span>
  );
}
