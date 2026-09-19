import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const guardPath = path.resolve(process.cwd(), '../../scripts/check-no-ladder-prisma-models.mjs');

describe('ladder Prisma model guard', () => {
  it('rejects direct access to every legacy ladder model', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qurabia-ladder-guard-'));

    try {
      const models = ['ladderRoom', 'ladderQuestion', 'ladderTeam'];
      writeFileSync(
        path.join(root, 'sample.ts'),
        models.map((model) => `prisma.${model}.findMany();`).join('\n'),
      );

      const result = spawnSync(process.execPath, [guardPath, '--root', root], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('sample.ts');
      for (const model of models) expect(result.stderr).toContain(model);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
