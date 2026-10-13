/* Original, local single-player simulation. No kingdom rewards are written by this game. */
const crops = {
  wheat: { name: 'قمح', icon: '🌾', cost: 0, time: 12, yield: 3, xp: 3, level: 1, color: 0xe9c650 },
  carrot: {
    name: 'جزر',
    icon: '🥕',
    cost: 3,
    time: 22,
    yield: 3,
    xp: 5,
    level: 1,
    color: 0xef9445,
  },
  corn: { name: 'ذرة', icon: '🌽', cost: 4, time: 28, yield: 3, xp: 6, level: 2, color: 0xf1d963 },
  cotton: {
    name: 'قطن',
    icon: '🌿',
    cost: 5,
    time: 35,
    yield: 3,
    xp: 8,
    level: 2,
    color: 0xf3f0dd,
  },
  sugar: {
    name: 'قصب السكر',
    icon: '🎋',
    cost: 7,
    time: 45,
    yield: 3,
    xp: 10,
    level: 3,
    color: 0x8baa51,
  },
  tomato: {
    name: 'طماطم',
    icon: '🍅',
    cost: 8,
    time: 55,
    yield: 3,
    xp: 12,
    level: 4,
    color: 0xdd6553,
  },
};
const goods = {
  ...crops,
  flour: { name: 'دقيق', icon: '🪨' },
  feed: { name: 'علف', icon: '🌱' },
  bread: { name: 'خبز', icon: '🥖' },
  milk: { name: 'حليب', icon: '🥛' },
  eggs: { name: 'بيض', icon: '🥚' },
  cheese: { name: 'جبن', icon: '🧀' },
  fabric: { name: 'قماش', icon: '🧵' },
  shirt: { name: 'ثوب', icon: '👕' },
  jam: { name: 'مربّى', icon: '🍯' },
};
const recipes = {
  flour: {
    name: 'دقيق',
    building: 'mill',
    input: { wheat: 3 },
    output: 'flour',
    time: 15,
    amount: 1,
    level: 1,
  },
  feed: {
    name: 'علف الحيوانات',
    building: 'mill',
    input: { wheat: 2 },
    output: 'feed',
    time: 10,
    amount: 2,
    level: 1,
  },
  bread: {
    name: 'خبز طازج',
    building: 'bakery',
    input: { flour: 2 },
    output: 'bread',
    time: 20,
    amount: 1,
    level: 2,
  },
  milk: {
    name: 'حلب الأبقار',
    building: 'stable',
    input: { feed: 1 },
    output: 'milk',
    time: 18,
    amount: 2,
    level: 2,
  },
  eggs: {
    name: 'جمع البيض',
    building: 'coop',
    input: { feed: 1 },
    output: 'eggs',
    time: 16,
    amount: 2,
    level: 1,
  },
  cheese: {
    name: 'جبن المزرعة',
    building: 'dairy',
    input: { milk: 2 },
    output: 'cheese',
    time: 30,
    amount: 1,
    level: 3,
  },
  fabric: {
    name: 'نسيج قطني',
    building: 'textile',
    input: { cotton: 3 },
    output: 'fabric',
    time: 30,
    amount: 1,
    level: 3,
  },
  shirt: {
    name: 'ثوب السوق',
    building: 'tailor',
    input: { fabric: 2 },
    output: 'shirt',
    time: 40,
    amount: 1,
    level: 4,
  },
  jam: {
    name: 'مربّى الخيرات',
    building: 'preserves',
    input: { sugar: 2, tomato: 2 },
    output: 'jam',
    time: 45,
    amount: 1,
    level: 4,
  },
};
const buildingTypes = {
  mill: {
    name: 'الطاحونة',
    icon: '⚙',
    cost: 90,
    level: 1,
    population: 0,
    time: 12,
    color: 0xaaccbf,
  },
  bakery: {
    name: 'المخبز',
    icon: '🥖',
    cost: 85,
    level: 2,
    population: 8,
    time: 18,
    color: 0xf2bb8f,
  },
  stable: {
    name: 'مزرعة الأبقار',
    icon: '🐄',
    cost: 65,
    level: 2,
    population: 8,
    time: 18,
    color: 0xe69576,
  },
  coop: {
    name: 'بيت الدجاج',
    icon: '🐔',
    cost: 60,
    level: 1,
    population: 0,
    time: 12,
    color: 0xe5c682,
  },
  dairy: {
    name: 'معمل الألبان',
    icon: '🧀',
    cost: 140,
    level: 3,
    population: 12,
    time: 25,
    color: 0xf0dfb2,
  },
  textile: {
    name: 'دار النسيج',
    icon: '🧵',
    cost: 160,
    level: 3,
    population: 12,
    time: 25,
    color: 0xa8bdd4,
  },
  tailor: {
    name: 'دار الخياطة',
    icon: '👕',
    cost: 190,
    level: 4,
    population: 16,
    time: 30,
    color: 0xc2afd6,
  },
  preserves: {
    name: 'دار المؤونة',
    icon: '🍯',
    cost: 180,
    level: 4,
    population: 16,
    time: 30,
    color: 0xe3a8b3,
  },
  house: {
    name: 'بيت القرية',
    icon: '⌂',
    cost: 70,
    level: 1,
    population: 0,
    time: 15,
    color: 0xe6dbbb,
  },
  fountain: {
    name: 'نافورة السلطان',
    icon: '⛲',
    cost: 65,
    level: 2,
    population: 0,
    time: 10,
    color: 0xb6d9de,
  },
  garden: {
    name: 'بستان الزهور',
    icon: '🌳',
    cost: 40,
    level: 1,
    population: 0,
    time: 8,
    color: 0xa6c878,
  },
};
const defaultPositions = {
  mill: [4, -4],
  coop: [7, -4],
  bakery: [4, 0],
  stable: [7, 0],
  dairy: [4, 4],
  textile: [7, 4],
  tailor: [4, 8],
  preserves: [7, 8],
  house: [0, -4],
  fountain: [0, 4],
  garden: [0, 8],
};
const buildSlots = [
  [0, -4],
  [4, -4],
  [7, -4],
  [0, 0],
  [4, 0],
  [7, 0],
  [0, 4],
  [4, 4],
  [7, 4],
  [0, 8],
  [4, 8],
  [7, 8],
];
const orderTemplates = [
  { name: 'خبّاز الحي', icon: '🥖', items: { wheat: 6 }, coins: 32, xp: 14, level: 1 },
  { name: 'تاجر الخضار', icon: '🥕', items: { carrot: 3 }, coins: 32, xp: 12, level: 1 },
  { name: 'مطبخ القلعة', icon: '🏰', items: { flour: 2 }, coins: 45, xp: 18, level: 1 },
  { name: 'قافلة الشام', icon: '🐪', items: { bread: 2, milk: 2 }, coins: 100, xp: 30, level: 2 },
  { name: 'تاجر الأقمشة', icon: '🧵', items: { fabric: 2 }, coins: 110, xp: 32, level: 3 },
  { name: 'سوق الصباح', icon: '🥚', items: { eggs: 4, corn: 3 }, coins: 70, xp: 22, level: 2 },
  {
    name: 'مائدة السلطان',
    icon: '🧀',
    items: { cheese: 2, bread: 2 },
    coins: 130,
    xp: 38,
    level: 3,
  },
  { name: 'قافلة الحجاز', icon: '👕', items: { shirt: 2, jam: 2 }, coins: 220, xp: 55, level: 4 },
];
const initial = () => ({
  version: 2,
  coins: 240,
  xp: 0,
  harvests: 0,
  deliveries: 0,
  produced: 0,
  selected: 'wheat',
  plots: Array.from({ length: 6 }, () => null),
  inventory: Object.fromEntries(
    Object.keys(goods).map((k) => [k, k === 'wheat' ? 6 : k === 'feed' ? 2 : 0]),
  ),
  jobs: {},
  orderIds: [0, 1, 2],
  nextOrder: 3,
  claimed: [],
  buildings: Object.fromEntries(
    Object.keys(buildingTypes).map((k) => [k, ['mill', 'coop', 'house'].includes(k) ? 1 : 0]),
  ),
  positions: { mill: [4, -4], coop: [7, -4], house: [0, -4] },
  construction: {},
  capacity: 60,
  barnLevel: 1,
  supplies: { wood: 0, brick: 0, nails: 0 },
  trips: { caravan: null, ship: null },
  shipments: 0,
  lastDaily: '',
  dailyStreak: 0,
});
function level(s) {
  return 1 + Math.floor(s.xp / 60);
}
function population(s) {
  return 4 + s.buildings.house * 4;
}
function stock(s) {
  return Object.values(s.inventory).reduce((a, b) => a + b, 0);
}
function reserved(s) {
  return Object.values(s.jobs)
    .flat()
    .reduce((a, j) => a + j.amount, 0);
}
function requirements(s, items) {
  return Object.entries(items).every(([k, n]) => s.inventory[k] >= n);
}
function productionTime(s, r) {
  return Math.ceil(r.time * (1 - (s.buildings[r.building] - 1) * 0.15)) * 1000;
}
function expandCost(s) {
  return 50 + s.plots.length * 5;
}
function upgradeCost(s, k) {
  return 45 + s.buildings[k] * 45;
}
function totalBuildings(s) {
  return Object.values(s.buildings).filter((n) => n > 0).length;
}
function quests(s) {
  return [
    { name: 'احصد ٣ حقول', value: s.harvests, max: 3, reward: 35 },
    { name: 'سلّم طلبين للسوق', value: s.deliveries, max: 2, reward: 60 },
    { name: 'بلوغ المستوى ٣', value: level(s), max: 3, reward: 100 },
    { name: 'اصنع ٥ منتجات', value: s.produced, max: 5, reward: 70 },
    { name: 'شيد ٥ مبانٍ', value: totalBuildings(s), max: 5, reward: 100 },
    { name: 'رحلتان تجاريتان', value: s.shipments, max: 2, reward: 120 },
    { name: 'مزرعة من ١٢ حقلًا', value: s.plots.length, max: 12, reward: 100 },
    { name: 'احصد ٣٠ حقلًا', value: s.harvests, max: 30, reward: 150 },
  ];
}
function validSave(s) {
  const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9,
    time = (n) => Number.isFinite(n) && n >= 0;
  const point = (p) =>
    Array.isArray(p) && p.length === 2 && buildSlots.some((x) => x[0] === p[0] && x[1] === p[1]);
  const timed = (j) => j && time(j.start) && time(j.ready) && j.ready >= j.start;
  if (
    !s ||
    s.version !== 2 ||
    ![
      'coins',
      'xp',
      'harvests',
      'deliveries',
      'produced',
      'nextOrder',
      'shipments',
      'dailyStreak',
    ].every((k) => count(s[k])) ||
    !Object.hasOwn(crops, s.selected)
  )
    return false;
  if (
    !Array.isArray(s.plots) ||
    s.plots.length < 6 ||
    s.plots.length > 18 ||
    s.plots.length % 2 ||
    !s.plots.every((p) => p === null || (timed(p) && Object.hasOwn(crops, p.crop)))
  )
    return false;
  if (
    !s.inventory ||
    !Object.keys(goods).every((k) => count(s.inventory[k])) ||
    !count(s.capacity) ||
    s.capacity < 60 ||
    s.capacity > 600 ||
    !count(s.barnLevel) ||
    s.barnLevel < 1 ||
    s.barnLevel > 10
  )
    return false;
  if (
    !s.buildings ||
    !Object.keys(buildingTypes).every((k) => count(s.buildings[k]) && s.buildings[k] <= 3) ||
    !s.positions ||
    !s.construction ||
    !s.jobs
  )
    return false;
  const points = Object.values(s.positions);
  if (
    !points.every(point) ||
    new Set(points.map((p) => p.join(','))).size !== points.length ||
    !Object.keys(s.positions).every((k) => Object.hasOwn(buildingTypes, k))
  )
    return false;
  if (!Object.entries(s.buildings).every(([k, n]) => !n || point(s.positions[k]))) return false;
  if (
    !Object.entries(s.construction).every(
      ([k, j]) =>
        Object.hasOwn(buildingTypes, k) && !s.buildings[k] && point(s.positions[k]) && timed(j),
    )
  )
    return false;
  if (
    !Object.entries(s.jobs).every(
      ([k, q]) =>
        s.buildings[k] > 0 &&
        Array.isArray(q) &&
        q.length <= 3 &&
        q.every(
          (j) =>
            timed(j) &&
            Object.hasOwn(recipes, j.recipe) &&
            recipes[j.recipe].building === k &&
            j.amount === recipes[j.recipe].amount,
        ),
    )
  )
    return false;
  if (
    !s.supplies ||
    !['wood', 'brick', 'nails'].every((k) => count(s.supplies[k])) ||
    !s.trips ||
    !['caravan', 'ship'].every(
      (k) =>
        s.trips[k] === null ||
        (timed(s.trips[k]) &&
          count(s.trips[k].reward) &&
          count(s.trips[k].xp) &&
          ['wood', 'brick', 'nails'].includes(s.trips[k].supply)),
    )
  )
    return false;
  return (
    Array.isArray(s.orderIds) &&
    s.orderIds.length === 3 &&
    s.orderIds.every((n) => count(n) && n < orderTemplates.length) &&
    Array.isArray(s.claimed) &&
    s.claimed.every((n) => count(n) && n < 8) &&
    typeof s.lastDaily === 'string' &&
    /^$|^\d{4}-\d{2}-\d{2}$/.test(s.lastDaily)
  );
}
function migrate(saved) {
  if (validSave(saved)) return saved;
  if (!saved || saved.version !== 1) return null;
  const count = (n) => Number.isSafeInteger(n) && n >= 0 && n < 1e9;
  if (
    !['coins', 'xp', 'harvests', 'deliveries', 'nextOrder'].every((k) => count(saved[k])) ||
    !['wheat', 'carrot', 'cotton'].includes(saved.selected) ||
    !Array.isArray(saved.plots) ||
    saved.plots.length < 6 ||
    saved.plots.length > 12 ||
    saved.plots.length % 2 ||
    !saved.inventory ||
    !saved.buildings ||
    !saved.jobs ||
    !Array.isArray(saved.claimed) ||
    !Array.isArray(saved.orderIds)
  )
    return null;
  const s = initial();
  for (const k of ['coins', 'xp', 'harvests', 'deliveries', 'nextOrder', 'selected', 'plots'])
    s[k] = saved[k];
  for (const k of ['wheat', 'carrot', 'cotton', 'flour', 'bread', 'milk']) {
    if (!count(saved.inventory[k])) return null;
    s.inventory[k] = saved.inventory[k];
  }
  for (const k of ['mill', 'bakery', 'stable']) {
    if (typeof saved.buildings[k] !== 'boolean') return null;
    s.buildings[k] = saved.buildings[k] ? 1 : 0;
    if (s.buildings[k]) s.positions[k] = defaultPositions[k];
    else delete s.positions[k];
  }
  for (const [k, j] of Object.entries(saved.jobs)) {
    const r = { mill: 'flour', bakery: 'bread', stable: 'milk' }[k];
    if (!r || !s.buildings[k]) return null;
    s.jobs[k] = [{ ...j, recipe: r, amount: recipes[r].amount }];
  }
  s.claimed = saved.claimed.filter((n) => Number.isInteger(n) && n >= 0 && n < 3);
  s.orderIds = saved.orderIds.map((n) => (Number.isInteger(n) && n >= 0 && n < 4 ? n : 0));
  s.capacity = Math.min(600, Math.max(60, Math.ceil((stock(s) + reserved(s)) / 30) * 30));
  return validSave(s) ? s : null;
}
function nextOrder(s) {
  const a = orderTemplates.map((o, i) => ({ o, i })).filter(({ o }) => o.level <= level(s));
  return a[s.nextOrder++ % a.length].i;
}
function tripOffer(s, kind) {
  const tier = Math.min(level(s), 4),
    items =
      kind === 'ship'
        ? tier >= 3
          ? { cheese: 2, fabric: 2 }
          : tier === 2
            ? { bread: 2, milk: 2 }
            : { wheat: 9, carrot: 3 }
        : tier >= 3
          ? { flour: 2, eggs: 2 }
          : tier === 2
            ? { corn: 3, flour: 2 }
            : { wheat: 6, carrot: 3 };
  return {
    items,
    reward: kind === 'ship' ? 100 + tier * 20 : 60 + tier * 15,
    xp: kind === 'ship' ? 30 : 18,
    time: kind === 'ship' ? 60 : 35,
    supply: ['wood', 'brick', 'nails'][s.shipments % 3],
  };
}
function settle(s, now = Date.now()) {
  let changed = false;
  for (const [k, j] of Object.entries(s.construction))
    if (now >= j.ready) {
      s.buildings[k] = 1;
      s.xp += 12;
      delete s.construction[k];
      changed = true;
    }
  return changed;
}
function act(s, type, arg, now = Date.now()) {
  settle(s, now);
  if (type === 'select') {
    if (!Object.hasOwn(crops, arg) || level(s) < crops[arg].level)
      return 'المحصول مقفل؛ ارتقِ بالمستوى أولًا';
    s.selected = arg;
    return 'اختر حقلًا لزراعة ' + crops[arg].name;
  }
  if (type === 'plot') {
    if (!Number.isInteger(arg) || arg < 0 || arg >= s.plots.length) return 'حقل غير متاح';
    const p = s.plots[arg];
    if (p) {
      if (now < p.ready) return 'المحصول ينمو… انتظر حتى يكتمل';
      const c = crops[p.crop];
      if (stock(s) + reserved(s) + c.yield > s.capacity)
        return 'المخزن ممتلئ؛ بِع المنتجات أو وسّع المخزن';
      s.inventory[p.crop] += c.yield;
      s.xp += c.xp;
      s.harvests++;
      s.plots[arg] = null;
      return `حصدت ${c.yield} ${c.name} +${c.xp} خبرة`;
    }
    const c = crops[s.selected];
    if (level(s) < c.level) return 'هذا المحصول لم يفتح بعد';
    if (s.coins < c.cost) return 'لا توجد دنانير كافية';
    s.coins -= c.cost;
    s.plots[arg] = { crop: s.selected, start: now, ready: now + c.time * 1000 };
    return `زُرع ${c.name}، جاهز خلال ${c.time} ثانية`;
  }
  if (type === 'expand') {
    if (s.plots.length >= 18) return 'وصلت إلى مساحة المزرعة القصوى';
    const cost = expandCost(s);
    if (s.coins < cost) return 'لا توجد دنانير كافية للتوسعة';
    s.coins -= cost;
    s.plots.push(null, null);
    s.xp += 10;
    return 'أضيف حقلان إلى مزرعتك!';
  }
  if (type === 'build') {
    const k = typeof arg === 'string' ? arg : arg?.kind,
      b = buildingTypes[k];
    if (!b) return 'مبنى غير متاح';
    if (s.buildings[k] || s.construction[k]) return 'المبنى موجود أو قيد البناء';
    if (level(s) < b.level) return `يتطلب المستوى ${b.level}`;
    if (population(s) < b.population) return 'وسّع بيت القرية لزيادة السكان';
    if (s.coins < b.cost) return 'لا توجد دنانير كافية';
    const p = typeof arg === 'string' ? defaultPositions[k] : arg.position;
    if (
      !Array.isArray(p) ||
      !buildSlots.some((x) => x[0] === p[0] && x[1] === p[1]) ||
      Object.values(s.positions).some((x) => x[0] === p[0] && x[1] === p[1])
    )
      return 'اختر قطعة أرض شاغرة';
    s.coins -= b.cost;
    s.positions[k] = [...p];
    s.construction[k] = { start: now, ready: now + b.time * 1000 };
    return 'بدأ بناء ' + b.name;
  }
  if (type === 'upgrade') {
    const b = buildingTypes[arg];
    if (!b || !s.buildings[arg]) return 'المبنى غير جاهز';
    if (s.buildings[arg] >= 3) return 'وصل المبنى إلى أعلى مستوى';
    const cost = upgradeCost(s, arg);
    if (s.coins < cost) return 'لا توجد دنانير كافية';
    s.coins -= cost;
    s.buildings[arg]++;
    s.xp += 10;
    return arg === 'house'
      ? 'ازداد سكان القرية؛ فتحت فرصًا جديدة'
      : 'تم التطوير؛ إنتاج أسرع وطابور أوسع';
  }
  if (type === 'move') {
    if (!arg || !s.buildings[arg.kind]) return 'اختر مبنى جاهزًا';
    const p = arg.position;
    if (
      !Array.isArray(p) ||
      !buildSlots.some((x) => x[0] === p[0] && x[1] === p[1]) ||
      Object.entries(s.positions).some(([k, x]) => k !== arg.kind && x[0] === p[0] && x[1] === p[1])
    )
      return 'هذه الأرض غير شاغرة';
    s.positions[arg.kind] = [...p];
    return 'نُقل المبنى إلى موقعه الجديد';
  }
  if (type === 'produce') {
    const legacy = { mill: 'flour', bakery: 'bread', stable: 'milk', coop: 'eggs' },
      id = Object.hasOwn(recipes, arg) ? arg : legacy[arg],
      r = recipes[id];
    if (!r || !s.buildings[r.building]) return 'ابنِ هذا المبنى أولًا';
    if (level(s) < r.level) return 'هذا المنتج مقفل';
    const q = (s.jobs[r.building] ??= []);
    if (q.length >= Math.min(3, s.buildings[r.building] + 1)) return 'طابور الإنتاج ممتلئ';
    if (!requirements(s, r.input)) return 'المواد غير كافية؛ اجمعها أولًا';
    const inputCount = Object.values(r.input).reduce((a, b) => a + b, 0);
    if (stock(s) + reserved(s) - inputCount + r.amount > s.capacity)
      return 'لا توجد مساحة كافية في المخزن';
    for (const [k, n] of Object.entries(r.input)) s.inventory[k] -= n;
    const start = Math.max(now, q.at(-1)?.ready ?? now);
    q.push({ recipe: id, amount: r.amount, start, ready: start + productionTime(s, r) });
    return 'أضيف ' + r.name + ' إلى طابور الإنتاج';
  }
  if (type === 'collect') {
    const q = s.jobs[arg];
    if (!q?.length || q[0].ready > now) return 'الإنتاج قيد العمل';
    let total = 0;
    while (q.length && q[0].ready <= now) {
      const j = q.shift(),
        r = recipes[j.recipe];
      s.inventory[r.output] += j.amount;
      s.produced += j.amount;
      s.xp += 8;
      total += j.amount;
    }
    if (!q.length) delete s.jobs[arg];
    return `استلمت ${total} منتجات من ${buildingTypes[arg].name}`;
  }
  if (type === 'deliver') {
    if (!Number.isInteger(arg) || arg < 0 || arg >= 3) return 'طلب غير موجود';
    const o = orderTemplates[s.orderIds[arg]];
    if (!requirements(s, o.items)) return 'أكمل المنتجات المطلوبة أولًا';
    for (const [k, n] of Object.entries(o.items)) s.inventory[k] -= n;
    s.coins += o.coins;
    s.xp += o.xp;
    s.deliveries++;
    s.orderIds[arg] = nextOrder(s);
    return `انطلقت القافلة! +${o.coins} دينار و${o.xp} خبرة`;
  }
  if (type === 'skipOrder') {
    if (!Number.isInteger(arg) || arg < 0 || arg >= 3) return 'طلب غير موجود';
    if (s.coins < 5) return 'تغيير الطلب يحتاج ٥ دنانير';
    s.coins -= 5;
    s.orderIds[arg] = nextOrder(s);
    return 'وصل طلب جديد إلى السوق';
  }
  if (type === 'trip') {
    if (!['caravan', 'ship'].includes(arg)) return 'وسيلة نقل غير متاحة';
    if (arg === 'ship' && level(s) < 2) return 'الميناء يفتح في المستوى ٢';
    if (s.trips[arg]) return 'الرحلة قيد العمل؛ استلمها بعد العودة';
    const o = tripOffer(s, arg);
    if (!requirements(s, o.items)) return 'أكمل حمولة الرحلة أولًا';
    for (const [k, n] of Object.entries(o.items)) s.inventory[k] -= n;
    s.trips[arg] = {
      start: now,
      ready: now + o.time * 1000,
      reward: o.reward,
      xp: o.xp,
      supply: o.supply,
    };
    return arg === 'ship' ? 'أبحرت السفينة مع خيرات مزرعتك' : 'انطلقت القافلة إلى المدن المجاورة';
  }
  if (type === 'collectTrip') {
    if (!['caravan', 'ship'].includes(arg)) return 'رحلة غير متاحة';
    const j = s.trips[arg];
    if (!j || j.ready > now) return 'الرحلة لم تعد بعد';
    s.coins += j.reward;
    s.xp += j.xp;
    s.supplies[j.supply] += 2;
    s.shipments++;
    s.trips[arg] = null;
    return `عادت الرحلة! +${j.reward} دينار ومواد لتوسعة المخزن`;
  }
  if (type === 'sell') {
    const id = arg?.good,
      n = arg?.amount ?? 1;
    if (!Object.hasOwn(goods, id) || ![1, 5].includes(n) || s.inventory[id] < n)
      return 'لا توجد كمية كافية للبيع';
    const price = Object.hasOwn(crops, id)
      ? Math.max(2, crops[id].cost + 2)
      : {
          feed: 4,
          flour: 8,
          bread: 20,
          milk: 8,
          eggs: 7,
          cheese: 23,
          fabric: 22,
          shirt: 50,
          jam: 35,
        }[id];
    s.inventory[id] -= n;
    s.coins += price * n;
    return `بِعت ${n} ${goods[id].name} مقابل ${price * n} دينار`;
  }
  if (type === 'barn') {
    if (s.barnLevel >= 10 || s.capacity >= 600) return 'وصل المخزن إلى سعته القصوى';
    const cost = 60 + s.barnLevel * 30;
    if (s.coins < cost) return 'لا توجد دنانير كافية';
    if (s.barnLevel >= 2 && !['wood', 'brick', 'nails'].every((k) => s.supplies[k] >= 1))
      return 'اجمع الخشب والطوب والمسامير من رحلات التجارة';
    s.coins -= cost;
    if (s.barnLevel >= 2) for (const k of ['wood', 'brick', 'nails']) s.supplies[k]--;
    s.barnLevel++;
    s.capacity = Math.min(600, s.capacity + 30);
    return 'اتسع المخزن لـ ' + s.capacity + ' منتجات';
  }
  if (type === 'claim') {
    const m = quests(s)[arg];
    if (!m || m.value < m.max || s.claimed.includes(arg)) return 'التحدي لم يكتمل بعد';
    s.claimed.push(arg);
    s.coins += m.reward;
    return `مكافأة التحدي: ${m.reward} دينار!`;
  }
  if (type === 'daily') {
    const day = (at) =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Riyadh' }).format(new Date(at));
    const date = day(now);
    if (s.lastDaily === date) return 'استلمت هدية اليوم بالفعل';
    const yesterday = day(now - 86400000);
    s.dailyStreak = s.lastDaily === yesterday ? Math.min(7, s.dailyStreak + 1) : 1;
    s.lastDaily = date;
    const reward = 25 + s.dailyStreak * 5;
    s.coins += reward;
    return `هدية اليوم ${reward} دينار · سلسلة ${s.dailyStreak} أيام`;
  }
  return 'إجراء غير متاح';
}
const FarmGame = {
  crops,
  goods,
  recipes,
  buildingTypes,
  buildSlots,
  defaultPositions,
  orderTemplates,
  initial,
  level,
  population,
  stock,
  reserved,
  requirements,
  expandCost,
  upgradeCost,
  quests,
  validSave,
  migrate,
  tripOffer,
  settle,
  act,
};
if (typeof module !== 'undefined') module.exports = FarmGame;
if (typeof window !== 'undefined') window.FarmGame = FarmGame;
