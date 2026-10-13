const crops = {
  wheat: { name: 'قمح', icon: '🌾', cost: 2, time: 12, yield: 3, xp: 3 },
  carrot: { name: 'جزر', icon: '🥕', cost: 4, time: 22, yield: 3, xp: 5 },
  cotton: { name: 'قطن', icon: '🌿', cost: 6, time: 35, yield: 2, xp: 8 },
};
const goods = {
  ...crops,
  flour: { name: 'دقيق', icon: '🪨' },
  bread: { name: 'خبز', icon: '🥖' },
  milk: { name: 'حليب', icon: '🥛' },
};
const recipes = {
  mill: { name: 'الطاحونة', icon: '⚙️', input: { wheat: 3 }, output: 'flour', time: 15 },
  bakery: { name: 'المخبز', icon: '🥖', input: { flour: 2 }, output: 'bread', time: 20 },
  stable: { name: 'الحظيرة', icon: '🐄', input: { wheat: 2 }, output: 'milk', time: 18 },
};
const orderTemplates = [
  { name: 'خبّاز الحي', icon: '👳', items: { wheat: 6 }, coins: 32, xp: 14 },
  { name: 'قافلة الشام', icon: '🐪', items: { carrot: 6, cotton: 2 }, coins: 75, xp: 30 },
  { name: 'مائدة القلعة', icon: '🏰', items: { bread: 2, milk: 2 }, coins: 120, xp: 45 },
  { name: 'تاجر السوق', icon: '⚖️', items: { flour: 3 }, coins: 55, xp: 20 },
];
const initial = () => ({
  version: 1,
  coins: 140,
  xp: 0,
  harvests: 0,
  deliveries: 0,
  selected: 'wheat',
  plots: Array.from({ length: 6 }, () => null),
  inventory: { wheat: 6, carrot: 0, cotton: 0, flour: 0, bread: 0, milk: 0 },
  jobs: {},
  orderIds: [0, 1, 2],
  nextOrder: 3,
  claimed: [],
  buildings: { mill: true, bakery: false, stable: false },
});
function level(s) {
  return 1 + Math.floor(s.xp / 60);
}
function requirements(s, items) {
  return Object.entries(items).every(([k, n]) => s.inventory[k] >= n);
}
function validSave(s) {
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const time = (n) => Number.isFinite(n) && n >= 0;
  return Boolean(
    s &&
    s.version === 1 &&
    count(s.coins) &&
    count(s.xp) &&
    count(s.harvests) &&
    count(s.deliveries) &&
    count(s.nextOrder) &&
    Object.hasOwn(crops, s.selected) &&
    Array.isArray(s.plots) &&
    s.plots.length >= 6 &&
    s.plots.length <= 12 &&
    s.plots.length % 2 === 0 &&
    s.plots.every(
      (p) =>
        p === null ||
        (p && Object.hasOwn(crops, p.crop) && time(p.start) && time(p.ready) && p.ready >= p.start),
    ) &&
    s.inventory &&
    Object.keys(goods).every((k) => count(s.inventory[k])) &&
    s.buildings &&
    Object.keys(recipes).every((k) => typeof s.buildings[k] === 'boolean') &&
    s.jobs &&
    Object.entries(s.jobs).every(
      ([k, j]) =>
        Object.hasOwn(recipes, k) &&
        s.buildings[k] &&
        j &&
        time(j.start) &&
        time(j.ready) &&
        j.ready >= j.start,
    ) &&
    Array.isArray(s.orderIds) &&
    s.orderIds.length === 3 &&
    s.orderIds.every((n) => count(n) && n < orderTemplates.length) &&
    Array.isArray(s.claimed) &&
    s.claimed.every((n) => count(n) && n < 3),
  );
}
function act(s, type, arg, now = Date.now()) {
  if (type === 'plot') {
    if (!Number.isInteger(arg) || arg < 0 || arg >= s.plots.length) return 'حقل غير متاح';
    const p = s.plots[arg];
    if (p) {
      if (now < p.ready) return 'المحصول ينمو… انتظر حتى يكتمل';
      const c = crops[p.crop];
      s.inventory[p.crop] += c.yield;
      s.xp += c.xp;
      s.harvests++;
      s.plots[arg] = null;
      return `حصدت ${c.yield} ${c.name} +${c.xp} خبرة`;
    }
    const c = crops[s.selected];
    if (s.coins < c.cost) return 'لا توجد دنانير كافية';
    s.coins -= c.cost;
    s.plots[arg] = { crop: s.selected, start: now, ready: now + c.time * 1000 };
    return `زُرع ${c.name}، جاهز خلال ${c.time} ثانية`;
  }
  if (type === 'expand') {
    const cost = 50 + s.plots.length * 5;
    if (s.plots.length >= 12) return 'وصلت إلى مساحة المزرعة القصوى';
    if (s.coins < cost) return 'لا توجد دنانير كافية للتوسعة';
    s.coins -= cost;
    s.plots.push(null, null);
    s.xp += 10;
    return 'أضيف حقلان إلى مزرعتك!';
  }
  if (type === 'build') {
    if (!recipes[arg] || s.buildings[arg]) return 'المبنى موجود';
    if (level(s) < 2) return 'يفتح البناء عند المستوى ٢';
    const cost = arg === 'bakery' ? 85 : 65;
    if (s.coins < cost) return 'لا توجد دنانير كافية';
    s.coins -= cost;
    s.buildings[arg] = true;
    s.xp += 15;
    return 'اكتمل بناء ' + recipes[arg].name;
  }
  if (type === 'produce') {
    const r = recipes[arg];
    if (!r || !s.buildings[arg]) return 'ابنِ هذا المبنى أولًا';
    const j = s.jobs[arg];
    if (j) {
      if (now < j.ready) return 'الإنتاج قيد العمل';
      s.inventory[r.output]++;
      s.xp += 8;
      delete s.jobs[arg];
      return 'استلمت ' + goods[r.output].name;
    }
    if (!requirements(s, r.input)) return 'المواد غير كافية؛ اجمعها أولًا';
    for (const [k, n] of Object.entries(r.input)) s.inventory[k] -= n;
    s.jobs[arg] = { start: now, ready: now + r.time * 1000 };
    return 'بدأ الإنتاج في ' + r.name;
  }
  if (type === 'deliver') {
    if (!Number.isInteger(arg) || arg < 0 || arg >= s.orderIds.length) return 'طلب غير موجود';
    const o = orderTemplates[s.orderIds[arg]];
    if (!requirements(s, o.items)) return 'أكمل المنتجات المطلوبة أولًا';
    for (const [k, n] of Object.entries(o.items)) s.inventory[k] -= n;
    s.coins += o.coins;
    s.xp += o.xp;
    s.deliveries++;
    s.orderIds[arg] = s.nextOrder % orderTemplates.length;
    s.nextOrder++;
    return `انطلقت القافلة! +${o.coins} دينار و${o.xp} خبرة`;
  }
  if (type === 'claim') {
    const milestones = [
      { done: s.harvests >= 3, reward: 35 },
      { done: s.deliveries >= 2, reward: 60 },
      { done: level(s) >= 3, reward: 100 },
    ];
    const m = milestones[arg];
    if (!m || !m.done || s.claimed.includes(arg)) return 'التحدي لم يكتمل بعد';
    s.claimed.push(arg);
    s.coins += m.reward;
    return `مكافأة التحدي: ${m.reward} دينار!`;
  }
  return '';
}
if (typeof module !== 'undefined')
  module.exports = { initial, act, level, crops, recipes, validSave };
