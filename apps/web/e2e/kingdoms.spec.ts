import { expect, test } from '@playwright/test';

test.describe('Kingdoms authentication boundary', () => {
  test('redirects an anonymous player to sign in while retaining the kingdom destination', async ({
    page,
  }) => {
    await page.goto('/games/kingdoms');
    await expect(page).toHaveURL(/\/auth\/sign-in\/?\?next=%2Fgames%2Fkingdoms/);
    await expect(page.getByLabel('اسم المملكة')).toHaveCount(0);
  });

  test('rejects anonymous world reads and game commands', async ({ request, baseURL }) => {
    const worlds = await request.get('/api/kingdoms/worlds');
    expect(worlds.status()).toBe(401);
    const result = await request.post('/api/kingdoms', {
      headers: { Origin: baseURL! },
      data: {
        worldId: 'anonymous-world',
        idempotencyKey: 'anonymous-test-key',
        command: { type: 'found', name: 'مملكة الاختبار' },
      },
    });
    expect(result.status()).toBe(401);
  });

  test('rejects anonymous administrative changes', async ({ request, baseURL }) => {
    const result = await request.post('/api/admin/kingdoms', {
      headers: { Origin: baseURL! },
      data: { action: 'create', idempotencyKey: 'anonymous-admin-key', name: 'عالم الاختبار' },
    });
    expect(result.status()).toBe(401);
  });
});
