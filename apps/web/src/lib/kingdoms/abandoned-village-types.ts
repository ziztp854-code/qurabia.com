import type { Resources } from './types';

export const abandonedRegions = ['egypt', 'levant', 'iraq', 'arabia'] as const;
export type AbandonedRegion = (typeof abandonedRegions)[number];

export interface AbandonedVillage {
  readonly id: string;
  readonly name: string;
  readonly region: AbandonedRegion;
  readonly countryCode: string;
  readonly longitude: number;
  readonly latitude: number;
  /** Existing gameplay coordinates determine travel; WGS84 is presentation only. */
  readonly x: number;
  readonly y: number;
  stock: Resources;
  stockUpdatedAt: number;
}

export interface AbandonedVillageLayout {
  readonly version: 1;
  readonly scope: 'isolated-preview' | 'kingdom-world';
  readonly worldId: string;
  readonly seed: string;
  readonly domainVersion: string;
  readonly generatedAt: number;
  readonly villages: Readonly<Record<string, AbandonedVillage>>;
}

export interface AbandonedVillageView extends Omit<AbandonedVillage, 'stock' | 'stockUpdatedAt'> {
  readonly available: Resources;
  readonly capacityPerResource: number;
  readonly regenerationPerResourceHour: number;
}
