import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  buildWebSecurityHeaders,
  embeddedGameSecurityHeaders,
} from '../../../../config/web-security.mjs';

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Evaluate the actual Next headers method without loading secrets or config plugins. */
export async function nextHeaderRules(): Promise<HeaderRule[]> {
  const code = readFileSync(new NodeURL('../../next.config.ts', import.meta.url), 'utf8');
  const source = ts.createSourceFile('next.config.ts', code, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(source) !== 'nextConfig' ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      )
        continue;
      const headers = declaration.initializer.properties.find(
        (property): property is ts.MethodDeclaration =>
          ts.isMethodDeclaration(property) && property.name.getText(source) === 'headers',
      );
      if (headers)
        return runInNewContext(`({${headers.getText(source)}}).headers()`, {
          securityHeaders: buildWebSecurityHeaders({ NODE_ENV: 'production' }),
          embeddedGameSecurityHeaders,
          isProduction: true,
        });
    }
  }
  throw new Error('Missing Next.js header rules');
}
