import { describe, expect, it, vi } from 'vitest';
import { getOrCreateDeviceId } from './device-identity';

function createStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe('getOrCreateDeviceId', () => {
  it('reuses the same valid identifier when the contestant returns', () => {
    const existing = '018f5e2a-7b66-7b2c-9a51-2397f59d67e1';
    const storage = createStorage(existing);
    const createId = vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

    expect(getOrCreateDeviceId(storage, createId)).toBe(existing);
    expect(getOrCreateDeviceId(storage, createId)).toBe(existing);
    expect(createId).not.toHaveBeenCalled();
  });

  it('replaces malformed storage with a newly generated UUID', () => {
    const generated = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const storage = createStorage('<script>not-a-device</script>');

    expect(getOrCreateDeviceId(storage, () => generated)).toBe(generated);
    expect(storage.setItem).toHaveBeenCalledWith('tahaddi.device-id.v1', generated);
  });
});
