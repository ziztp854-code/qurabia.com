import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('tokens.css', 'utf8');
const globals = readFileSync('src/app/globals.css', 'utf8');
const internalStyles = readFileSync('src/styles/brand-internal.css', 'utf8');
const homeStyles = readFileSync('src/styles/home-luxury.css', 'utf8');
const gameCatalogStyles = readFileSync('src/styles/game-catalog.css', 'utf8');
const prestigeHomeStyles = readFileSync('src/components/home/prestige-home.module.css', 'utf8');

function collectCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectCssFiles(full));
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

function countHex(content: string): number {
  return content.match(/#[0-9a-fA-F]{3,8}\b/g)?.length ?? 0;
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

/**
 * Raw hex values outside tokens.css are a maintenance budget, not a ban:
 * the visual debt is migrated gradually, but it must never grow again.
 * When a legitimate edit needs a new hex, first replace an existing one.
 * scripts/check-css-hex-budget.mjs enforces the same ceiling at build time.
 */
const HARDCODED_HEX_BUDGET = 1410;

describe('theme color tokens', () => {
  it('defines distinct explicit colors for dark and light modes', () => {
    expect(tokens).toMatch(/:root\[data-theme=['"]dark['"]\]/);
    expect(tokens).toMatch(/:root\[data-theme=['"]light['"]\]/);
    expect(tokens).toContain('--background: #06020a');
    expect(tokens).toContain('--background: #fefbf6');
    expect(tokens).toContain('--foreground: #111827');
  });

  it('keeps the final home theme and mobile alignment rules after the base identity', () => {
    expect(homeStyles.indexOf('Final responsive theme layer')).toBeGreaterThan(
      homeStyles.indexOf('Official Tahaddi identity'),
    );
    expect(homeStyles).toContain('.ivory-home .section.home-how-section');
    expect(homeStyles).toMatch(/@media \(max-width: 40rem\)[\s\S]*grid-template-columns: 1fr/);
  });

  it('keeps the embedded home game catalog readable in dark mode', () => {
    expect(gameCatalogStyles).toMatch(
      /:root\[data-theme=['"]dark['"]\] \.ivory-home \.gc-wrapper--embedded[\s\S]*--input: #172033/,
    );
    expect(gameCatalogStyles).toMatch(
      /:root\[data-theme=['"]dark['"]\] \.ivory-home \.gc-wrapper--embedded[\s\S]*--text-soft: #e7ddce/,
    );
    expect(gameCatalogStyles).toMatch(
      /\.ivory-home \.gc-wrapper--embedded \.gc-card-foot a,[\s\S]*color: #080d12/,
    );
  });

  it('keeps single-authority definitions for conflicted brand and state tokens', () => {
    // --brand-ink used to be defined twice with conflicting values.
    expect(countOccurrences(tokens, '--brand-ink:')).toBe(1);
    // --success/--danger exist once per theme; the dead bare-root shadows are gone.
    expect(countOccurrences(tokens, '--success:')).toBe(2);
    expect(countOccurrences(tokens, '--danger:')).toBe(2);
  });

  it('keeps root theme colors in tokens.css instead of late stylesheet overrides', () => {
    expect(globals).not.toMatch(/:root\[data-theme='dark'\][\s\S]{0,250}--page-bg:/);
    expect(internalStyles).not.toMatch(/:root\[data-theme='light'\][\s\S]{0,250}--background:/);
    expect(tokens).toContain('--technical-accent: #00cfef');
    expect(tokens).toContain('--technical-accent: #007f99');
  });

  it('gives the prestige homepage an explicit readable light palette', () => {
    expect(prestigeHomeStyles).toContain(
      ":global(:root[data-theme='light'] .home-site-layout:has(.prestigeHome))",
    );
    expect(prestigeHomeStyles).toContain('--home-bg: #fefbf6');
    expect(prestigeHomeStyles).toContain('.brand-logo-copy strong');
  });

  it('derives quiz verdicts and timer tones from the semantic state colors', () => {
    expect(tokens).toContain('--quiz-correct: var(--success)');
    expect(tokens).toContain('--quiz-wrong: var(--danger)');
    expect(tokens).toContain('--timer-safe: var(--success)');
    expect(tokens).toContain('--timer-warning: var(--warning)');
    expect(tokens).toContain('--timer-danger: var(--danger)');
  });

  it('completes the light theme for gold, quiz, and admin tokens', () => {
    const lightBlock = tokens.match(/:root\[data-theme='light'\][\s\S]*?\n}/g)?.join('\n') ?? '';
    for (const name of [
      '--gold: #8f6911',
      '--gold-foreground: #fefbf6',
      '--quiz-option-a: #9a6a1e',
      '--quiz-option-b: #c2410c',
      '--quiz-option-c: #9a6700',
      '--quiz-option-d: #c62828',
      '--admin-verified: #0369a1',
      '--admin-verified-highlight: #0284c7',
    ]) {
      expect(lightBlock).toContain(name);
    }
  });

  it('keeps contrast-safe live answer tiles', () => {
    // #e65100 with cream ink measured 3.59:1; the deeper orange passes AA.
    expect(tokens).toContain('--live-option-orange: #c43c00');
    expect(tokens).toContain('--accent-foreground: #1a0f00');
  });

  it('does not let the hardcoded hex debt grow outside tokens.css', () => {
    const cssFiles = [
      ...collectCssFiles('src'),
    ];
    const total = cssFiles.reduce((sum, file) => sum + countHex(readFileSync(file, 'utf8')), 0);
    expect(total).toBeLessThanOrEqual(HARDCODED_HEX_BUDGET);
  });
});
