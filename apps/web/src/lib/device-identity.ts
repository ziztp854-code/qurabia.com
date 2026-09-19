const DEVICE_STORAGE_KEY = 'tahaddi.device-id.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function createBrowserUuid() {
  return globalThis.crypto.randomUUID();
}

export function getOrCreateDeviceId(
  storage: DeviceStorage = window.localStorage,
  createId: () => string = createBrowserUuid,
) {
  try {
    const existing = storage.getItem(DEVICE_STORAGE_KEY)?.trim() ?? '';
    if (UUID_PATTERN.test(existing)) return existing.toLowerCase();

    const generated = createId().trim().toLowerCase();
    if (!UUID_PATTERN.test(generated)) return '';
    storage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    const generated = createId().trim().toLowerCase();
    return UUID_PATTERN.test(generated) ? generated : '';
  }
}
