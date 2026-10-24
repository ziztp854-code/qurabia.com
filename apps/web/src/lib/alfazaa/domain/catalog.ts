import raw from '../data/catalog.json';
import type { AlfazaaState, Catalog } from './types';

// JSON's inferred number[][] cannot express the extractor's two-element cost tuples.
export const catalog = raw as unknown as Catalog;
export const getArm = (id: number) => catalog.arms.find((row) => row.id === id);
export const getBuilding = (id: number) => catalog.buildings.find((row) => row.id === id);
export const getLevel = (id: number) => catalog.levels.find((row) => row.id === id);
export const getCastle = (state: AlfazaaState) =>
  catalog.buildings.find((row) => row.type === 11 && row.level === state.castleLevel);
export const listRecruitableArms = () =>
  catalog.arms.filter((row) => row.level === 1 && row.subtype !== 3);
