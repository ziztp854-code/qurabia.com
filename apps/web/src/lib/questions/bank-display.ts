export const BANK_VIEWS = ['stage', 'list'] as const;
export type BankView = (typeof BANK_VIEWS)[number];

export const DIFFICULTY_LABEL = {
  EASY: 'سهل',
  MEDIUM: 'متوسط',
  HARD: 'صعب',
} as const;

export const TYPE_LABEL = {
  MULTIPLE_CHOICE: 'اختيار متعدد',
  TRUE_FALSE: 'صح أو خطأ',
  SHORT_ANSWER: 'إجابة قصيرة',
} as const;

export const STATUS_LABEL = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  ARCHIVED: 'مؤرشف',
} as const;

export function parseBankView(value: string | undefined): BankView {
  return value === 'list' ? 'list' : 'stage';
}

export function fillPercent(part: number, whole: number) {
  if (whole <= 0 || part <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}
