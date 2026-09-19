import { formatNumber } from '@/lib/utils';
import { LayoutGrid, List, Plus, Shuffle } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { QuestionCatalogItem, type CatalogQuestion } from '@/components/questions/question-catalog-item';
import { type BankView } from '@/lib/questions/bank-display';
import { questionsListHref, type QuestionListQuery } from '@/lib/questions/list-href';
import type { CanonicalQuestionGroup } from '@/lib/questions/bank-index';
import pageStyles from './question-bank-page.module.css';

export function QuestionCatalog({
  groups,
  view,
  matchingCount,
  randomSeed,
  randomHref,
  page,
  pageCount,
  listQuery,
  emptyComposerHref = '#question-editor',
}: {
  groups: CanonicalQuestionGroup<CatalogQuestion>[];
  view: BankView;
  matchingCount: number;
  randomSeed: string;
  randomHref: string;
  page: number;
  pageCount: number;
  listQuery: QuestionListQuery;
  emptyComposerHref?: string;
}) {
  const questionCount = groups.reduce((sum, group) => sum + group.questions.length, 0);

  return (
    <section className={pageStyles.catalog} aria-labelledby="question-catalog-heading">
      <div className={pageStyles.catalogToolbar}>
        <div className={pageStyles.catalogHeading}>
          <p className={pageStyles.catalogIndex}>03 · المنصة</p>
          <h2 id="question-catalog-heading">أسئلة المنصة</h2>
          <p>
            {formatNumber(matchingCount)} سؤال مطابق
            {randomSeed
              ? ` · عينة ${formatNumber(questionCount)}`
              : pageCount > 1
                ? ` · صفحة ${formatNumber(page)} من ${formatNumber(pageCount)}`
                : ''}
          </p>
        </div>
        <div className={pageStyles.catalogTools}>
          <ButtonLink href={randomHref} variant="outline" size="sm">
            <Shuffle aria-hidden="true" />
            {randomSeed ? 'عينة جديدة' : 'أسئلة عشوائية'}
          </ButtonLink>
          {randomSeed ? (
            <Link href={questionsListHref(listQuery)} className={pageStyles.catalogQuietLink}>
              الترتيب المعتاد
            </Link>
          ) : null}
          <div className={pageStyles.viewToggle} role="group" aria-label="طريقة عرض الأسئلة">
            <Link
              href={questionsListHref({ ...listQuery, view: undefined, random: randomSeed || undefined })}
              className={pageStyles.viewOption}
              aria-current={view === 'stage' ? 'page' : undefined}
              aria-label="عرض منصة"
            >
              <LayoutGrid size={18} aria-hidden="true" />
              منصة
            </Link>
            <Link
              href={questionsListHref({ ...listQuery, view: 'list', random: randomSeed || undefined })}
              className={pageStyles.viewOption}
              aria-current={view === 'list' ? 'page' : undefined}
              aria-label="عرض قائمة"
            >
              <List size={18} aria-hidden="true" />
              قائمة
            </Link>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className={pageStyles.emptyState}>
          <h3>لا توجد أسئلة مطابقة</h3>
          <p>غيّر المجال أو أضف سؤالًا جديدًا.</p>
          <ButtonLink href={emptyComposerHref} variant="gold">
            <Plus aria-hidden="true" />
            إضافة سؤال جديد
          </ButtonLink>
        </div>
      ) : (
        <div className={pageStyles.catalogBoard} data-view={view}>
          {groups.map((group, index) => (
            <section
              key={group.canonicalName}
              className={pageStyles.catalogGroup}
              data-domain={group.domain.id}
              aria-labelledby={`catalog-group-${index}`}
            >
              <header className={pageStyles.groupHead}>
                <span className={pageStyles.groupSlit} aria-hidden="true" />
                <h3 id={`catalog-group-${index}`}>{group.canonicalName}</h3>
                <span>
                  {formatNumber(group.questions.length)} · {group.domain.shortName}
                </span>
              </header>
              <div className={pageStyles.catalogItems} data-view={view}>
                {group.questions.map((question) => (
                  <QuestionCatalogItem key={question.id} question={question} view={view} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!randomSeed && pageCount > 1 ? (
        <nav className={pageStyles.pager} aria-label="صفحات بنك الأسئلة">
          {page > 1 ? (
            <ButtonLink href={questionsListHref({ ...listQuery, page: String(page - 1) })} variant="outline">
              السابق
            </ButtonLink>
          ) : (
            <span />
          )}
          <span>
            صفحة {formatNumber(page)} من {formatNumber(pageCount)}
          </span>
          {page < pageCount ? (
            <ButtonLink href={questionsListHref({ ...listQuery, page: String(page + 1) })} variant="outline">
              التالي
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
