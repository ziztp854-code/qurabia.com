import { RealBadgeArtwork } from '@/components/community/realistic-art';
import type { PublicIdentity } from '@/lib/community/contracts';
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
  identity,
}: {
  name: string;
  badges?: VoiceAccountBadge[];
  showRankBadge?: boolean;
  showVerificationBadge?: boolean;
  identity?: PublicIdentity;
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
                <span aria-hidden="true">
                  <RealBadgeArtwork
                    badgeId={badge === 'owner' ? 'platform-founder' : badge === 'admin' || badge === 'verified' ? 'general-manager' : badge === 'sultan' ? 'royal-member' : badge === 'prince' ? 'diamond-member' : 'gold-member'}
                    name=""
                    className={styles.realBadge}
                  />
                </span>
              </span>
            );
          })}
        {identity?.primaryBadge && (
          <RealBadgeArtwork badgeId={identity.primaryBadge.id} assetUrl={identity.primaryBadge.assetUrl} name={identity.primaryBadge.name} className={styles.realBadge} />
        )}
      </span>
      {identity?.accountNumber != null && <small className={styles.accountNumber} dir="ltr">ID {identity.accountNumber}</small>}
    </span>
  );
}
