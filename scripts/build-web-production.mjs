import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyProductionCi } from './production-ci-gate.mjs';

/** Keep release checks ahead of compilation on every production host. */
export async function buildWebProduction({
  env = process.env,
  verifyCi = verifyProductionCi,
  run = (command, args, options) => execFileSync(command, args, options),
} = {}) {
  const production = { ...env, DEPLOY_ENV: 'production' };
  await verifyCi({ env: production });
  run(process.execPath, ['scripts/voice-cloud-check.mjs'], {
    stdio: 'inherit',
    env: { ...production, LIVEKIT_MODE: 'cloud' },
  });
  for (const name of [
    '@tahaddi/contracts',
    '@tahaddi/database',
    '@tahaddi/domain',
    '@mamluk/world-map-core',
    '@mamluk/maplibre-adapter',
    '@tahaddi/web',
  ]) {
    run('corepack', ['pnpm', '--filter', name, 'build'], {
      stdio: 'inherit',
      env:
        name === '@tahaddi/web'
          ? { ...production, CIRCLE_NODE_TOTAL: '3', NODE_OPTIONS: '--max-old-space-size=4096' }
          : production,
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildWebProduction().catch((error) => {
    console.error(`[production-build] ${error.message}`);
    process.exitCode = 1;
  });
}
