'use client';

import dynamic from 'next/dynamic';
import styles from './model-viewer.module.css';

const loadViewer = () => import('./model-viewer').then((module) => module.ModelViewer);

function PreviewPlaceholder({ compact = false }: { compact?: boolean }) {
  // Reserve the real viewer's stage and margins before the deferred module loads.
  // Otherwise a native anchor on mobile is displaced when the preview expands.
  return (
    <section className={`${styles.viewer}${compact ? ` ${styles.compact}` : ''}`} aria-busy="true">
      <div className={styles.stage}>
        <div className={styles.loading} role="status">
          تهيئة عارض المجسمات…
        </div>
      </div>
    </section>
  );
}

const Viewer = dynamic(loadViewer, {
  ssr: false,
  loading: () => <PreviewPlaceholder />,
});
const CompactViewer = dynamic(loadViewer, {
  ssr: false,
  loading: () => <PreviewPlaceholder compact />,
});

export function ChallengeCardPreview({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <CompactViewer modelId="challenge-card" compact />
  ) : (
    <Viewer modelId="challenge-card" />
  );
}
