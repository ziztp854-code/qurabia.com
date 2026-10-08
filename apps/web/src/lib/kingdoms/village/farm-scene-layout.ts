/** Soil corners measured from the user-selected 2048 × 1143 photograph.
 * Rows run southwest, columns southeast. No mobile crop changes this projection. */
export const FARM_WORLD = { width: 2048, height: 1143 };
export const farmBeds = [
  [
    [820, 262],
    [999, 186],
    [1131, 253],
    [965, 330],
  ],
  [
    [1088, 368],
    [1247, 304],
    [1373, 356],
    [1212, 431],
  ],
  [
    [1335, 488],
    [1486, 422],
    [1624, 479],
    [1472, 554],
  ],
  [
    [1576, 611],
    [1740, 549],
    [1872, 604],
    [1725, 677],
  ],
  [
    [540, 394],
    [714, 321],
    [854, 387],
    [684, 465],
  ],
  [
    [782, 500],
    [951, 433],
    [1082, 491],
    [917, 574],
  ],
  [
    [1010, 620],
    [1183, 552],
    [1329, 613],
    [1159, 702],
  ],
  [
    [1279, 749],
    [1445, 679],
    [1607, 754],
    [1436, 836],
  ],
  [
    [233, 533],
    [410, 462],
    [548, 526],
    [379, 610],
  ],
  [
    [465, 643],
    [645, 570],
    [800, 641],
    [620, 731],
  ],
  [
    [707, 773],
    [889, 701],
    [1042, 770],
    [864, 866],
  ],
  [
    [969, 910],
    [1160, 832],
    [1317, 905],
    [1137, 1008],
  ],
] as const;
export function farmBedPoint(id: number, u = 0.5, v = 0.5) {
  const [a, b, c, d] = farmBeds[id];
  return {
    x: (1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c[0] + (1 - u) * v * d[0],
    y: (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c[1] + (1 - u) * v * d[1],
  };
}
export function farmBedBounds(id: number) {
  const points = farmBeds[id],
    x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]));
  return {
    x: x - 30,
    y: y - 90,
    width: Math.max(...points.map((p) => p[0])) - x + 60,
    height: Math.max(...points.map((p) => p[1])) - y + 120,
  };
}
