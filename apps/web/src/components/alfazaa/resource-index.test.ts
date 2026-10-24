import { describe, expect, it } from 'vitest';
import { filterResources, type ResourceImage } from './resource-index';
const items: ResourceImage[] = [
  {
    id: 'a',
    name: 'Hero portrait',
    category: 'heroes',
    url: '/a.png',
    width: 500,
    height: 700,
    bytes: 100,
    aliases: ['بطل النار'],
  },
  {
    id: 'b',
    name: 'Castle',
    category: 'buildings',
    url: '/b.png',
    width: 400,
    height: 400,
    bytes: 200,
  },
  {
    id: 'c',
    name: 'Hero full',
    category: 'heroes',
    url: '/c.png',
    width: 900,
    height: 1200,
    bytes: 300,
  },
];
describe('complete asset index', () => {
  it('searches original aliases and combines category without losing source metadata', () => {
    expect(filterResources(items, 'النار', 'heroes', 1, 60).items).toEqual([items[0]]);
    expect(filterResources(items, 'castle', 'heroes', 1, 60).total).toBe(0);
  });
  it('bounds pagination and keeps the original catalogue intact', () => {
    const snapshot = JSON.stringify(items);
    expect(filterResources(items, '', 'all', 999, 2)).toMatchObject({
      total: 3,
      page: 2,
      pages: 2,
      items: [items[2]],
    });
    expect(filterResources(items, '', 'all', -1, 2).page).toBe(1);
    expect(JSON.stringify(items)).toBe(snapshot);
  });
  it('supports empty searches and ignores case in logical names', () => {
    expect(filterResources(items, 'HERO', 'all', 1, 60).total).toBe(2);
    expect(filterResources(items, 'none', 'all', 1, 60)).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pages: 1,
    });
  });
});
