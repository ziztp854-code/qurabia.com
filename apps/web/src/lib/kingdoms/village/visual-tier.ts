/** Maps the server-authored village.progression.visualTier. Does not compute a tier. */
export const villageVisualTierLabels = {
  1: 'مستوطنة',
  2: 'قرية صغيرة',
  3: 'قرية مزدهرة',
  4: 'بلدة محصنة',
  5: 'مدينة مملوكية',
  6: 'حاضرة عظيمة',
} as const;

export type VillageVisualTier = keyof typeof villageVisualTierLabels;

export function villageVisualPresentation(visualTier: number | undefined) {
  const clamped = Number.isFinite(visualTier) ? Math.round(visualTier as number) : 1;
  const tier = Math.min(6, Math.max(1, clamped)) as VillageVisualTier;
  return {
    tier,
    label: villageVisualTierLabels[tier],
    flagCount: ([1, 1, 2, 2, 3, 4] as const)[tier - 1],
    waterGlints: ([4, 6, 8, 10, 12, 14] as const)[tier - 1],
    particleScale: ([0.4, 0.55, 0.7, 0.85, 1, 1.15] as const)[tier - 1],
    roadEmphasis: tier >= 4,
    wallEmphasis: tier >= 4,
    marketAmbience: tier >= 3,
    militaryAmbience: tier >= 5,
  };
}
