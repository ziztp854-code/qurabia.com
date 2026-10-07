import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import '../../tokens.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AbandonedVillagePreview,
  type AbandonedPreviewData,
} from '../../src/components/kingdoms/abandoned/AbandonedVillagePreview';
import type { AbandonedBasemap } from '../../src/components/kingdoms/abandoned/AbandonedVillageMap';
import type { KingdomsCommand } from '../../src/lib/kingdoms/commands';
import './abandoned-village-harness.css';
import './abandoned-map-probe';

async function read<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'تعذر تحميل عالم المعاينة');
  return result as T;
}
function Harness() {
  const [worldId, setWorldId] = useState('preview_abandoned_alpha'),
    [data, setData] = useState<AbandonedPreviewData | null>(null);
  const [basemap, setBasemap] = useState<AbandonedBasemap | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await read<AbandonedPreviewData>(
        await fetch(`/api/abandoned-preview/world?worldId=${worldId}`, { signal }),
      );
      setData(result);
    },
    [worldId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      load(controller.signal),
      fetch('/api/abandoned-preview/basemap', { signal: controller.signal })
        .then(read<AbandonedBasemap>)
        .then(setBasemap),
    ]).catch((err) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'تعذر التحميل');
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      void load().catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);
  async function command(command: KingdomsCommand) {
    setBusy(true);
    try {
      const result = await read<AbandonedPreviewData>(
        await fetch('/api/abandoned-preview/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldId, key: crypto.randomUUID(), command }),
        }),
      );
      setData(result);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
      <nav className="preview-toolbar" aria-label="عوالم الاختبار">
        <label>
          العالم{' '}
          <select
            aria-label="عالم الاختبار"
            value={worldId}
            onChange={(event) => {
              setData(null);
              setError('');
              setWorldId(event.target.value);
            }}
            disabled={busy}
          >
            <option value="preview_abandoned_alpha">عالم النيل</option>
            <option value="preview_abandoned_beta">عالم الشام</option>
          </select>
        </label>
        <button
          onClick={() => {
            void load().catch((err) => setError(err.message));
          }}
        >
          تحديث المخزون
        </button>
      </nav>
      {error && (
        <p role="alert" className="preview-error">
          {error}
        </p>
      )}
      {data && data.worldId === worldId && basemap ? (
        <AbandonedVillagePreview
          key={worldId}
          data={data}
          basemap={basemap}
          busy={busy}
          onCommand={command}
        />
      ) : (
        !error && <p role="status">جارٍ تحميل القرى…</p>
      )}
    </ImageConfigContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
