// Temporary entry point for the existing Render build command.
// Remove after qurabia-web uses scripts/build-web-production.mjs.
import { verifyProductionCi } from './production-ci-gate.mjs';

verifyProductionCi().catch((error) => {
  console.error(`[production-ci] ${error.message}`);
  process.exitCode = 1;
});
