import {
  Castle,
  Coins,
  Flag,
  Mountain,
  Pickaxe,
  Shield,
  Store,
  Swords,
  Trees,
  Warehouse,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { buildingStage, type VillageStageKey } from '@/lib/kingdoms/stages';
import type { Building, Resource, Village } from '@/lib/kingdoms/types';

export const resourceIcons: Record<Resource, LucideIcon> = {
  wood: Trees,
  stone: Mountain,
  iron: Pickaxe,
  food: Wheat,
  gold: Coins,
};

/** أبعاد رسم الواحة الأصلي؛ كل الإحداثيات أدناه بكسلات هذا الرسم فتبقى ثابتة في RTL وأي عرض. */
export const villageArt = {
  src: '/game-art/kingdoms/village-oasis.webp',
  width: 1536,
  height: 1024,
  sizes: '(max-width: 700px) 760px, 1200px',
} as const;

type Point = readonly [number, number];
export type Box = { x: number; y: number; w: number; h: number };

type PlotSpec = {
  Icon: LucideIcon;
  /** محيط المبنى المرسوم في اللوحة: تُطبَّق عليه حالة الخادم. */
  outline: readonly Point[];
  /** مساحة اللمس والاختيار عندما تختلف عن المحيط (السور يُختار من بوابته). */
  hit?: Box;
};

/** يحوّل خطًا متعرجًا إلى شريط مغلق بعرض ثابت، لرسم السور على امتداده الفعلي في اللوحة. */
function strip(points: readonly Point[], width: number): Point[] {
  const half = width / 2;
  const normals = points.map((_, index) => {
    const [ax, ay] = points[Math.max(0, index - 1)];
    const [bx, by] = points[Math.min(points.length - 1, index + 1)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return [-(by - ay) / length, (bx - ax) / length] as const;
  });
  const side = (sign: number) =>
    points.map(
      ([x, y], index) =>
        [
          Math.round(x + normals[index][0] * half * sign),
          Math.round(y + normals[index][1] * half * sign),
        ] as const,
    );
  return [...side(1), ...side(-1).reverse()];
}

const wallLine: Point[] = [
  [48, 468],
  [124, 514],
  [160, 600],
  [214, 700],
  [242, 776],
  [700, 792],
  [850, 792],
  [1100, 786],
  [1390, 766],
  [1446, 650],
  [1470, 540],
  [1506, 470],
];

export const villagePlots = {
  hall: {
    Icon: Castle,
    outline: [
      [606, 266],
      [700, 206],
      [880, 196],
      [1014, 246],
      [1018, 410],
      [880, 444],
      [722, 446],
      [610, 420],
    ],
  },
  lumber: {
    Icon: Trees,
    outline: [
      [776, 96],
      [880, 70],
      [1000, 118],
      [1032, 200],
      [1000, 250],
      [860, 256],
      [780, 222],
    ],
  },
  quarry: {
    Icon: Mountain,
    outline: [
      [60, 286],
      [200, 262],
      [340, 284],
      [346, 396],
      [220, 426],
      [70, 410],
    ],
  },
  mine: {
    Icon: Pickaxe,
    outline: [
      [330, 120],
      [430, 94],
      [520, 120],
      [526, 230],
      [430, 256],
      [334, 230],
    ],
  },
  farm: {
    Icon: Wheat,
    outline: [
      [1056, 280],
      [1260, 250],
      [1470, 274],
      [1476, 420],
      [1290, 440],
      [1060, 426],
    ],
  },
  treasury: {
    Icon: Coins,
    outline: [
      [316, 640],
      [390, 604],
      [470, 624],
      [486, 700],
      [440, 746],
      [334, 742],
      [314, 700],
    ],
  },
  warehouse: {
    Icon: Warehouse,
    outline: [
      [1002, 470],
      [1080, 440],
      [1200, 440],
      [1226, 480],
      [1226, 570],
      [1100, 590],
      [1006, 566],
    ],
  },
  barracks: {
    Icon: Swords,
    outline: [
      [286, 440],
      [400, 396],
      [520, 396],
      [650, 446],
      [640, 560],
      [520, 594],
      [300, 570],
    ],
  },
  wall: {
    Icon: Shield,
    outline: strip(wallLine, 46),
    hit: { x: 686, y: 764, w: 172, h: 136 },
  },
  market: {
    Icon: Store,
    outline: [
      [1040, 640],
      [1140, 604],
      [1300, 606],
      [1400, 650],
      [1396, 760],
      [1250, 784],
      [1060, 770],
    ],
  },
  embassy: {
    Icon: Flag,
    outline: [
      [676, 590],
      [760, 554],
      [860, 554],
      [940, 600],
      [936, 720],
      [800, 742],
      [680, 716],
    ],
  },
} satisfies Record<Building, PlotSpec>;

export function boundsOf(points: readonly Point[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function hitBox(building: Building): Box {
  const plot: PlotSpec = villagePlots[building];
  return plot.hit ?? boundsOf(plot.outline);
}

/** مركز منطقة المبنى بنسبة مئوية من المشهد، لطبقات الحركة مثل السقالة. */
export function plotCenter(building: Building) {
  const box = hitBox(building);
  return {
    x: ((box.x + box.w / 2) / villageArt.width) * 100,
    y: ((box.y + box.h / 2) / villageArt.height) * 100,
  };
}

export const pct = (value: number) => `${Number(value.toFixed(3))}%`;

/** موضع صندوق داخل المشهد كنسب مئوية ثابتة الاتجاه. */
export function sceneBox(box: Box) {
  return {
    left: pct((box.x / villageArt.width) * 100),
    top: pct((box.y / villageArt.height) * 100),
    width: pct((box.w / villageArt.width) * 100),
    height: pct((box.h / villageArt.height) * 100),
  };
}

/** موضع صندوق نسبةً إلى صندوق آخر، لوضع محيط السور خارج بوابته القابلة للنقر. */
export function relativeBox(inner: Box, outer: Box) {
  return {
    left: pct(((inner.x - outer.x) / outer.w) * 100),
    top: pct(((inner.y - outer.y) / outer.h) * 100),
    width: pct((inner.w / outer.w) * 100),
    height: pct((inner.h / outer.h) * 100),
  };
}

export function clipPolygon(points: readonly Point[], box: Box) {
  return `polygon(${points
    .map(([x, y]) => `${pct(((x - box.x) / box.w) * 100)} ${pct(((y - box.y) / box.h) * 100)}`)
    .join(', ')})`;
}

export function pathOf(points: readonly Point[]) {
  return `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
}

export type PlotVisual = 'vacant' | VillageStageKey;

export type PlotState = {
  level: number;
  maxLevel: number;
  visual: PlotVisual;
  constructing: boolean;
  /** المستوى الذي يبنيه الخادم الآن لهذا المبنى إن وُجد. */
  targetLevel: number | null;
  maxed: boolean;
  percent: number;
};

/** حالة العرض لكل مبنى مشتقة فقط من مستوى الخادم وقائمة البناء. */
export function plotState(
  building: Building,
  village: Pick<Village, 'buildings' | 'build'>,
  maxLevel: number,
): PlotState {
  const level = Math.max(0, village.buildings[building]);
  const build = village.build?.building === building ? village.build : undefined;
  const stage = buildingStage(level, maxLevel);
  return {
    level,
    maxLevel,
    visual: stage?.key ?? 'vacant',
    constructing: !!build,
    targetLevel: build ? build.level : null,
    maxed: maxLevel > 0 && level >= maxLevel,
    percent: maxLevel > 0 ? Math.min(100, Math.max(0, Math.round((level / maxLevel) * 100))) : 0,
  };
}
