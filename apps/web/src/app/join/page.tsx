import { JoinQuizForm } from '@/components/home/join-quiz-form';
import { SiteLayout } from '@/components/layout';
import { Card } from '@/components/ui';
import { getCurrentSession } from '@/lib/auth/session';
import { buildJoinMetadata } from '@/lib/metadata/site';

export const metadata = buildJoinMetadata();

export default async function JoinPage() {
  const session = await getCurrentSession();

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <section className="section">
        <div className="container join-page">
          <Card>
            <span className="eyebrow">دخول اللاعبين</span>
            <h1>انضم إلى غرفة لعب</h1>
            <p className="muted">
              اختر نوع الغرفة وأدخل الرمز الذي يشاركه المضيف، ثم أكمل خطوات الدخول.
            </p>
            <JoinQuizForm inviteMode />
          </Card>
        </div>
      </section>
    </SiteLayout>
  );
}
