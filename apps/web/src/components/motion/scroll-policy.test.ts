import { describe, expect, it } from 'vitest';
import { preventSmoothScroll, supportsSmoothScroll } from './scroll-policy';

describe('scroll boundaries', () => {
  it('only opts browsing pages into Lenis, never game or map routes', () => {
    expect(supportsSmoothScroll('/')).toBe(true);
    expect(supportsSmoothScroll('/games')).toBe(true);
    expect(supportsSmoothScroll('/games/')).toBe(true);
    for (const route of [
      '/games/kingdoms',
      '/games/kingdoms/world-map',
      '/games/chess',
      '/live',
      '/join',
      null,
    ]) {
      expect(supportsSmoothScroll(route)).toBe(false);
    }
  });
  it('protects independent interactive surfaces', () => {
    for (const html of [
      '<canvas></canvas>',
      '<div class="maplibregl-map"></div>',
      '<input>',
      '<div role="dialog"></div>',
      '<div data-lenis-prevent></div>',
      '<div draggable="true"></div>',
    ]) {
      const container = document.createElement('div');
      container.innerHTML = html;
      expect(preventSmoothScroll(container.firstElementChild as HTMLElement)).toBe(true);
    }
  });
  it('lets nested panels scroll natively but allows the document', () => {
    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    Object.defineProperties(panel, { scrollHeight: { value: 600 }, clientHeight: { value: 200 } });
    expect(preventSmoothScroll(panel)).toBe(true);
    expect(preventSmoothScroll(document.body)).toBe(false);
  });
});
