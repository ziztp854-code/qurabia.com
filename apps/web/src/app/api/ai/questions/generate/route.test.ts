import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/ai/questions/generate', () => {
  it('returns 410 Gone because question-bank AI drafting is permanently retired', async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({
      ok: false,
      message: 'تم إيقاف توليد الأسئلة بالذكاء الاصطناعي من بنك الأسئلة نهائيًا.',
    });
  });
});
