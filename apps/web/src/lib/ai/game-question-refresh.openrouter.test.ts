import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFreshGameQuestions } from './game-question-refresh';

describe('ladder provider isolation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('makes no HTTP request to another provider when UnoRouter is missing', async () => {
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('UNOROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway');
    vi.stubEnv('XAI_API_KEY', 'test-xai');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
