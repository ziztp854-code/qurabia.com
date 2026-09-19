import type { MetadataRoute } from 'next';
import { APP_CONFIG } from '@tahaddi/config';
import { SITE_URL } from '@/lib/metadata/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_CONFIG.name,
    short_name: APP_CONFIG.name,
    description:
      'منصة عربية للمسابقات والألعاب الجماعية المباشرة. نافس، أجب، وتصدّر.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#070A0F',
    theme_color: '#070A0F',
    lang: 'ar',
    dir: 'rtl',
    categories: ['games', 'education', 'entertainment'],
    id: SITE_URL.origin,
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
