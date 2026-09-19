import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'شروط الاستخدام | تحدّي',
  description: 'قواعد استخدام تحدّي للمضيفين واللاعبين ومحتوى المسابقات.',
};

const terms = [
  ['استخدم المنصة باحترام', 'المضيف مسؤول عن الأسئلة والمحتوى الذي يضيفه، ويجب ألا يستخدم المسابقات للإساءة أو نشر محتوى مخالف.'],
  ['حافظ على عدالة الجولة', 'لا تشارك رموز الغرف أو صلاحيات الإدارة مع من لا يحق له الوصول، ولا تستخدم الحسابات بطرق تعطل تجربة اللاعبين.'],
  ['التطوير مستمر', 'قد تتغير بعض المزايا أثناء تحسين المنصة، مع الحفاظ على وضوح مسارات الإنشاء والانضمام واللعب والنتائج.'],
] as const;

export default function TermsPage() {
  return (
    <SiteLayout>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">الشروط</span>
              <h1>قواعد بسيطة لتبقى الجولة واضحة وعادلة.</h1>
              <p>باستخدام تحدّي، أنت توافق على تشغيل المسابقات بطريقة تحترم المشاركين وتحافظ على أمان الحسابات والغرف.</p>
            </div>
          </div>
          <div className="card-grid three">
            {terms.map(([title, body]) => (
              <Card key={title}>
                <h2>{title}</h2>
                <p>{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
