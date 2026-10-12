import { expect, test } from '@playwright/test';
import { LETTER_QUESTION_POOL } from '../src/lib/letter-game/questions';

test('يصنف ألعاب الشاشة الواحدة جماعيًا ويفلتر الألعاب الفردية', async ({ page }) => {
  await page.goto('/games');
  const group = page.getByRole('list', { name: 'الألعاب الجماعية' });
  await expect(group.getByRole('heading', { name: 'تحدي الحروف' })).toBeVisible();
  await expect(group.getByRole('heading', { name: 'لوحة الفئات' })).toBeVisible();
  await expect(group.getByRole('heading', { name: 'البلوت', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الألعاب الفردية', exact: true }).click();
  await expect(group).toHaveCount(0);
  await expect(
    page
      .getByRole('list', { name: 'الألعاب الفردية' })
      .getByRole('heading', { name: 'من سيربح المليون؟' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'جميع الألعاب', exact: true }).click();
  await expect(group).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('يغير سؤال الحرف ويعتمد مجموعة الذكاء الاصطناعي دون كشف الإجابة', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  await page.goto('/games/letter-challenge');
  await page.getByRole('button', { name: /الحرف أ، خلية متاحة/ }).click();
  const original = await page.locator('#active-question-title').textContent();
  await page.getByRole('button', { name: 'إظهار الإجابة للمضيف' }).click();
  await page.getByRole('button', { name: 'تغيير السؤال', exact: true }).click();
  await expect(page.locator('#active-question-title')).not.toHaveText(original!);
  await expect(page.getByText('الإجابة محجوبة')).toBeVisible();
  await expect(page.getByText('دور الفريق الأخضر')).toBeVisible();

  const questions = LETTER_QUESTION_POOL.map((question, index) => ({
    prompt: `سؤال جديد للمراجعة ${index}: ${question.prompt}`,
    answer: question.answer,
    options: [],
    answerIndex: 0,
    category: 'ثقافة',
    explanation: 'شرح الإجابة الجديدة.',
    letter: question.letter,
    slot: (index % 25) + 1,
    difficulty: 'EASY',
  }));
  await page.route('**/api/ai/game-questions/generate', async (route) => {
    expect(route.request().postDataJSON().excludePrompts.length).toBeGreaterThan(0);
    await route.fulfill({
      json: { ok: true, game: 'letter-challenge', questions, batchId: 'browser-batch' },
    });
  });
  await page
    .getByText('جلب أسئلة جديدة بالذكاء الاصطناعي', { exact: true })
    .filter({ hasNot: page.locator('svg') })
    .click();
  await page.getByRole('button', { name: 'جلب أسئلة جديدة بالذكاء الاصطناعي' }).click();
  await expect(page.getByText('50 سؤالًا جديدًا للمراجعة')).toBeVisible();
  await expect(page.locator('#active-question-title')).not.toHaveText(questions[0]!.prompt);
  await page.getByRole('button', { name: 'اعتماد الأسئلة وبدء جولة جديدة' }).click();
  await page.getByRole('button', { name: /الحرف أ، خلية متاحة/ }).click();
  await expect(page.locator('#active-question-title')).toHaveText(questions[0]!.prompt);
  await expect(page.getByText('الإجابة محجوبة')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
