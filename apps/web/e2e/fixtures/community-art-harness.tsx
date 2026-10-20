// Local-only crop inspection for actual shared photographic artwork.
import {
  REAL_BADGE_IDS,
  RealBadgeArtwork,
  RealFrameArtwork,
} from '../../src/components/community/realistic-art';
import type { EntranceTier } from '../../src/lib/community/contracts';
import { EntranceEffectPreview } from '../../src/components/voice/entrance-effect';

export function CommunityArtHarness() {
  const tiers: EntranceTier[] = ['ordinary', 'silver', 'gold', 'diamond', 'royal', 'legend'];
  return (
    <section>
      <h1>فحص صور الشارات والإطارات</h1>
      <p>صور فعلية عند 32 و64 و112 بكسل؛ ليست رتبًا ممنوحة لحساب العرض.</p>
      <style>{'.qa-art-sample > span{inline-size:100%;block-size:100%}'}</style>
      <h2>الشارات</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
          gap: 16,
        }}
      >
        {REAL_BADGE_IDS.map((id) => (
          <article
            key={id}
            style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 12 }}
          >
            <p dir="ltr">{id}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {[32, 64, 112].map((size) => (
                <div
                  key={size}
                  className="qa-art-sample"
                  style={{ inlineSize: size, blockSize: size }}
                >
                  <RealBadgeArtwork badgeId={id} name={`${id} ${size}`} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <h2>الإطارات</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
          gap: 16,
        }}
      >
        {tiers.map((tier) => (
          <article
            key={tier}
            style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 12 }}
          >
            <p>{tier}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {[32, 64, 112].map((size) => (
                <div
                  key={size}
                  className="qa-art-sample"
                  style={{ inlineSize: size, blockSize: size }}
                >
                  <RealFrameArtwork tier={tier} name={`${tier} ${size}`} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <h2>تأثيرات الدخول الستة</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 320px),1fr))',
          gap: 16,
        }}
      >
        {tiers.map((tier) => (
          <article
            key={`entrance-${tier}`}
            style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 12 }}
          >
            <p>{tier}</p>
            <EntranceEffectPreview tier={tier} name="معاينة الدخول" subdued />
          </article>
        ))}
      </div>
    </section>
  );
}
