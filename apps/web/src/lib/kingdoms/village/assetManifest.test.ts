import { describe, expect, it } from 'vitest';
import {
  resolveVillageAssetSrc,
  villageAssetFidelity,
  villageAssets,
  villageBaseClassification,
} from './assetManifest';

describe('village asset manifest fidelity', () => {
  it('classifies the shipped oasis plate as low-resolution for 4K and never invents missing files', () => {
    expect(villageBaseClassification).toBe('LOW_RESOLUTION_FOR_4K');
    expect(villageAssets.base.src).toBe('/game-art/kingdoms/village-oasis.webp');
    expect(villageAssets.base.variants).toEqual({
      standard: '/game-art/kingdoms/village-oasis.webp',
      hidpi: null,
      ultra: null,
    });
    expect(resolveVillageAssetSrc(villageAssets.base, 'ultra')).toBe(
      '/game-art/kingdoms/village-oasis.webp',
    );
    expect(resolveVillageAssetSrc(villageAssets.roads, 'hidpi')).toBeNull();
    expect(resolveVillageAssetSrc(villageAssets.environment.scaffold, 'standard')).toBeNull();
    expect(villageAssetFidelity('ultra')).toBe('ultra');
    expect(villageAssetFidelity('high')).toBe('hidpi');
    expect(villageAssetFidelity('low')).toBe('standard');
  });
});
