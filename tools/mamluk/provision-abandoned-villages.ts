/** Run from apps/web: node --conditions=react-server --import tsx ../../tools/mamluk/provision-abandoned-villages.ts --dry-run --output <path>
 * Then --apply --plan <path>. Requires an explicitly supplied DATABASE_URL; never loads .env files.
 * No API route, worker or new-world creation calls this maintenance operation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getPrismaClient } from '../../apps/web/src/lib/auth/prisma';
import {
  applyCurrentWorldAbandoned,
  readCurrentWorldAbandoned,
} from '../../apps/web/src/lib/kingdoms/abandoned-village-provisioning';
const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Explicit DATABASE_URL required; credential files are not loaded');
  if (args.includes('--apply') === args.includes('--dry-run'))
    throw new Error('Choose exactly one: --dry-run or --apply');
  const db = getPrismaClient();
  try {
    if (args.includes('--dry-run')) {
      const output = option('--output');
      if (!output) throw new Error('--output is required');
      const plan = await readCurrentWorldAbandoned(db);
      fs.writeFileSync(path.resolve(output), JSON.stringify(plan, null, 2));
      console.log(
        JSON.stringify({
          dryRun: true,
          ...plan.summary,
          expectedFingerprint: plan.expectedFingerprint,
        }),
      );
    } else {
      const input = option('--plan');
      if (!input) throw new Error('--plan is required');
      const plan = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')) as Awaited<
        ReturnType<typeof readCurrentWorldAbandoned>
      >;
      const result = await applyCurrentWorldAbandoned(plan, db);
      console.log(JSON.stringify({ appliedAt: new Date().toISOString(), ...result }));
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(
    JSON.stringify({
      failed: true,
      message: error instanceof Error ? error.message : 'Rollout failed',
    }),
  );
  process.exitCode = 1;
});
