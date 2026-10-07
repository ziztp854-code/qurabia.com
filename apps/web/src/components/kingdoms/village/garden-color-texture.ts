import { Texture } from 'pixi.js';
import type { GardenColor, GardenItemId } from '@/lib/kingdoms/palace-garden';

const tones: Record<GardenColor, readonly [number, number, number]> = {
  red: [195, 52, 47], yellow: [218, 188, 46], blue: [65, 112, 193],
  green: [94, 145, 62], orange: [215, 122, 42], brown: [128, 91, 52],
};
/** Runtime customization keeps alpha, relief/shadows and green foliage intact.
 * Textures are owned by the scene and disposed together; no master is edited. */
export function gardenColorTexture(source: Texture, color: GardenColor, item: GardenItemId) {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null;
  context.drawImage(source.source.resource as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height), pixels = image.data;
  const flowers = item.includes('roses') || item === 'purple-flowers' || item === 'tulips' || item === 'jasmine';
  const tone = tones[color], toneLum = tone[0] * .2126 + tone[1] * .7152 + tone[2] * .0722;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    if (pixels[index + 3] < 12 || Math.max(r, g, b) < 32) continue;
    const foliage = g > r * 1.04 && g > b * 1.14;
    const warmSoil = r > g && g > b * 1.3 && r - g < 36;
    if (flowers && (foliage || warmSoil)) continue;
    const luminance = r * .2126 + g * .7152 + b * .0722;
    const strength = flowers ? .87 : .48;
    const light = Math.max(.16, Math.min(1.6, luminance / Math.max(1, toneLum)));
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = Math.round(pixels[index + channel] * (1 - strength) + Math.min(255, tone[channel] * light) * strength);
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}
