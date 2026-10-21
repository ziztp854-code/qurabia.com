import 'server-only';

const cosmeticOwners: Readonly<Record<string, string>> = {
  'frame-owner-sapphire': 'cmrw9nc29000004l7a6kkosgy',
  'frame-amira-rose': 'cmrw9rfv9000204l72z55ai5b',
  'entrance-owner-sapphire': 'cmrw9nc29000004l7a6kkosgy',
  'entrance-amira-rose': 'cmrw9rfv9000204l72z55ai5b',
};
export function isExclusiveCosmetic(id: string): boolean {
  return Object.hasOwn(cosmeticOwners, id);
}
export function mayUseExclusiveCosmetic(id: string, userId: string, role: string): boolean {
  if (!isExclusiveCosmetic(id)) return true;
  return cosmeticOwners[id] === userId && (!id.includes('owner-sapphire') || role === 'OWNER');
}
