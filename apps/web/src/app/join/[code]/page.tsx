import type { Metadata } from 'next';
import { JoinQuizForm } from '@/components/home/join-quiz-form';
import { SiteLayout } from '@/components/layout';
import { Card } from '@/components/ui';
import { getCurrentSession } from '@/lib/auth/session';
import { buildJoinMetadata } from '@/lib/metadata/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return buildJoinMetadata(code);
}

export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, session] = await Promise.all([params, getCurrentSession()]);

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <section className="section">
        <div className="container join-page">
          <Card>
            <span className="eyebrow">دعوة مباشرة</span>
            <h1>ادخل المسابقة كزائر</h1>
            <p className="muted">
              الرمز جاهز من رابط المضيف. اكتب اسمك وسيتم إدخالك إلى غرفة اللعب.
            </p>
            <JoinQuizForm initialCode={code} inviteMode />
          </Card>
        </div>
      </section>
    </SiteLayout>
  );
}
