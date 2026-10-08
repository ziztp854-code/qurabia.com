import { defaultKingdomsConfig } from '../apps/web/src/lib/kingdoms/config';
import { cropKeys, farmCrops, farmQuote } from '../apps/web/src/lib/kingdoms/sultan-farm';
import { hourlyYield } from '../apps/web/src/lib/kingdoms/simulation';

console.log('| المستوى | المحصول | النمو بالساعات | تكلفة الحوض غذاء | حصاد الحوض غذاء | صافي 12 حوضًا بالدورة | صافي 12 حوضًا/ساعة |');
console.log('|---:|---|---:|---:|---:|---:|---:|');
for (const level of [1, 3, 5]) for (const crop of cropKeys) {
  if (level < farmCrops[crop].minLevel) continue;
  const quote = farmQuote(defaultKingdomsConfig, level, crop);
  const net = (quote.harvestFood - quote.seedFood) * 12;
  console.log(`| ${level} | ${farmCrops[crop].name} | ${quote.growMs / 3600000} | ${quote.seedFood} | ${quote.harvestFood} | ${net.toFixed(3)} | ${(net * 3600000 / quote.growMs).toFixed(3)} |`);
}
for (const level of [1, 3, 5])
  console.log(`المستوى ${level}: الإنتاج السلبي الإجمالي ${hourlyYield(defaultKingdomsConfig, 'food', level)}/ساعة؛ حد صافي الزراعة مع التناوب ${(hourlyYield(defaultKingdomsConfig, 'food', level) * .30 / .95).toFixed(3)}/ساعة.`);

