import { DashboardLayout } from '@/components/layout';
import { Skeleton } from '@/components/ui';
import { QuestionBankShell } from '@/components/questions/question-bank-shell';
import pageStyles from '@/components/questions/question-bank-page.module.css';
import indexStyles from '@/components/questions/question-bank-index.module.css';

export default function Loading() {
  return (
    <DashboardLayout
      title="بنك الأسئلة المركزي"
      description="تصفح المجالات، اعرض الأسئلة كمنصة أو قائمة، ثم أضف إلى المسابقة أو عدّل."
    >
      <QuestionBankShell className={pageStyles.page} role="status" aria-label="جارٍ تحميل بنك الأسئلة">
        <div className={indexStyles.inventory}>
          <article className={indexStyles.inventoryHero}>
            <Skeleton />
            <Skeleton />
          </article>
          <div className={indexStyles.inventoryMeters}>
            {Array.from({ length: 3 }, (_, index) => (
              <article key={index} className={indexStyles.statCard}>
                <Skeleton />
                <Skeleton />
              </article>
            ))}
          </div>
        </div>
        <section className={pageStyles.searchPanel}>
          <Skeleton />
          <Skeleton />
        </section>
        <section className={indexStyles.domainSection}>
          <div className={indexStyles.domainGrid}>
            {Array.from({ length: 6 }, (_, index) => (
              <article key={index} className={indexStyles.domainCard}>
                <div className={indexStyles.domainCardLink}>
                  <Skeleton />
                  <Skeleton />
                  <Skeleton />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className={pageStyles.catalog}>
          <div className="skeleton-stack">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        </section>
      </QuestionBankShell>
    </DashboardLayout>
  );
}
