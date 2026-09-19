import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

test('redirects anonymous users from protected pages', async ({ page }) => {
  await page.goto('/dashboard/');
  await expect(page).toHaveURL(/\/auth\/sign-in\/?\?next=%2Fdashboard/);

  await page.goto('/profile/');
  await expect(page).toHaveURL(/\/auth\/sign-in\/?\?next=%2Fprofile/);

  await page.goto('/quizzes/new/');
  await expect(page).toHaveURL(/\/auth\/sign-in\/?\?next=%2Fquizzes%2Fnew/);

  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/login\/?\?next=%2Fadmin/);

  await page.goto('/admin/content/');
  await expect(page).toHaveURL(/\/admin\/login\/?\?next=%2Fadmin%2Fcontent/);
});

test('renders auth entry points', async ({ page }) => {
  await page.goto('/auth/sign-up/');
  await expect(page.getByRole('heading', { name: 'إنشاء حساب' })).toBeVisible();

  await page.goto('/auth/sign-in/');
  await expect(page.getByRole('heading', { name: 'دخول المضيفين' })).toBeVisible();

  await page.goto('/auth/recover/');
  await expect(page.getByRole('heading', { name: 'استعادة الحساب' })).toBeVisible();

  await page.goto('/auth/reset-password/example-token/');
  await expect(page.getByRole('heading', { name: 'إعادة تعيين كلمة المرور' })).toBeVisible();

  await page.goto('/admin/login/');
  await expect(page.getByRole('heading', { name: 'دخول الإدارة' })).toBeVisible();
});

test('keeps the public quizzes list available without a session', async ({ page }) => {
  await page.goto('/quizzes/');
  await expect(page.getByRole('heading', { name: 'المسابقات', exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test.describe('database-backed auth flow', () => {
  test.describe.configure({ timeout: 60_000 });

  test.skip(
    process.env.RUN_AUTH_E2E !== 'true',
    'Requires disposable database credentials and RUN_AUTH_E2E=true.',
  );

  test('registers, signs in, signs out, and protects dashboard/profile', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.test`;
    const password = 'StrongPass123';

    await page.goto('/auth/sign-up/');
    await page.getByLabel('الاسم الظاهر').fill('مستخدم اختبار');
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'إنشاء حساب' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'تم استلام الطلب' })).toBeVisible();

    await page.goto('/auth/sign-in/');
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'دخول بالبريد' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/admin/');
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByRole('heading', { name: 'لا تملك هذه الصلاحية' })).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/quizzes/new/');
    await expect(page.getByRole('heading', { name: 'منشئ المسابقة', level: 1 })).toBeVisible();
    await page.getByLabel('عنوان المسابقة').fill('مسودة Playwright محفوظة');
    await page.getByRole('button', { name: 'حفظ المسودة محليًا' }).click();
    await page.reload();
    await expect(page.getByLabel('عنوان المسابقة')).toHaveValue('مسودة Playwright محفوظة');

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/profile/');
    await expect(page.getByRole('heading', { name: 'الملف الشخصي' })).toBeVisible();

    await page.getByRole('button', { name: 'خروج' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3000/');

    await page.goto('/dashboard/');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});

test.describe('administrator console', () => {
  test.skip(
    process.env.RUN_ADMIN_E2E !== 'true' ||
      !process.env.ADMIN_E2E_EMAIL ||
      !process.env.ADMIN_E2E_PASSWORD,
    'Requires a disposable administrator account and RUN_ADMIN_E2E=true.',
  );

  test('opens the real admin console for an administrator', async ({ page }) => {
    await page.goto('/admin/login/');
    await page.getByLabel('البريد الإلكتروني').fill(process.env.ADMIN_E2E_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.ADMIN_E2E_PASSWORD!);
    await page.getByRole('button', { name: 'دخول بالبريد' }).click();

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole('heading', { name: 'إدارة تحدّي' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'الصلاحيات' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'سجل النشاط' })).toBeVisible();
  });
});
