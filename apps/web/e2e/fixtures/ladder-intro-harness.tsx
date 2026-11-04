// Presentation verification only. Buttons simulate authoritative room snapshots.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import '../../tokens.css';
import '../../src/app/globals.css';
import { LadderIntro } from '../../src/components/games/ladder/ladder-intro';

function Harness() {
  const query = new URLSearchParams(location.search);
  const [phase, setPhase] = useState<'waiting' | 'intro' | 'active'>('waiting');
  const [startedAt, setStartedAt] = useState(0);
  const [serverNow, setServerNow] = useState(0);
  const start = () => {
    const now = Date.now();
    setStartedAt(now - Number(query.get('elapsed') || 0));
    setServerNow(now);
    setPhase('intro');
  };
  return (
    <main style={{ maxWidth: 1100, margin: 'auto', padding: 12 }}>
      <h1>معاينة مقدمة السلم</h1>
      <p>اختبار محلي للعرض — حالة المباراة تجريبية</p>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={start}>ابدأ المقدمة التجريبية</button>
        <button onClick={() => setPhase('active')}>وصول السؤال من الخادم</button>
      </nav>
      {phase !== 'active' && (
        <LadderIntro
          active={phase === 'intro'}
          rightName={query.get('long') ? 'عبدالعزيز بن عبدالرحمن القحطاني' : 'عبدالعزيز'}
          leftName={query.get('long') ? 'خالد بن عبدالمحسن العبدالله' : 'خالد'}
          startedAt={startedAt}
          endsAt={startedAt + 9775}
          serverNow={serverNow}
        />
      )}
      {phase === 'active' && (
        <section aria-label="السؤال الأول">
          <h2>السؤال الأول</h2>
          <p>الوقت الكامل: ٢٠ ثانية</p>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
