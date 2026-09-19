import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

import CinematicPreviewPage from './page';

describe('CinematicPreviewPage', () => {
  it('uses the current homepage instead of the retired design preview', () => {
    CinematicPreviewPage();

    expect(redirect).toHaveBeenCalledWith('/');
  });
});
