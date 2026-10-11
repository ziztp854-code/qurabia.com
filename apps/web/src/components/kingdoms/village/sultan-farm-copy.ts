export const sultanFarmCopy = {
  locale: 'ar',
  aria: {
    farm: 'مزرعة السلطان',
    summary: 'ملخص الحديقة',
    plots: 'أحواض المزرعة',
    details: (plot: string) => `تفاصيل الحوض ${plot}`,
    plot: (plot: string, state: string) => `الحوض ${plot}، ${state}`,
    growth: 'مراحل النمو',
    progress: 'تقدم نمو النبات',
  },
  header: {
    eyebrow: 'حديقة القرية الملكية',
    title: 'مزرعة السلطان',
    intro: 'ازرع، راقب النمو، واجمع أوسمة الحديقة',
    harvests: (value: string) => `${value} حصاد`,
    growing: (value: string) => `${value} تنمو`,
    ripe: (value: string) => `${value} ناضج`,
    empty: (value: string) => `${value} فارغ`,
  },
  shell: {
    manage: 'إدارة الحديقة',
    close: 'إغلاق اللوحة',
    back: 'العودة إلى القرية',
    expand: 'توسيع لوحة الحديقة',
    collapse: 'تصغير لوحة الحديقة',
  },
  scene: {
    aria: 'مشهد مزرعة السلطان، اسحب أو كبّر لاستكشاف الأحواض',
    tools: 'استكشاف المزرعة',
    fit: 'المزرعة كاملة',
    focus: (plot: string) => `تقريب الحوض ${plot}`,
    zoomIn: 'تكبير المزرعة',
    zoomOut: 'تصغير المزرعة',
    motionOn: 'تشغيل الحركة',
    motionOff: 'إيقاف الحركة',
    empty: 'جاهز لبذرة جديدة',
    caption: (plot: string, state: string) =>
      `الحوض ${plot} · ${state} · اختر الحوض من الصورة أو لوحة الزراعة`,
    renderFailure: 'تعذر رسم النباتات؛ تابع حالة النمو والزراعة من اللوحة.',
  },
  guidance:
    'الزراعة مجانية وتجميلية. يستمر النمو أثناء غيابك، وتبقى النبتة الناضجة محفوظة حتى تجمعها.',
  duration: {
    hours: (value: string) => `${value} ساعة`,
    minutes: (value: string) => `${value} دقيقة`,
  },
  plot: {
    empty: 'فارغ',
    legacy: 'قديم',
    freeCosmetic: 'مجاني · تجميلي',
    ready: 'جاهز للجمع',
    remaining: (duration: string) => `متبقي ${duration}`,
  },
  detail: {
    eyebrow: 'الحوض المختار',
    title: (plot: string) => `الحوض ${plot}`,
    maturePreview: (crop: string) => `${crop} — شكل النضج`,
  },
  reward: {
    preview: (value: string) => `الجمع يمنح حصادًا واحدًا للحديقة؛ يصبح المجموع ${value}.`,
    legacy: (food: string) =>
      `محصول قديم مدفوع: ${food} غذاء عند الحصاد وفق العقد المحفوظ. الزراعة التالية مجانية وتجميلية.`,
    storageFull: 'المخزن لا يسع المحصول القديم؛ وفر مساحة، والمحصول محفوظ.',
  },
  actions: {
    collect: (plot: string) => `اجمع الحوض ${plot}`,
    legacyHarvest: (plot: string) => `احصد الحوض ${plot}`,
    plant: (crop: string) => `ازرع ${crop}`,
  },
  picker: {
    legend: 'اختر النبات — البذور مجانية',
    available: 'متاح مجانًا',
    locked: (value: string) => `متبقي ${value} حصاد لفتحه`,
    duration: 'مدة النمو',
    cycle: 'دورة البذور',
    cycleValue: 'مجانية بعد كل جمع',
    unlock: (crop: string, earned: string, target: string, remaining: string) =>
      `لفتح ${crop}: المكتسب ${earned} من ${target} حصاد؛ المتبقي ${remaining}.`,
  },
  goals: {
    summary: 'أوسمة الحديقة — المكتسب والأهداف',
    earnedSuffix: ' — مكتسب',
    earned: 'وسام مكتسب لحسابك',
    progress: (value: string, target: string, unit: string, remaining: string) =>
      `${value} / ${target} ${unit}؛ متبقي ${remaining}`,
    varietyUnit: 'أنواع مختلفة',
    harvestUnit: 'حصادات',
    reward: (value: string) => `المكافأة: ${value}`,
  },
  decor: {
    legend: 'إطارات الأحواض',
    locked: (value: string) => `متبقي ${value} حصاد`,
    applied: 'مطبّق',
    apply: 'طبّق مجانًا',
  },
  footnote:
    'بذرة ← برعم ← نمو ← إزهار ← ناضج. كل جمع يقدّم الحديقة فقط؛ إنتاج الغذاء من مبنى المزرعة يستمر كالمعتاد.',
} as const;
