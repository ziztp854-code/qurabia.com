import { describe, expect, it } from 'vitest';
import {
  aggregateCategoriesIntoDomains,
  getMasterDomainForCategory,
  groupQuestionsByCanonicalCategory,
  listCanonicalFilterOptions,
  MASTER_DOMAINS,
} from './bank-index';

describe('getMasterDomainForCategory', () => {
  it('maps Islamic categories to Islamic domain', () => {
    expect(getMasterDomainForCategory('ثقافة إسلامية').id).toBe('islamic');
    expect(getMasterDomainForCategory('تاريخ إسلامي').id).toBe('islamic');
  });

  it('maps geography categories to geography domain', () => {
    expect(getMasterDomainForCategory('جغرافيا').id).toBe('geography');
    expect(getMasterDomainForCategory('جغرافيا عربية').id).toBe('geography');
    expect(getMasterDomainForCategory('جغرافيا السعودية').id).toBe('geography');
  });

  it('maps history and Saudi categories to history domain', () => {
    expect(getMasterDomainForCategory('تاريخ').id).toBe('history');
    expect(getMasterDomainForCategory('تاريخ السعودية').id).toBe('history');
    expect(getMasterDomainForCategory('السعودية').id).toBe('history');
    expect(getMasterDomainForCategory('تاريخ العلوم').id).toBe('history');
  });

  it('maps science categories to science domain', () => {
    expect(getMasterDomainForCategory('علوم').id).toBe('science');
    expect(getMasterDomainForCategory('فيزياء').id).toBe('science');
    expect(getMasterDomainForCategory('كيمياء').id).toBe('science');
    expect(getMasterDomainForCategory('أحياء').id).toBe('science');
    expect(getMasterDomainForCategory('فضاء').id).toBe('science');
  });

  it('maps literature and language categories to literature domain', () => {
    expect(getMasterDomainForCategory('أدب ولغة').id).toBe('literature');
    expect(getMasterDomainForCategory('أدب').id).toBe('literature');
    expect(getMasterDomainForCategory('أدب عربي').id).toBe('literature');
    expect(getMasterDomainForCategory('نحو').id).toBe('literature');
    expect(getMasterDomainForCategory('بلاغة').id).toBe('literature');
    expect(getMasterDomainForCategory('مفردات عربية').id).toBe('literature');
  });

  it('maps sports category to sports domain', () => {
    expect(getMasterDomainForCategory('رياضة').id).toBe('sports');
  });

  it('maps math and logic categories to logic domain', () => {
    expect(getMasterDomainForCategory('رياضيات').id).toBe('logic');
    expect(getMasterDomainForCategory('حساب ذهني').id).toBe('logic');
    expect(getMasterDomainForCategory('متتابعات').id).toBe('logic');
    expect(getMasterDomainForCategory('منطق').id).toBe('logic');
  });

  it('maps tech categories to tech domain', () => {
    expect(getMasterDomainForCategory('ذكاء اصطناعي').id).toBe('tech');
    expect(getMasterDomainForCategory('أمن رقمي').id).toBe('tech');
    expect(getMasterDomainForCategory('قواعد بيانات').id).toBe('tech');
    expect(getMasterDomainForCategory('شبكات').id).toBe('tech');
    expect(getMasterDomainForCategory('هندسة برمجيات').id).toBe('tech');
  });

  it('handles null, undefined and unknown gracefully by falling back to general', () => {
    expect(getMasterDomainForCategory(null).id).toBe('general');
    expect(getMasterDomainForCategory(undefined).id).toBe('general');
    expect(getMasterDomainForCategory('تصنيف عشوائي غير معروف').id).toBe('general');
  });
});

describe('aggregateCategoriesIntoDomains', () => {
  it('rolls alias categories into canonical buckets', () => {
    const mockCategories = [
      { id: '1', name: 'ثقافة إسلامية', _count: { questions: 10 } },
      { id: '2', name: 'تاريخ إسلامي', _count: { questions: 5 } },
      { id: '3', name: 'جغرافيا', _count: { questions: 100 } },
      { id: '4', name: 'علوم', _count: { questions: 50 } },
      { id: '5', name: 'فيزياء', _count: { questions: 20 } },
      { id: '6', name: 'أدب', _count: { questions: 8 } },
      { id: '7', name: 'أدب عربي', _count: { questions: 4 } },
    ];

    const results = aggregateCategoriesIntoDomains(mockCategories);
    expect(results).toHaveLength(MASTER_DOMAINS.length);

    const islamic = results.find((r) => r.domain.id === 'islamic');
    expect(islamic?.totalQuestions).toBe(15);
    expect(islamic?.categories).toHaveLength(2);

    const geography = results.find((r) => r.domain.id === 'geography');
    expect(geography?.totalQuestions).toBe(100);

    const science = results.find((r) => r.domain.id === 'science');
    expect(science?.totalQuestions).toBe(70);
    expect(science?.categories).toEqual([
      expect.objectContaining({ name: 'علوم', questionCount: 70 }),
    ]);

    const literature = results.find((r) => r.domain.id === 'literature');
    expect(literature?.totalQuestions).toBe(12);
    expect(literature?.categories).toEqual([
      expect.objectContaining({ name: 'أدب ولغة', questionCount: 12 }),
    ]);
  });
});

describe('groupQuestionsByCanonicalCategory', () => {
  it('groups alias categories and sorts by master domain', () => {
    const groups = groupQuestionsByCanonicalCategory([
      { id: '1', category: { name: 'أدب' } },
      { id: '2', category: { name: 'نحو' } },
      { id: '3', category: { name: 'جغرافيا عربية' } },
    ]);

    expect(groups.map((g) => g.canonicalName)).toEqual(['جغرافيا', 'أدب ولغة']);
    expect(groups[1]?.questions).toHaveLength(2);
  });
});

describe('listCanonicalFilterOptions', () => {
  it('rolls aliases into unique canonical filter rows', () => {
    const options = listCanonicalFilterOptions([
      { id: '1', name: 'أدب', _count: { questions: 3 } },
      { id: '2', name: 'نحو', _count: { questions: 2 } },
      { id: '3', name: 'جغرافيا', _count: { questions: 9 } },
    ]);

    expect(options).toEqual([
      expect.objectContaining({ name: 'جغرافيا', count: 9, domainId: 'geography' }),
      expect.objectContaining({ name: 'أدب ولغة', count: 5, domainId: 'literature' }),
    ]);
  });
});
