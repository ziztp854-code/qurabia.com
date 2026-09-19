import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_QUESTION_IMAGE_BYTES,
  QuestionImageError,
  uploadQuestionImage,
  validateQuestionImage,
} from './media';

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('validateQuestionImage', () => {
  it('accepts a valid PNG image', async () => {
    const file = new File([pngHeader], 'question.png', { type: 'image/png' });

    await expect(validateQuestionImage(file)).resolves.toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
  });

  it('rejects a file whose declared type does not match its content', async () => {
    const file = new File([pngHeader], 'question.jpg', { type: 'image/jpeg' });

    await expect(validateQuestionImage(file)).rejects.toThrow(QuestionImageError);
  });

  it('rejects images larger than three megabytes', async () => {
    const file = new File([new Uint8Array(MAX_QUESTION_IMAGE_BYTES + 1)], 'large.png', {
      type: 'image/png',
    });

    await expect(validateQuestionImage(file)).rejects.toThrow(
      'حجم الصورة يجب ألا يتجاوز 3 ميجابايت.',
    );
  });
});

describe('uploadQuestionImage', () => {
  it('creates the restricted bucket when needed and uploads through the server API', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-key');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([pngHeader], 'question.png', { type: 'image/png' });
    const imageUrl = await uploadQuestionImage(file, 'user-123');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://project.supabase.co/storage/v1/bucket');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer server-only-key' }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      id: 'question-images',
      public: true,
      file_size_limit: MAX_QUESTION_IMAGE_BYTES,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    });
    expect(fetchMock.mock.calls[2]?.[0]).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/question-images\/user-123\/.+\.png$/,
    );
    expect(imageUrl).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/question-images\/user-123\/.+\.png$/,
    );
  });
});
