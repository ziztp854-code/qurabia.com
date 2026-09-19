import { SiteLayout } from '@/components/layout';
import { QuizzesHub } from '@/components/quizzes/quizzes-hub';
import { getPublicQuizzes } from './actions';
import { getCurrentSession } from '@/lib/auth/session';
import { buildPublicPageMetadata } from '@/lib/metadata/site';

export const metadata = buildPublicPageMetadata({
  path: '/quizzes',
  title: 'المسابقات العربية العامة | تحدّي',
  description:
    'استكشف المسابقات العربية العامة المتاحة الآن، واختر الجولة المناسبة ثم انضم إليها مباشرة من تحدّي.',
});

export default async function QuizzesPage() {
  const [result, session] = await Promise.all([getPublicQuizzes(24), getCurrentSession()]);

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <div className="container">
        <QuizzesHub
          quizzes={result.quizzes}
          loadError={result.status === 'error' ? result.message : undefined}
        />
      </div>
    </SiteLayout>
  );
}
