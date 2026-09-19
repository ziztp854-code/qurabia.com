// Rank entries are reserved asset paths; export their Blender sources before mounting them.
export type ModelId = 'challenge-card' | 'viewer' | 'knight' | 'prince' | 'sultan';

export type ModelDefinition = Readonly<{
  id: ModelId;
  name: string;
  src: string;
  scale: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  animation?: string;
  quality: 'low' | 'medium' | 'high';
}>;

export const models = {
  'challenge-card': {
    id: 'challenge-card',
    name: 'بطاقة تحدّي',
    src: '/models/challenge-card.glb',
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    animation: 'CardFloat',
    quality: 'high',
  },
  viewer: {
    id: 'viewer',
    name: 'المشاهد',
    src: '/models/ranks/viewer.glb',
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    quality: 'low',
  },
  knight: {
    id: 'knight',
    name: 'الفارس',
    src: '/models/ranks/knight.glb',
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    quality: 'medium',
  },
  prince: {
    id: 'prince',
    name: 'الأمير',
    src: '/models/ranks/prince.glb',
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    quality: 'high',
  },
  sultan: {
    id: 'sultan',
    name: 'السلطان',
    src: '/models/ranks/sultan.glb',
    scale: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    quality: 'high',
  },
} as const satisfies Record<ModelId, ModelDefinition>;

export function getModel(id: ModelId): ModelDefinition {
  return models[id];
}
