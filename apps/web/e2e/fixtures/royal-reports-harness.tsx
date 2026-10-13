import { useEffect, useState } from 'react';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { createRoot } from 'react-dom/client';
import { RoyalReportsCenter } from '../../src/components/kingdoms/royal-reports-center';
import type { WorldView } from '../../src/components/kingdoms/shared';
import '../../src/app/globals.css';
import './visual-excellence-fonts';
const result = await fetch('/api/kingdoms').then((r) => r.json());
function Harness() {
  const [view, setView] = useState(result.data as WorldView);
  useEffect(() => {
    const handler = (event: Event) => {
      const revision = (event as CustomEvent<number>).detail;
      if (Number.isSafeInteger(revision)) setView((old) => ({ ...old, revision }));
    };
    window.addEventListener('royal-reports-test-revision', handler);
    document.documentElement.dataset.royalSignals = 'ready';
    return () => window.removeEventListener('royal-reports-test-revision', handler);
  }, []);
  return (
    <ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
      <main style={{ maxWidth: 1440, margin: 'auto', padding: 'clamp(12px,3vw,40px)' }}>
        <RoyalReportsCenter
          view={view}
          locale={new URLSearchParams(location.search).get('locale') === 'en' ? 'en' : 'ar'}
        />
      </main>
    </ImageConfigContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
