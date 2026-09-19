import Image from 'next/image';
import { SiteLayout } from '@/components/layout';
import { getCurrentSession } from '@/lib/auth/session';
import { buildPublicPageMetadata } from '@/lib/metadata/site';
import styles from './dedication.module.css';

export const metadata = buildPublicPageMetadata({
  path: '/dedication',
  title: 'إهداء إلى أميرة | تحدّي',
  description: 'إهداء خاص إلى أميرة، تقديرًا لتشجيعها ودورها في استمرار فكرة تحدّي وتطورها.',
});

export default async function DedicationPage() {
  const session = await getCurrentSession().catch(() => null);

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <div className={styles.page}>
        <section className={styles.dedication} aria-label="إهداء إلى أميرة">
          <div className={styles.dedicationCopy}>
            <p className={styles.sectionLabel}>إهداء إلى</p>
            <h1>أميرة</h1>
            <div className={styles.intro}>
              <p>تقديرًا لما قدمته من تشجيع وتحفيز،</p>
              <p>كان له أثر في استمرار الفكرة وتطورها.</p>
            </div>
            <div className={styles.message}>
              <h2>تحدي، فكرة بدأت بطموح</h2>
              <p>واستمرت بدعمٍ صنع الفرق.</p>
              <p>إلى أميرة، شكرًا لأنك كنتِ جزءًا من البداية.</p>
            </div>
          </div>

          <div className={styles.dedicationVisual}>
            <Image
              src="/og.png"
              alt="إهداء تحدّي إلى أميرة"
              width={1200}
              height={630}
              sizes="(max-width: 52rem) calc(100vw - 2rem), 32rem"
              loading="eager"
              className={styles.dedicationMark}
            />
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
