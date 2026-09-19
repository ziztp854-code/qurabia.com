import { INJECTED_GAME_CATALOG, type EnhancedGameMeta } from '@tahaddi/domain';

export type PublicGameStatus = 'live' | 'soon';

export type PublicGame = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: PublicGameStatus;
  minPlayers: number;
  maxPlayers: number;
  image: string;
  imageAlt: string;
  href: string;
  kind: EnhancedGameMeta['kind'];
  mode: EnhancedGameMeta['mode'];
  requiresRealtime: boolean;
};

const GAME_IMAGES: Record<string, { image: string; imageAlt: string }> = {
  'knowledge-tower': {
    image: '/game-art/catalog-v2/knowledge-tower.webp',
    imageAlt: 'برج ذهبي متدرج يصعد نحو قمة مضيئة في برج المعرفة',
  },
  'category-board': {
    image: '/game-art/catalog-v2/category-board.webp',
    imageAlt: 'لوحة فئات ذهبية تضم رموز المعرفة والعلوم والرياضة',
  },
  millionaire: {
    image: '/game-art/catalog-v2/millionaire.webp',
    imageAlt: 'درجات ذهبية تصعد نحو قمة مضيئة في تحدي المليون',
  },
  baloot: {
    image: '/game-art/catalog-v2/baloot.webp',
    imageAlt: 'طاولة بلوت خضراء فاخرة موزعة لأربعة لاعبين',
  },
  'memory-flash': {
    image: '/game-art/catalog-v2/memory-flash.webp',
    imageAlt: 'تسلسل من بلاطات مضيئة وثلاث فرص في ومضة الذاكرة',
  },
  'word-code': {
    image: '/game-art/catalog-v2/word-code.webp',
    imageAlt: 'أسطوانة شفرة ذهبية تحيط بها قطع حروف مبعثرة',
  },
  'question-word': {
    image: '/game-art/catalog-v2/question-word.webp',
    imageAlt: 'كرة سؤال ذهبية فوق مساحة إجابة وقطع كلمات متناثرة',
  },
  'color-rush': {
    image: '/game-art/catalog-v2/color-rush.webp',
    imageAlt: 'مسارات ألوان سريعة تتجه نحو بلاطة مضيئة في خدعة الألوان',
  },
  'spot-difference': {
    image: '/game-art/catalog-v2/spot-difference.webp',
    imageAlt: 'باحة عربية مكررة تفحصها عدسة مكبرة لاكتشاف الفرق',
  },
  'scrambled-words': {
    image: '/game-art/catalog-v2/scrambled-words.webp',
    imageAlt: 'فانوس مضيء تحيط به قطع كلمات تعاد إلى صفوف مرتبة',
  },
  'scrambled-words-live': {
    image: '/game-art/catalog-v2/scrambled-words-live.webp',
    imageAlt: 'بطاقة صورة تحيط بها قطع دائرية متحركة في سباق كلمات مباشر',
  },
  'elimination-live': {
    image: '/game-art/catalog-v2/elimination-live.webp',
    imageAlt: 'منصة ذهبية باقية وسط منصات مظلمة في حلقة الإقصاء',
  },
  risk: {
    image: '/game-art/catalog-v2/risk.webp',
    imageAlt: 'لوحة خانات متدرجة يتوسطها اختيار أحمر في لعبة المجازفة',
  },
  'letter-challenge': {
    image: '/game-art/catalog-v2/letter-challenge.webp',
    imageAlt: 'مساران أخضر وبرتقالي يلتقيان عبر شبكة سداسية',
  },
  ladder: {
    image: '/game-art/catalog-v2/ladder.webp',
    imageAlt: 'مساران سماوي وذهبي يتسابقان صعودًا على سلم كبير',
  },
  chess: {
    image: '/game-art/catalog-v2/chess.webp',
    imageAlt: 'حصان عاجي يواجه ملكًا أسود على رقعة شطرنج فاخرة',
  },
  mafia: {
    image: '/game-art/catalog-v2/mafia.webp',
    imageAlt: 'شخصيات مقنعة تتبادل أصواتًا سرية حول طاولة القاتل',
  },
  'parallel-world': {
    image: '/game-art/catalog-v2/parallel-world.webp',
    imageAlt: 'عالمان مختلفان يتصلان عبر بوابة ذهبية واحدة',
  },
  'reverse-time': {
    image: '/game-art/catalog-v2/reverse-time.webp',
    imageAlt: 'رمل ذهبي يصعد داخل ساعة رملية محاطة بأسهم عكسية',
  },
  infiltrator: {
    image: '/game-art/catalog-v2/infiltrator.webp',
    imageAlt: 'قطعة مختلفة مضيئة بالأحمر تختبئ بين قطع متطابقة',
  },
  spectrum: {
    image: '/game-art/catalog-v2/spectrum.webp',
    imageAlt: 'مؤشر طيف بين طرف سماوي وآخر ذهبي مع تقديرات الفرق',
  },
};

const hrefFor = (game: EnhancedGameMeta) =>
  game.kind === 'upcoming' ? '' : (game.href ?? `/games/${game.mode}`);

export const publicGames: readonly PublicGame[] = INJECTED_GAME_CATALOG.map((game) => {
  const image = GAME_IMAGES[game.id] ?? GAME_IMAGES[game.mode] ?? GAME_IMAGES['category-board'];

  return {
    id: game.id,
    name: game.title,
    description: game.description,
    category: game.categories[0] ?? 'ألعاب',
    status: game.kind === 'upcoming' ? 'soon' : 'live',
    minPlayers: game.minimumPlayers,
    maxPlayers: game.maximumPlayers,
    image: image.image,
    imageAlt: image.imageAlt,
    href: hrefFor(game),
    kind: game.kind,
    mode: game.mode,
    requiresRealtime: game.requiresRealtime,
  };
});

export const availableGamesCount = publicGames.filter((game) => game.status !== 'soon').length;

export type CatalogGame = Omit<EnhancedGameMeta, 'href'> & {
  href: string;
  status: PublicGameStatus;
  image: string;
  imageAlt: string;
};

export function toCatalogGames(games: readonly PublicGame[] = publicGames): CatalogGame[] {
  return games.map((game) => {
    const base = INJECTED_GAME_CATALOG.find((item) => item.id === game.id);
    const catalogBase = base ?? INJECTED_GAME_CATALOG[0];

    return {
      ...catalogBase,
      id: game.id,
      mode: game.mode,
      kind: game.kind,
      title: game.name,
      shortTitle: game.name,
      description: game.description,
      minimumPlayers: game.minPlayers,
      maximumPlayers: game.maxPlayers,
      categories: [game.category as CatalogGame['categories'][number]],
      href: game.href,
      requiresRealtime: game.requiresRealtime,
      status: game.status,
      image: game.image,
      imageAlt: game.imageAlt,
    };
  });
}
