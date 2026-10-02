import { createRoot } from 'react-dom/client';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ImageConfigContext } from 'next/dist/shared/lib/image-config-context.shared-runtime';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { KingdomsClient } from '../../src/components/kingdoms/kingdoms-client';
import '../../src/app/globals.css';

// The standalone Vite fixture supplies navigation context; production uses Next's router.
const router: AppRouterInstance = {
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => location.reload(),
  push: (href) => location.assign(href),
  replace: (href) => location.replace(href),
  prefetch: () => {},
  bfcacheId: 'village-browser-fixture',
};
createRoot(document.getElementById('root')!).render(
  <AppRouterContext.Provider value={router}>
    {/* Vite serves the original local assets without Next's image optimization route. */}
    <ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
      <KingdomsClient />
    </ImageConfigContext.Provider>
  </AppRouterContext.Provider>,
);
