import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteLayout } from '@/components/layout';
import { ButtonLink, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'تواصل معنا | تحدّي',
  description: 'طرق التواصل مع تحدّي بخصوص الحسابات أو المحتوى أو دعم المسابقات.',
};

export default function ContactPage() {
  return (
    <SiteLayout>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">تواصل معنا</span>
              <h1>أخبرنا بما تحتاجه، وسنبدأ من المسار الصحيح.</h1>
              <p>إن كان طلبك متعلقًا بحساب أو غرفة، أرسل التفاصيل الأساسية فقط وتجنب إرسال كلمات مرور أو مفاتيح سرية.</p>
            </div>
          </div>
          <div className="card-grid two">
            <Card>
              <h2>دعم المسابقات</h2>
              <p>للمساعدة في إنشاء المسابقة، الانضمام برمز، أو فهم نتائج الجولة.</p>
              <ButtonLink href="/join" variant="gold">جرّب مسار الانضمام</ButtonLink>
            </Card>
            <Card>
              <h2>الحساب والمحتوى</h2>
              <p>للطلبات المتعلقة بالحسابات أو الأسئلة أو مراجعة محتوى غير مناسب.</p>
              <Link href="/dashboard">اذهب إلى لوحة التحكم</Link>
            </Card>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
