// The former economic farm has been retired. This is a catalogue, not an economy simulation.
import { defaultKingdomsConfig } from '../apps/web/src/lib/kingdoms/config';
import { cropKeys, farmCrops, farmQuote } from '../apps/web/src/lib/kingdoms/sultan-farm';
console.log('| النبات | دقائق النمو | حصادات الفتح | تكلفة البذور | عائد الموارد |');
console.log('|---|---:|---:|---:|---:|');
for (const crop of cropKeys) {
  const quote = farmQuote(defaultKingdomsConfig, 0, crop);
  console.log(
    `| ${farmCrops[crop].name} | ${quote.growMs / 60000} | ${farmCrops[crop].unlockHarvests} | 0 | 0 |`,
  );
}
