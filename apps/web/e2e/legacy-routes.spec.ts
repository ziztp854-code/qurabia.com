import { expect, test } from '@playwright/test';

const removedRoutes = ['/demo/waiting', '/demo/question', '/demo/results', '/demo/winners'];

test('تعيد مسارات العرض التجريبي القديمة 404', async ({ request }) => {
  for (const route of removedRoutes) {
    const response = await request.get(route);
    expect(response.status(), `${route} should be removed`).toBe(404);
  }
});
