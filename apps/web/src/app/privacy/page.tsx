import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية | تحدّي',
  description: 'توضيح مختصر لكيفية تعامل تحدّي مع بيانات الحسابات والغرف والمحتوى.',
};

const points = [
  [
    'بيانات التشغيل',
    'نستخدم بيانات الحساب والغرف والأسئلة لتشغيل المسابقات، حفظ التقدم، وإظهار التجربة المناسبة للمضيف واللاعب.',
  ],
  [
    'استمرارية الجهاز',
    'لحماية الجلسة والتعرّف على عودة المتسابق من المتصفح نفسه، نحفظ عنوان الشبكة وبيانات عامة عن المتصفح ومعرّفًا عشوائيًا بصيغة مشفّرة أحادية الاتجاه. لا يُحفظ المعرّف الأصلي في الخادم، ومسح بيانات الموقع ينشئ هوية جهاز جديدة.',
  ],
  [
    'الأسرار والحسابات',
    'لا نطلب مشاركة كلمات المرور أو المفاتيح السرية خارج صفحات الدخول الرسمية، ولا نعرض بيانات الحساب الخاصة داخل الجولات.',
  ],
  [
    'طلبات المراجعة',
    'لأي طلب متعلق بحساب أو محتوى، استخدم صفحة التواصل حتى نراجع الطلب في سياقه الصحيح.',
  ],
] as const;

export default function PrivacyPage() {
  return (
    <SiteLayout>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">الخصوصية</span>
              <h1>بياناتك لخدمة الجولة، لا لإرباكك.</h1>
              <p>ملخص واضح لما تحتاجه المنصة لتشغيل المسابقات وحماية تجربة المشاركين.</p>
            </div>
          </div>
          <div className="card-grid three">
            {points.map(([title, body]) => (
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
