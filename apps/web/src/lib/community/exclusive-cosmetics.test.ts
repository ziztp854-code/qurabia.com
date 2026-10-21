import { expect, it } from 'vitest';
import { isExclusiveCosmetic, mayUseExclusiveCosmetic } from './exclusive-cosmetics';
it('binds each exclusive frame to its designated identity, with current owner authority', () => {
  const owner = 'cmrw9nc29000004l7a6kkosgy',
    amira = 'cmrw9rfv9000204l72z55ai5b';
  expect(mayUseExclusiveCosmetic('frame-owner-sapphire', owner, 'OWNER')).toBe(true);
  expect(mayUseExclusiveCosmetic('frame-amira-rose', amira, 'USER')).toBe(true);
  for (const role of ['OWNER', 'ADMIN', 'USER']) {
    expect(mayUseExclusiveCosmetic('frame-owner-sapphire', amira, role)).toBe(false);
    expect(mayUseExclusiveCosmetic('frame-amira-rose', owner, role)).toBe(false);
    expect(mayUseExclusiveCosmetic('frame-amira-rose', 'other', role)).toBe(false);
  }
  expect(mayUseExclusiveCosmetic('frame-owner-sapphire', owner, 'USER')).toBe(false);
  expect(isExclusiveCosmetic('frame-gold')).toBe(false);
  expect(mayUseExclusiveCosmetic('frame-gold', 'other', 'USER')).toBe(true);
});
