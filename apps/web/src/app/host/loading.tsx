import { Radio } from 'lucide-react';
import { HostLayout } from '@/components/layout';
import { Card, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <HostLayout players={0}>
      <div className="host-stage royal-host-hub royal-live">
        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow royal-live-kicker">
                <Radio aria-hidden="true" />
                02 · تشغيل مباشر
              </span>
              <h1>لوحة المضيف</h1>
              <p>نجهّز الغرفة والأسئلة الآن.</p>
            </div>
          </div>
          <Card>
            <div className="skeleton-stack" role="status" aria-label="جاري تحميل لوحة المضيف">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </Card>
        </section>
      </div>
    </HostLayout>
  );
}
