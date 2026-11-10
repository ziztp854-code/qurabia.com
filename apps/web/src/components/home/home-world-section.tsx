import { ArrowLeft, Castle, Globe2 } from 'lucide-react';
import Image from 'next/image';
import { ButtonLink } from '@/components/ui';
import styles from './prestige-home.module.css';
import worldStyles from './mamluk-home.module.css';

export function HomeWorldSection() {
  return (
    <section
      className={worldStyles.section}
      id="mamluk-world"
      aria-labelledby="mamluk-title"
      data-scroll-reveal
    >
      <div className={styles.sectionHead}>
        <span aria-hidden="true" />
        <h2 id="mamluk-title">عالم المماليك</h2>
        <span aria-hidden="true" />
      </div>
      <figure className={worldStyles.world}>
        <div className={worldStyles.art}>
          <Image
            src="/game-art/kingdoms/village-oasis.webp"
            alt="قرية محصّنة بقصور وقباب وسط النخيل والأنهار في عالم المماليك"
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1440px) 58vw, 835px"
          />
        </div>
        <figcaption className={worldStyles.copy}>
          <span className={worldStyles.eyebrow}>
            <Castle aria-hidden="true" />
            من قريتك تبدأ الحكاية
          </span>
          <h3>
            ابنِ مملكتك،
            <br />
            واكتب تاريخك
          </h3>
          <p>طوّر قريتك، كوّن تحالفك، واستكشف خريطة العالم. كل قرار يرسم مستقبل مملكتك.</p>
          <ul className={worldStyles.features} aria-label="مزايا عالم المماليك">
            <li>بناء وتطوير</li>
            <li>تحالفات ومعارك</li>
            <li>خريطة عالم</li>
          </ul>
          <div className={worldStyles.actions}>
            <ButtonLink href="/games/kingdoms" variant="gold">
              ادخل عالم المماليك
              <ArrowLeft aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/games/kingdoms/world-map" variant="outline">
              <Globe2 aria-hidden="true" />
              استكشف خريطة العالم
            </ButtonLink>
          </div>
        </figcaption>
      </figure>
    </section>
  );
}
