'use client';

import dynamic from 'next/dynamic';

const Viewer = dynamic(() => import('./model-viewer').then((module) => module.ModelViewer), {
  ssr: false,
  loading: () => <p role="status">تهيئة عارض المجسمات…</p>,
});

export function ChallengeCardPreview({ compact = false }: { compact?: boolean }) {
  return <Viewer modelId="challenge-card" compact={compact} />;
}
