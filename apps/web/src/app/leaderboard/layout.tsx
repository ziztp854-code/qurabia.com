import type { Metadata } from 'next';
import { buildPublicPageMetadata } from '@/lib/metadata/site';

export const metadata: Metadata = buildPublicPageMetadata({
  path: '/leaderboard',
  title: 'لوحة الشرف وترتيب اللاعبين | تحدّي',
  description:
    'شاهد لوحة الشرف وترتيب لاعبي تحدّي حسب النقاط والإجابات الصحيحة وأفضل سلاسل الفوز في المنافسات المباشرة.',
});

export default function LeaderboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
