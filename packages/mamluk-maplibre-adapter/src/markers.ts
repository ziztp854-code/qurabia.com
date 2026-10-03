import type { Map } from 'maplibre-gl' with { 'resolution-mode': 'import' };
import { DEFAULT_PALETTE, type MapPalette } from './styles';

const silhouettes = [
  '<path d="M13 33V24l8-7 8 7v9M9 33h30M29 33V27l6-5 5 5v6M18 33v-7h6v7"/>',
  '<path d="M8 34V23l7-6 7 6v11M25 34V21l8-7 8 7v13M5 34h38M12 34v-7h6v7M30 34v-8h6v8"/>',
  '<path d="M6 35V25l7-6 7 6v10M20 35V22h15v13M20 22a7.5 7.5 0 0 1 15 0M37 35V13h4v22M36 13l3-5 3 5M4 35h40M25 35v-8h5v8"/>',
  '<path d="M7 36V23h34v13M7 23v-9h5v5h5v-5h5v9M30 23v-9h5v5h6v-5h3v22M20 36v-9a4 4 0 0 1 8 0v9M14 29h2M34 29h2"/>',
  '<path d="M5 37V19h6v18M5 19l3-7 3 7M14 37V23h20v14M14 23a10 10 0 0 1 20 0M38 37V19h5v18M38 19l2.5-7 2.5 7M21 37V27h6v10M3 37h42"/>',
  '<path d="M4 38V15h5v23M3 15l3.5-7L10 15M12 38V24h24v14M12 24a12 12 0 0 1 24 0M20 38V27h8v11M39 38V15h5v23M38 15l3.5-7L45 15M24 12V5M21 7h6M2 38h44"/>',
];
/** Original compact SVG silhouettes; rendered once into the map's shared HiDPI sprite atlas. */
export function markerSvgs(
  palette: MapPalette = DEFAULT_PALETTE,
): readonly { id: string; svg: string }[] {
  const wrap = (body: string, color = palette.city) =>
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="' +
    palette.fog +
    '" fill-opacity=".94" stroke="' +
    color +
    '" stroke-width="1.5"/><g fill="' +
    palette.fog +
    '" stroke="' +
    color +
    '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
    body +
    '</g></svg>';
  return [
    ...silhouettes.map((body, index) => ({ id: 'mamluk-tier-' + (index + 1), svg: wrap(body) })),
    {
      id: 'mamluk-capital',
      svg: wrap(
        '<path d="M10 33h28v5H10zM12 30V20l6 5 6-13 6 13 6-5v10zM10 9v9M10 9h9l-2 3 2 3h-9"/><circle cx="24" cy="9" r="2"/>',
      ),
    },
    {
      id: 'mamluk-castle',
      svg: wrap(
        '<path d="M10 36V13h6v6h5v-6h6v6h5v-6h6v23H10zM20 36V27a4 4 0 0 1 8 0v9"/>',
        palette.castle,
      ),
    },
    {
      id: 'mamluk-army',
      svg: wrap(
        '<path d="M15 37V10M15 12h21l-5 7 5 7H15M10 37h10M22 17l5 5m0-5-5 5"/>',
        palette.army,
      ),
    },
    {
      id: 'mamluk-own-army',
      svg: wrap('<path d="M15 37V10M15 12h21l-5 7 5 7H15M10 37h10M20 18l4 4 7-8"/>', palette.army),
    },
    {
      id: 'mamluk-route-arrow',
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><path d="M17 13l14 11-14 11" fill="none" stroke="' +
        palette.route +
        '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
  ];
}
export async function registerMapMarkerImages(
  map: Pick<Map, 'hasImage' | 'addImage'>,
  options: { readonly pixelRatio?: number; readonly palette?: MapPalette } = {},
): Promise<void> {
  const ratio = Math.max(1, Math.min(4, options.pixelRatio ?? globalThis.devicePixelRatio ?? 1));
  await Promise.all(
    markerSvgs(options.palette).map(async ({ id, svg }) => {
      if (map.hasImage(id)) return;
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.ceil(48 * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Map marker canvas unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (!map.hasImage(id))
        map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), {
          pixelRatio: ratio,
        });
    }),
  );
}
