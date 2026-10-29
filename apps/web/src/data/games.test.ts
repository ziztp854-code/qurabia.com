import { describe, expect, it } from 'vitest';
import { availableGamesCount, publicGames, toCatalogGames } from './games';

describe('public games source', () => {
  it('يشتق العدد المتاح من الحالة ويحصر الصور في الأصول المحلية', () => {
    expect(availableGamesCount).toBe(
      publicGames.filter((game) => game.status !== 'soon').length,
    );
    expect(publicGames.every((game) => game.image.startsWith('/game-art/'))).toBe(true);
    expect(publicGames.every((game) => game.imageAlt.trim().length > 0)).toBe(true);
  });

  it('يحتفظ بجميع تصنيفات اللعبة في الكتالوج', () => {
    const game = toCatalogGames().find((item) => item.id === 'fastest-button');
    expect(game?.categories).toEqual(['سرعة', 'اجتماعي', 'تركيز']);
  });

  it('يعرض من القائل كلعبة جماعية مباشرة', () => {
    expect(toCatalogGames().find((game) => game.id === 'quote-master')).toMatchObject({
      minimumPlayers: 2, maximumPlayers: 8, requiresRealtime: true,
    });
  });

  it('يبقي الطيف قريبًا ولا يمنحه وجهة منشورة', () => {
    expect(publicGames.find((game) => game.id === 'spectrum')).toMatchObject({
      status: 'soon',
      href: '',
    });
  });

  it('يربط تحدي الممالك بمساره المحمي المستقل', () => {
    expect(publicGames.find((game) => game.id === 'kingdoms')).toMatchObject({
      status: 'live',
      href: '/games/kingdoms',
      mode: 'kingdoms',
      category: 'استراتيجية',
    });
  });
});
