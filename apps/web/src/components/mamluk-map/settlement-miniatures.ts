import {
  mapBuildingKeys,
  parseVillageBuildingLevels,
  type MapBuildingLevels,
} from '@mamluk/world-map-core';

export interface MiniaturePalette {
  stone: string;
  sand: string;
  roof: string;
  leaf: string;
  water: string;
  ink: string;
}

export const MINIATURE_SIZE = 192;
export const MINIATURE_RATIO = 3;
export const PUBLIC_MINIATURES = [1, 2, 3, 4, 5, 6] as const;
export const MAX_OWN_MINIATURES = 32;

export function miniatureTier(level: unknown): number {
  return typeof level !== 'number'
    ? 1
    : level <= 5
      ? 1
      : level <= 10
        ? 2
        : level <= 20
          ? 3
          : level <= 30
            ? 4
            : level <= 40
              ? 5
              : 6;
}

/** A key is a bounded, canonical architectural summary, never player/game state. */
export function ownedMiniature(properties: Record<string, unknown>, viewerId?: string) {
  if (!viewerId || properties.ownerPlayerId !== viewerId) return null;
  const levels = parseVillageBuildingLevels(properties.villageBuildings);
  if (!levels) return null;
  const key = mapBuildingKeys.map((building) => levels[building] ?? 0).join('-');
  return { id: `mamluk-own-village-${key}`, levels };
}

/**
 * Isometric sandstone architecture, gardens and a courtyard. Public villages use
 * an illustrative level-based silhouette. Owner variants contain only buildings
 * present in the authoritative summary; their interior positions remain illustrative.
 */
export function villageMiniatureSvg(
  tier: number,
  palette: MiniaturePalette,
  ownedLevels?: MapBuildingLevels,
): string {
  const { stone, sand, roof, leaf, water, ink } = palette;
  const present = (key: keyof MapBuildingLevels) =>
    ownedLevels
      ? (ownedLevels[key] ?? 0) > 0
      : key === 'hall' ||
        tier >=
          ({
            lumber: 1,
            farm: 1,
            market: 2,
            warehouse: 2,
            quarry: 3,
            mine: 3,
            barracks: 3,
            stable: 4,
            treasury: 4,
            embassy: 5,
            wall: 3,
          }[key as Exclude<keyof MapBuildingLevels, 'hall'>] ?? 1);
  const body: string[] = [];
  const building = (
    key: keyof MapBuildingLevels,
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    dome = false,
  ) => {
    if (!present(key)) return;
    const level = ownedLevels?.[key] ?? tier;
    const height = h + Math.min(5, Math.log2(Math.max(1, level))) * 1.4;
    body.push(
      `<g data-building="${key}"><path d="M${x},${y}l${w},${-d} ${w},${d} ${-w},${d}Z" fill="${ink}" opacity=".12" transform="translate(3 3)"/>`,
    );
    body.push(
      `<path d="M${x},${y}v${-height}l${w},${d}v${height}Z" fill="${sand}" stroke="${ink}" stroke-opacity=".6" stroke-width=".8"/>`,
    );
    body.push(`<path d="M${x},${y}v${-height}l${w},${d}v${height}Z" fill="${ink}" opacity=".18"/>`);
    body.push(
      `<path d="M${x + w},${y + d}v${-height}l${w},${-d}v${height}Z" fill="${stone}" stroke="${ink}" stroke-opacity=".55" stroke-width=".8"/>`,
    );
    body.push(
      `<path d="M${x},${y - height}l${w},${-d} ${w},${d} ${-w},${d}Z" fill="${roof}" stroke="${ink}" stroke-opacity=".45" stroke-width=".7"/>`,
    );
    body.push(`<path d="M${x + w - 2},${y + d - 2}v-5q2-4 4-1v6Z" fill="${ink}" opacity=".62"/>`);
    if (dome)
      body.push(
        `<path d="M${x + w - 6},${y - height}a6,7 0 0 1 12,0q-6,5-12,0Z" fill="${roof}" stroke="${ink}" stroke-opacity=".55" stroke-width=".7"/><path d="M${x + w},${y - height - 7}v-3" stroke="${ink}" stroke-width="1"/>`,
      );
    if (level >= 5)
      body.push(
        `<path d="M${x + 3},${y - height + 5}v3m4-5v3" stroke="${ink}" opacity=".5" stroke-width="1.2"/>`,
      );
    body.push('</g>');
  };
  const palm = (x: number, y: number, height = 14) => {
    body.push(
      `<g><path d="M${x},${y}q-1,-${height / 2} 1,-${height}" fill="none" stroke="${sand}" stroke-width="1.7"/><path d="M${x + 1},${y - height}q-10,-6-11,1 7-3 11,0-6,-10-9,-6 5,1 9,6 6,-9 10,-5-6,1-10,5 12,-2 11,4-5,-4-11,-4Z" fill="${leaf}"/></g>`,
    );
  };
  // A grounded footprint, with transparent space around it so the geographic anchor stays exact.
  body.push(
    `<ellipse cx="64" cy="93" rx="51" ry="19" fill="${ink}" opacity=".28"/><path d="M12 77 60 51 115 78 68 108Z" fill="${sand}" stroke="${ink}" stroke-opacity=".55" stroke-width="1.1"/><path d="M12 77v4l56 31v-4Z" fill="${ink}" opacity=".55"/><path d="M68 108v4l47-30v-4Z" fill="${roof}" opacity=".65"/>`,
  );
  if (present('wall'))
    body.push(
      `<path d="M16 77v-8l44-23 51 26v8l-51-25Z" fill="${stone}" stroke="${ink}" stroke-opacity=".5" stroke-width=".8"/><path d="M22 68v-6m13 0v-7m13 0v-7m27 4v-7m13 13v-7m13 14v-7" stroke="${sand}" stroke-width="4"/>`,
    );
  palm(30, 72, 15);
  building('lumber', 29, 70, 7, 3.5, 7);
  building('quarry', 71, 61, 7, 3.5, 8);
  building('mine', 90, 72, 6, 3, 8);
  building('embassy', 58, 61, 8, 4, 15, true);
  building('hall', 44, 75, 12, 6, 18, true);
  building('treasury', 78, 81, 7, 3.5, 13, true);
  // Courtyard and canal are scenery, not a new game resource or facility.
  body.push(
    `<path d="M46 85 61 78 85 91 70 100Z" fill="${stone}" opacity=".7"/><ellipse cx="66" cy="88" rx="7" ry="3.5" fill="${sand}"/><ellipse cx="66" cy="88" rx="5" ry="2" fill="${water}"/><path d="M66 86v-3" stroke="${stone}" stroke-width="1.5"/>`,
  );
  building('warehouse', 28, 83, 8, 4, 9);
  building('barracks', 79, 91, 9, 4.5, 10);
  building('stable', 87, 86, 7, 3.5, 7);
  building('market', 45, 94, 9, 4.5, 6);
  if (present('farm'))
    body.push(
      `<g data-building="farm"><path d="M19 82 30 76 46 84 35 90Z" fill="${leaf}" opacity=".75"/><path d="M23 82 38 89m-10-10 15 7m-9-10 14 7" stroke="${sand}" stroke-width=".7"/></g>`,
    );
  palm(20, 87, 18);
  palm(105, 88, 17);
  if (tier >= 4) palm(82, 102, 13);
  if (present('wall'))
    body.push(
      `<path d="M16 78v8l49 26v-8Z" fill="${sand}" stroke="${ink}" stroke-opacity=".55" stroke-width=".9"/><path d="M16 78v8l49 26v-8Z" fill="${ink}" opacity=".14"/><path d="M65 104v8l44-27v-8Z" fill="${stone}" stroke="${ink}" stroke-opacity=".45" stroke-width=".8"/><path d="M24 85v-5m12 12v-5m12 12v-5m25 8v-5m13-3v-5m13-3v-5" stroke="${stone}" stroke-width="4"/><path d="M60 108v-8q5-7 10-1v9Z" fill="${ink}" opacity=".7"/>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${body.join('')}</svg>`;
}

export async function rasterizeMiniature(svg: string): Promise<ImageData> {
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MINIATURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Village miniature canvas unavailable');
  context.drawImage(image, 0, 0, MINIATURE_SIZE, MINIATURE_SIZE);
  return context.getImageData(0, 0, MINIATURE_SIZE, MINIATURE_SIZE);
}
