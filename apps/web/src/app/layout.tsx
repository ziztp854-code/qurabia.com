import { APP_CONFIG } from '@tahaddi/config';
import '@fontsource-variable/alexandria';
import '@fontsource-variable/cairo';
import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import Script from 'next/script';
import { PresenceBeacon } from '@/components/presence/presence-beacon';
import { ThemeProvider } from '@/components/theme-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { SpeedInsights } from '@/components/speed-insights';
import { buildSiteVerificationMetadata } from '@/lib/metadata/discovery';
import { SHARE_IMAGE, SHARE_IMAGE_URL, SITE_URL } from '@/lib/metadata/site';
import './globals.css';
import '../styles/prestige.css';
import '../styles/home-luxury.css';
import '../styles/brand-internal.css';
import '../styles/game-catalog.css';
import '../styles/game-catalog-refine.css';
import '../styles/instant-mind-games.css';
import '../styles/mafia-enhanced.css';
import '../styles/mafia-design-system.css';
import '../styles/internal-experience.css';
import '../styles/game-catalog-royal.css';
import '../styles/live-presentation.css';
import '../styles/live-question-control.css';
import '../styles/question-bank.css';
import '../styles/leaderboard-presentation.css';
import '../styles/royal-live.css';
import '../styles/live-reference.css';
import '../styles/live-stage-system.css';
import '../styles/live-crowning.css';

const siteTitle = `${APP_CONFIG.name} | مسابقات وألعاب جماعية عربية مباشرة`;
const siteDescription =
  'تحدّي منصة عربية لإنشاء المسابقات والألعاب الجماعية المباشرة. شارك رمز الغرفة، واستقبل اللاعبين، وتابع الإجابات والترتيب لحظة بلحظة.';

export const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': new URL('/#website', SITE_URL).toString(),
      url: SITE_URL.toString(),
      name: APP_CONFIG.name,
      alternateName: ['تحدي', 'Tahaddi', 'Qurabia', 'qurabia.com'],
      description: siteDescription,
      inLanguage: 'ar-SA',
      publisher: { '@id': new URL('/#organization', SITE_URL).toString() },
    },
    {
      '@type': 'Organization',
      '@id': new URL('/#organization', SITE_URL).toString(),
      name: APP_CONFIG.name,
      alternateName: ['تحدي', 'Tahaddi', 'Qurabia'],
      url: SITE_URL.toString(),
      logo: new URL('/icon.png', SITE_URL).toString(),
    },
    {
      '@type': 'WebApplication',
      '@id': new URL('/#application', SITE_URL).toString(),
      name: APP_CONFIG.name,
      url: SITE_URL.toString(),
      description: siteDescription,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      inLanguage: 'ar-SA',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'SAR',
      },
      publisher: { '@id': new URL('/#organization', SITE_URL).toString() },
    },
  ],
};

const siteVerification = buildSiteVerificationMetadata();

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: siteTitle,
  description: siteDescription,
  applicationName: APP_CONFIG.name,
  ...(siteVerification ? { verification: siteVerification } : {}),
  keywords: [
    'مسابقات عربية',
    'ألعاب جماعية',
    'مسابقات مباشرة',
    'لعبة أسئلة',
    'شطرنج أونلاين',
    'تحدّي',
  ],
  authors: [{ name: 'عبدالعزيز بن سلطان العتيبي' }],
  creator: 'عبدالعزيز بن سلطان العتيبي',
  publisher: APP_CONFIG.name,
  category: 'games',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: APP_CONFIG.name,
    locale: 'ar_SA',
    type: 'website',
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [SHARE_IMAGE_URL],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={APP_CONFIG.defaultLocale}
      dir={APP_CONFIG.direction}
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('tahaddi-theme')||'dark';var d=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.dataset.theme=d;document.documentElement.style.colorScheme=d}catch(e){}})()`}
        </Script>
        <script
          id="site-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
        <link
          rel="alternate"
          type="text/plain"
          href={`${SITE_URL.origin}/llms.txt`}
          title="تحدّي — LLM discovery"
        />
      </head>
      <body>
        <ThemeProvider>
          <MotionProvider>
            <PresenceBeacon />
            {children}
          </MotionProvider>
        </ThemeProvider>
        {process.env.VERCEL ? (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        ) : null}
      </body>
    </html>
  );
}
