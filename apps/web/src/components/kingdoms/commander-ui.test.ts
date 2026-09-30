import { afterEach, describe, expect, it, vi } from 'vitest';
import { commanderText } from './commander-ui';
import { request } from './use-kingdoms';

afterEach(() => vi.unstubAllGlobals());
describe('commander localization', () => {
  it.each([
    'notOwned',
    'unavailable',
    'limit',
    'villageOccupied',
    'garrisonOccupied',
    'wrongOrigin',
  ])('translates the server business error %s in Arabic and English', (error) => {
    const key = `commander.error.${error}`;
    expect(commanderText(key)).not.toBe(key);
    expect(commanderText(key, 'en')).not.toBe(key);
  });
  it('turns a server assignment rejection into a readable player error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, error: 'commander.error.unavailable' }), {
            status: 409,
          }),
        ),
    );
    await expect(request('/api/kingdoms')).rejects.toThrow('القائد غير متاح الآن');
  });
  it('uses a safe readable fallback for an unknown commander error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, error: 'commander.error.future' }), {
            status: 409,
          }),
        ),
    );
    await expect(request('/api/kingdoms')).rejects.toThrow('القائد غير متاح الآن');
  });
});
