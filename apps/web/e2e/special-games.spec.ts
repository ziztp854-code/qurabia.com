import { expect, test } from '@playwright/test';

test('الألعاب المحذوفة وصفحات الانضمام لم تعد متاحة', async ({ request }) => {
  for (const path of [
    '/games/parallel-world',
    '/games/reverse-time',
    '/games/infiltrator',
    '/games/risk',
    '/games/scrambled-words-live',
    '/games/scrambled-words-live/host',
    '/games/scrambled-words-live/join/ABC123',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
