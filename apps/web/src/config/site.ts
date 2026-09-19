export const siteConfig = {
  name: 'تحدّي',
  shortName: 'تحدّي',
  description: 'منصة عربية للمسابقات والألعاب والأسئلة التفاعلية',
  slogan: 'نافس، أجب، وتصدّر',
  locale: 'ar',
  direction: 'rtl',
} as const;

export const competitionStatuses = {
  live: 'مباشر الآن',
  waiting: 'في الانتظار',
  paused: 'متوقف مؤقتًا',
  ended: 'انتهى',
  soon: 'يبدأ قريبًا',
  offline: 'غير متصل',
} as const;

export const questionTypes = ['اختيار من متعدد', 'صح أو خطأ', 'ترتيب', 'إجابة قصيرة'] as const;
export const timerSizes = ['sm', 'md', 'lg'] as const;
