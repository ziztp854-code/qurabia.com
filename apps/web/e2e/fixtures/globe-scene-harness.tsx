import { useState } from 'react';
import type { MapMode } from '../../src/components/mamluk-map/map-mode';
import { createRoot } from 'react-dom/client';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { MamlukWorldMap } from '../../src/components/mamluk-map/mamluk-world-map';
import './globe-map-probe';
import '../../src/app/globals.css';

const router: AppRouterInstance = {
  back: () => history.back(), forward: () => history.forward(),
  refresh: () => location.reload(), push: (href) => location.assign(href),
  replace: (href) => location.replace(href), prefetch: () => {},
  bfcacheId: 'globe-browser-fixture',
};
const referenceOnly = new URLSearchParams(location.search).get('mode') === 'public';
const ownLocation = { longitude: 31.2357, latitude: 30.0444 };
function FixtureMap() {
  const [mode, setMode] = useState<MapMode>('WORLD');
  const [target, setTarget] = useState('');
  return <><output aria-label="الهدف المؤكد">{target}</output><MamlukWorldMap
    mode={mode} onModeChange={setMode} onConfirmTarget={setTarget} targetVillageIds={['cairo']}
    worlds={[{ id: referenceOnly ? 'public-atlas' : 'world', name: 'عالم الاختبار' }]}
    initialWorldId={referenceOnly ? 'public-atlas' : 'world'}
    viewerPlayerId={referenceOnly ? 'public-viewer' : 'viewer'}
    referenceOnly={referenceOnly}
    {...referenceOnly ? {} : { initialLocation: ownLocation, initialVillageId: 'cairo',
      villageLocations: [{ villageId: 'cairo', name: 'القاهرة', ...ownLocation }] }}
  /></>;
}
createRoot(document.getElementById('root')!).render(
  <AppRouterContext.Provider value={router}>
    <ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
      <main style={{ maxWidth: 1440, margin: '0 auto', padding: 12, boxSizing: 'border-box' }}>
        <FixtureMap />
      </main>
    </ImageConfigContext.Provider>
  </AppRouterContext.Provider>,
);
