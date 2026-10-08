import { gardenSlots, type GardenItemId } from '../palace-garden';

// Measured visible alpha bounds of the existing 512px masters. The ground
// anchor belongs to the roots/base, never the transparent bottom of the file.
const silhouettes: Record<GardenItemId, readonly [number, number, number]> = {
  'red-roses': [56, 455, 50], 'white-roses': [46, 461, 50],
  'yellow-roses': [43, 451, 50], 'pink-roses': [64, 432, 50],
  'purple-flowers': [35, 483, 48], tulips: [27, 486, 45],
  jasmine: [54, 454, 49], 'green-shrub': [43, 452, 48],
  'cypress-tree': [11, 498, 100], 'gold-planter': [30, 483, 58],
  fountain: [14, 480, 68], 'path-stone': [39, 475, 24], bench: [24, 492, 42],
};

const overviewRoots = {
  desktop: [[748,181],[793,190],[943,181],[984,190],[753,218],[808,238],[937,218],[987,238],[765,259],[823,275],[927,259],[980,275]],
  portrait: [[347,328],[394,328],[506,328],[551,328],[347,350],[396,351],[503,351],[555,350],[345,372],[393,372],[506,372],[553,372]],
} as const;

export function getGardenProjection(itemId: GardenItemId, slotId: number, profile: 'palace' | 'desktop' | 'portrait' = 'palace') {
  const slot = gardenSlots[slotId];
  if (!slot) throw new RangeError('Unknown garden slot');
  let [top, bottom] = silhouettes[itemId];
  const referenceHeight = silhouettes[itemId][2];
  if (profile === 'palace' && slotId % 2 === 1 && itemId === 'red-roses') [top, bottom] = [72, 428];
  if (profile === 'palace' && slotId % 2 === 1 && itemId === 'green-shrub') [top, bottom] = [13, 495];
  const depth = Math.max(.72, Math.min(1.12, .72 + (slot.y - gardenSlots[0].y) / .27 * .4));
  let x = slot.x, y = slot.y;
  let world = { width: 1670, height: 942 };
  let visibleHeight = referenceHeight * depth;
  if (profile !== 'palace') {
    const native = profile === 'desktop' ? { width: 1672, height: 941 } : { width: 941, height: 1672 };
    const root = overviewRoots[profile][slotId];
    x = root[0] / native.width; y = root[1] / native.height;
    world = profile === 'desktop' ? { width: 1600, height: 900 } : { width: 900, height: 1600 };
    visibleHeight = (itemId === 'cypress-tree' ? 14 : itemId === 'fountain' ? 7 : 4.7) * depth;
    // Thumbnail silhouettes have the same registered transparent margins.
  }
  const size = visibleHeight / ((bottom - top) / 512);
  const anchorX = itemId === 'cypress-tree' ? .527 : .5;
  const anchorY = itemId === 'path-stone' ? .65 : bottom / 512;
  return {
    x, y, width: size / world.width, height: size / world.height,
    anchorX, anchorY, visibleHeight,
    shadowWidth: (itemId === 'cypress-tree' ? visibleHeight * .19 : visibleHeight * .57) / world.width,
    shadowHeight: (itemId === 'cypress-tree' ? visibleHeight * .05 : visibleHeight * .13) / world.height,
    zIndex: Math.round(y * world.height * 10),
  };
}
