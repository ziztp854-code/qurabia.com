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
            <h1>انضم كزائر إلى المسابقة</h1>
            <p className="muted">
              أدخل الرمز الذي يظهر على شاشة المضيف، ثم اختر اسمًا يظهر في لوحة اللاعبين.
            </p>
            <JoinQuizForm inviteMode />
          </Card>
        </div>
      </section>
    </SiteLayout>
  );
}
