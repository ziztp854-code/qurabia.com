import { ArrowLeft, Headphones, Mic, Radio, Users } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import liveStyles from './live-home.module.css';

export function HomeLiveSection() {
  return (
    <section className={liveStyles.section} id="tahaddi-live" aria-labelledby="live-title">
      <div className={liveStyles.copy}>
        <span className={liveStyles.eyebrow}>
          <Radio aria-hidden="true" /> غرف صوتية حيّة
        </span>
        <h2 id="live-title">
          تحدي <span>لايف</span>
        </h2>
        <p className={liveStyles.promise}>هويتنا عربية.. صوت يجمعنا.</p>
        <p className={liveStyles.description}>
          مساحتك للحديث والتعارف ومشاركة اللحظة. استكشف الغرف الصوتية، انضم إلى الحوار، واجمع
          أصدقاءك في غرفة تحمل طابعك.
        </p>
        <div className={liveStyles.actions}>
          <ButtonLink href="/voice" variant="gold">
            <Headphones aria-hidden="true" /> ادخل تحدي لايف
            <ArrowLeft aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="/voice?view=mine" variant="outline">
            <Mic aria-hidden="true" /> غرفي الصوتية
          </ButtonLink>
        </div>
      </div>
      <div className={liveStyles.deck}>
        <div className={liveStyles.deckHeading}>
          <span>
            <Radio aria-hidden="true" /> لكل صوت مساحة، ولكل لقاء حكاية
          </span>
          <span className={liveStyles.wordmark} lang="en" dir="ltr">
            TAHADDI / LIVE
          </span>
        </div>
        <ul className={liveStyles.steps} aria-label="تجربة تحدي لايف">
          <li>
            <span className={liveStyles.stepIcon}>
              <Headphones aria-hidden="true" />
            </span>
            <div>
              <h3>اكتشف غرفتك</h3>
              <p>تصفّح الغرف واختر اللقاء الذي يناسب اهتماماتك.</p>
            </div>
          </li>
          <li>
            <span className={liveStyles.stepIcon}>
              <Users aria-hidden="true" />
            </span>
            <div>
              <h3>شارك الحوار</h3>
              <p>استمع، تحدّث، وتواصل مع مجتمع تحدي.</p>
            </div>
          </li>
          <li>
            <span className={liveStyles.stepIcon}>
              <Mic aria-hidden="true" />
            </span>
            <div>
              <h3>اجمع أصدقاءك</h3>
              <p>أنشئ غرفتك وشارك رابطها ليبدأ اللقاء.</p>
            </div>
          </li>
        </ul>
        <Link className={liveStyles.library} href="/voice?view=favorites">
          غرفك المفضلة <ArrowLeft aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
