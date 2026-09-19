import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src', 'styles', 'live-reference.css'), 'utf8');
const allLiveStyles = [
  styles,
  readFileSync(join(process.cwd(), 'src', 'styles', 'royal-live.css'), 'utf8'),
].join('\n');

describe('live prestige surfaces', () => {
  it('uses the black and gold identity with environmental stage artwork only', () => {
    expect(styles).toContain('--live-prestige-black: #020406');
    // Gold rides the brand token authority in tokens.css (#d4af37).
    expect(styles).toContain('--live-prestige-gold: var(--brand-gold)');
    expect(styles).toContain("url('/live/royal-question-desktop-stage.webp')");
    expect(styles).toContain("url('/live/royal-results-stage.webp')");
    expect(allLiveStyles).not.toMatch(
      /url\('\/live\/(?:royal-host-dashboard|royal-broadcast-stage)\.png'\)/,
    );
  });

  it.each([
    '.royal-lobby-screen',
    '.royal-host-dashboard',
    '.royal-player-experience',
    '.audience-display',
    '.royal-finale-screen',
  ])('styles the %s state in the shared prestige layer', (selector) => {
    expect(styles).toContain(selector);
  });

  it('keeps the live player fullscreen and covers phone through wide desktop sizes', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'live', '[sessionId]', 'play', 'page.tsx'),
      'utf8',
    );

    expect(page).toContain("import { BroadcastLayout } from '@/components/layout';");
    expect(page).not.toContain('SiteLayout');
    expect(styles).toContain('@media (max-width: 48rem)');
    expect(styles).toContain('@media (min-width: 80rem)');
    expect(styles).toContain('min-block-size: 100svh');
  });

  it('keeps the host command center bounded on desktop screens', () => {
    expect(allLiveStyles).toContain('@media (min-width: 74.001rem)');
    expect(allLiveStyles).toContain('grid-template-rows: auto auto minmax(0, 1fr)');
    expect(allLiveStyles).toContain("grid-template-areas:\n    'ranking question answers'");
    expect(allLiveStyles).toContain("    'round-stats podium alerts'");
    expect(allLiveStyles).toContain('block-size: 100dvh');
    expect(allLiveStyles).toContain(
      '.royal-host-dashboard > .royal-host-dashboard-grid {\n    grid-row: 3;',
    );
  });

  it('uses one restrained motion system with a reduced-motion fallback', () => {
    expect(styles).toContain('--live-motion-enter: 480ms');
    expect(styles).toContain('--live-motion-ease: cubic-bezier(0.22, 1, 0.36, 1)');
    expect(styles).toContain('@keyframes live-prestige-rise');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('adapts the cinematic landing kit as a shared live stage layer', () => {
    expect(styles).toContain('--live-cinema-glow');
    expect(styles).toContain('--live-cinema-film-canvas');
    expect(styles).toContain('--live-cinema-ribbon');
    expect(styles).toContain('@keyframes live-cinema-ambient');
    expect(styles).toContain('@keyframes live-cinema-grain');
    expect(styles).toContain('@keyframes live-cinema-scan');
    expect(styles).toContain('@keyframes live-cinema-card-in');
    expect(styles).toContain("url('/live/royal-question-mobile-stage.webp')");
    expect(styles).toContain("url('/live/royal-results-stage.webp')");
  });
});
