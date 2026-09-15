import type { Metadata } from 'next';

const FALLBACK_SITE_URL = 'https://qurabia.com';

function resolveSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    FALLBACK_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;

  try {
    return new URL(withProtocol);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}

export const SITE_URL = resolveSiteUrl();
export const SHARE_IMAGE_URL = new URL('/og.png', SITE_URL).toString();

export const SHARE_IMAGE = {
  url: SHARE_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: 'تحدّي — منصة مسابقات عربية مباشرة',
} as const;

export const PUBLIC_GAME_PAGES = [
  {
    slug: 'parallel-world',
    title: 'العالم الموازي',
    description:
      'العب العالم الموازي مع أصدقائك: أسئلة عربية مختلفة تقود جميع اللاعبين إلى إجابة واحدة في تحدٍ جماعي مباشر.',
  },
  {
    slug: 'reverse-time',
    title: 'الزمن المقلوب',
    description:
      'ابدأ من الإجابة وابتكر السؤال الأذكى في لعبة الزمن المقلوب العربية، ثم صوّت مع أصدقائك لأفضل سؤال.',
  },
  {
    slug: 'infiltrator',
    title: 'الدخيل',
    description:
      'اكتشف الدخيل بين اللاعبين في لعبة أسئلة اجتماعية عربية مباشرة؛ أجب، ناقش، وصوّت قبل أن يخدعكم.',
  },
  {
    slug: 'chess',
    title: 'شطرنج أونلاين',
    description:
      'العب الشطرنج أونلاين مع صديقك مباشرة على رقعة ثلاثية الأبعاد فاخرة، وشارك رمز الغرفة دون تسجيل.',
  },
  {
    slug: 'quote-master',
    title: 'من القائل؟',
    description:
      'شاشة عرض فاخرة يقودها المضيف: بيت شعر أو حكمة خالدة وأربعة أسماء من عمالقة الأدب العربي، يدخل المتسابقون بمسح الباركود ويتنافسون على أعلى نقاط.',
  },
  {
    slug: 'knowledge-tower',
    title: 'برج المعرفة',
    description:
      'اصعد برج المعرفة عبر اثني عشر طابقاً من الأسئلة العربية المتدرجة، بثلاث أرواح ومحطات أمان ووقت يتسارع مع كل ارتفاع.',
  },
  {
    slug: 'category-board',
    title: 'لوحة الفئات',
    description:
      'أدر مواجهة أسئلة عربية بين فريقين عبر ست فئات ووسائل مساعدة ونظام نقاط كامل من شاشة مضيف واحدة.',
  },
  {
    slug: 'millionaire',
    title: 'من سيربح المليون',
    description:
      'اختبر معلوماتك في تحدي المليون العربي مع مراحل متدرجة، وسائل مساعدة، وأسئلة حماسية للعب الفردي.',
  },
  {
    slug: 'baloot',
    title: 'البلوت',
    description:
      'أنشئ غرفة بلوت خاصة لأربعة لاعبين مع شراء صن وحكم، توزيع سري، تحقق خادمي، واستعادة المقعد بعد الانقطاع.',
  },
  {
    slug: 'memory-flash',
    title: 'ومضة الذاكرة',
    description:
      'اختبر ذاكرتك في لعبة ومضة الذاكرة العربية: احفظ تسلسل الرموز وأعده بالترتيب قبل انتهاء الوقت.',
  },
  {
    slug: 'word-code',
    title: 'شفرة الحروف',
    description:
      'فك الحروف العربية المبعثرة في لعبة شفرة الحروف، واستعن بالتلميحات لتجمع أكبر عدد من النقاط.',
  },
  {
    slug: 'question-word',
    title: 'كلمة وسؤال',
    description:
      'العب كلمة وسؤال في تحدّي: سؤال واحد، إجابة من كلمة واحدة، وحروف مبعثرة تركبها بالضغط قبل انتهاء الدقيقة.',
  },
  {
    slug: 'color-rush',
    title: 'خدعة الألوان',
    description:
      'تحدّ سرعة تركيزك في لعبة خدعة الألوان: اختر لون الكلمة لا معناها وحقق أعلى نتيجة قبل انتهاء الوقت.',
  },
  {
    slug: 'spot-difference',
    title: 'اختلاف الصور',
    description:
      'العب اختلاف الصور العربي: قارن بين مشهدين متطابقين ظاهريًا واكشف الفروق الخمسة قبل انتهاء الوقت.',
  },
  {
    slug: 'scrambled-words',
    title: 'كلمات مفككة',
    description:
      'ركّب الكلمات المفككة من حروفها المبعثرة وفق الصورة والتلميح، وأكمل لوحات الكلمات قبل انتهاء الدقيقة.',
  },
  {
    slug: 'risk',
    title: 'المجازفة',
    description:
      'اكشف بطاقات المجازفة، اجمع رصيد دورك، واكتفِ قبل ظهور القنبلة في لعبة جماعية من لاعبين إلى ثمانية.',
  },
  {
    slug: 'letter-challenge',
    title: 'تحدي الحروف',
    description:
      'نافس بفريقين على شبكة حروف عربية، أجب عن الأسئلة واربط خلايا فريقك لتصنع مسار الفوز في تحدي الحروف.',
  },
  {
    slug: 'ladder',
    title: 'السلم',
    description:
      'تحدَّ فريقَيك على سُلَّم المسابقة: كل إجابة صائبة تصعد بكم، وكل خطأ يهبط بكم، وأوَّل من يبلغ القمة يفوز.',
  },
  {
    slug: 'scrambled-words-live',
    title: 'كلمات مفككة — مباشرة',
    description:
      'لعبة مباشرة متعددة اللاعبين: صورة على الشاشة وكلماتها مقطعة إلى مقاطع، وسابقون في تركيب كل الكلمات قبل نهاية الوقت.',
  },
  {
    slug: 'elimination-live',
    title: 'حلقة الإقصاء',
    description:
      'مسرح إقصاء مباشر: سؤال واحد في كل جولة، وكل من يخطئ يُقصى فورًا، والأسئلة تتصاعد صعوبة حتى يبقى ناجٍ واحد.',
  },
] as const;

type PublicPageMetadata = {
  path: string;
  title: string;
  description: string;
};

export function buildPublicPageMetadata({
  path,
  title,
  description,
}: PublicPageMetadata): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'تحدّي',
      locale: 'ar_SA',
      type: 'website',
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SHARE_IMAGE_URL],
    },
  };
}

export function buildGameMetadata(slug: string): Metadata {
  const game = PUBLIC_GAME_PAGES.find((entry) => entry.slug === slug);
  if (!game) {
    return { robots: { index: false, follow: false } };
  }

  return buildPublicPageMetadata({
    path: `/games/${game.slug}`,
    title: `${game.title} | ألعاب تحدّي`,
    description: game.description,
  });
}

function normalizeRoomCode(value?: string) {
  return (
    value
      ?.replace(/[^a-zA-Z0-9\u0660-\u0669]/g, '')
      .slice(0, 8)
      .toUpperCase() ?? ''
  );
}

export function buildJoinMetadata(code?: string): Metadata {
  const roomCode = normalizeRoomCode(code);
  const path = roomCode ? `/join/${encodeURIComponent(roomCode)}` : '/join';
  const title = roomCode ? `انضم إلى غرفة ${roomCode} | تحدّي` : 'انضم إلى مسابقة | تحدّي';
  const description = roomCode
    ? `دعوة مباشرة للانضمام إلى غرفة تحدّي بالرمز ${roomCode}. اكتب اسمك وابدأ اللعب.`
    : 'أدخل رمز الغرفة، اختر اسمك، وانضم مباشرة إلى مسابقة تحدّي.';

  return {
    ...buildPublicPageMetadata({ path, title, description }),
    ...(roomCode ? { robots: { index: false, follow: false } } : {}),
  };
}
