import { describe, expect, it } from 'vitest';
import { availableGamesCount, publicGames } from './games';

describe('public games source', () => {
  it('يشتق العدد المتاح من الحالة ويحصر الصور في الأصول المحلية', () => {
    expect(availableGamesCount).toBe(
      publicGames.filter((game) => game.status !== 'soon').length,
    );
    expect(publicGames.every((game) => game.image.startsWith('/game-art/'))).toBe(true);
    expect(publicGames.every((game) => game.imageAlt.trim().length > 0)).toBe(true);
  });

  it('يبقي الطيف قريبًا ولا يمنحه وجهة منشورة', () => {
    expect(publicGames.find((game) => game.id === 'spectrum')).toMatchObject({
      status: 'soon',
      href: '',
    });
  });
});
