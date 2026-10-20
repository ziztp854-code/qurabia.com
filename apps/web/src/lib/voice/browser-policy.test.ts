import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

// Evaluate only the declarative headers method, without running config plugins or loading env files.
async function nextHeaderRules(): Promise<HeaderRule[]> {
  const code = readFileSync(new NodeURL('../../../next.config.ts', import.meta.url), 'utf8');
  const source = ts.createSourceFile('next.config.ts', code, ts.ScriptTarget.Latest, true);
  let headers: ts.MethodDeclaration | undefined;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(source) !== 'nextConfig' ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      )
        continue;
      headers = declaration.initializer.properties.find(
        (property): property is ts.MethodDeclaration =>
          ts.isMethodDeclaration(property) && property.name.getText(source) === 'headers',
      );
    }
  }
  if (!headers) throw new Error('Missing Next.js header rules');
  return runInNewContext(`({${headers.getText(source)}}).headers()`, {
    securityHeaders: [{ key: 'Permissions-Policy', value: 'microphone=()' }],
    isProduction: false,
  });
}

describe('voice microphone browser permissions', () => {
  it('allows same-origin microphone capture only on voice documents on both hosting paths', async () => {
    const next = await nextHeaderRules();
    const vercel = JSON.parse(
      readFileSync(new NodeURL('../../../../../vercel.json', import.meta.url), 'utf8'),
    ) as { headers: HeaderRule[] };
    for (const rules of [next, vercel.headers]) {
      const voice = rules.find((rule) => rule.source === '/voice/:path*');
      expect(voice?.headers.find((header) => header.key === 'Permissions-Policy')?.value).toBe(
        'camera=(), microphone=(self), geolocation=(), interest-cohort=()',
      );
      const general = rules.find((rule) => ['/:path*', '/(.*)'].includes(rule.source));
      expect(
        general?.headers.find((header) => header.key === 'Permissions-Policy')?.value,
      ).toContain('microphone=()');
      expect(rules.indexOf(voice!)).toBeGreaterThan(rules.indexOf(general!));
    }
  });
});
