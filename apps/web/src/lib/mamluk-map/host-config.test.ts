import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/** Read the declarative host contract without executing plugins or loading application credentials. */
function serverExternalPackages(): readonly string[] {
  const source = ts.createSourceFile(
    'next.config.ts',
    readFileSync(new NodeURL('../../../next.config.ts', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(source) !== 'nextConfig' ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      )
        continue;
      const property = declaration.initializer.properties.find(
        (item) =>
          ts.isPropertyAssignment(item) && item.name.getText(source) === 'serverExternalPackages',
      );
      if (
        !property ||
        !ts.isPropertyAssignment(property) ||
        !ts.isArrayLiteralExpression(property.initializer)
      )
        return [];
      return property.initializer.elements.filter(ts.isStringLiteral).map((item) => item.text);
    }
  }
  return [];
}

describe('Mamluk map production host module resolution', () => {
  it('preserves Node CommonJS polygon operations instead of bundling incompatible ESM exports', () => {
    expect(serverExternalPackages()).toEqual(
      expect.arrayContaining(['@mamluk/world-map-core', 'polygon-clipping']),
    );
  });
});
