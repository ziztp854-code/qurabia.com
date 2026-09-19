import { describe, expect, it } from 'vitest';
import {
  buildCategoryMergePlan,
  foldArabicLabel,
  normalizeCategoryName,
} from './category-taxonomy';

describe('normalizeCategoryName', () => {
  it('collapses literature synonyms into أدب ولغة', () => {
    expect(normalizeCategoryName('أدب')).toBe('أدب ولغة');
    expect(normalizeCategoryName('أدب عربي')).toBe('أدب ولغة');
    expect(normalizeCategoryName('نحو')).toBe('أدب ولغة');
    expect(normalizeCategoryName('بلاغة')).toBe('أدب ولغة');
    expect(normalizeCategoryName('شعر')).toBe('أدب ولغة');
  });

  it('maps السعودية to تاريخ السعودية', () => {
    expect(normalizeCategoryName('السعودية')).toBe('تاريخ السعودية');
  });

  it('merges geography variants', () => {
    expect(normalizeCategoryName('جغرافيا عربية')).toBe('جغرافيا');
    expect(normalizeCategoryName('جغرافيا السعودية')).toBe('جغرافيا');
    expect(normalizeCategoryName('السعودية والخليج والعالم العربي')).toBe('جغرافيا');
  });

  it('merges science subfields into علوم', () => {
    expect(normalizeCategoryName('فيزياء')).toBe('علوم');
    expect(normalizeCategoryName('فضاء')).toBe('علوم');
    expect(normalizeCategoryName('فلك')).toBe('علوم');
  });

  it('folds diacritics, alef variants, and the definite article', () => {
    expect(foldArabicLabel('الْجُغْرَافِيَا')).toBe('الجغرافيا');
    expect(normalizeCategoryName('الْجُغْرَافِيَا')).toBe('جغرافيا');
    expect(normalizeCategoryName('ادب')).toBe('أدب ولغة');
    expect(normalizeCategoryName('الفقه')).toBe('ثقافة إسلامية');
  });

  it('maps keyword-only labels without colliding math and sports', () => {
    expect(normalizeCategoryName('غزوة بدر')).toBe('تاريخ إسلامي');
    expect(normalizeCategoryName('علوم شرعية متقدمة')).toBe('ثقافة إسلامية');
    expect(normalizeCategoryName('تمارين رياضية أولمبية')).toBe('رياضة');
    expect(normalizeCategoryName('تمارين رياضية')).toBe('رياضة');
    expect(normalizeCategoryName('رياضيات متقدمة')).toBe('رياضيات');
  });

  it('returns null for empty input', () => {
    expect(normalizeCategoryName(null)).toBeNull();
    expect(normalizeCategoryName('  ')).toBeNull();
  });
});

describe('buildCategoryMergePlan', () => {
  it('plans merges only when alias differs from canonical', () => {
    const plan = buildCategoryMergePlan(['أدب', 'جغرافيا', 'فيزياء', 'ثقافة إسلامية', 'الفقه']);
    expect(plan).toEqual([
      { from: 'أدب', to: 'أدب ولغة' },
      { from: 'الفقه', to: 'ثقافة إسلامية' },
      { from: 'فيزياء', to: 'علوم' },
    ]);
  });
});
