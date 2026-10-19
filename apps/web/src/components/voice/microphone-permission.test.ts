import { afterEach, expect, it, vi } from 'vitest';
import { requestVoiceMicrophone } from './microphone-permission';
afterEach(() => vi.unstubAllGlobals());
it('requests permission only when invoked and releases every preview track immediately', async () => {
  vi.stubGlobal('isSecureContext', true);
  const stop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }, { stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  expect(getUserMedia).not.toHaveBeenCalled();
  await requestVoiceMicrophone();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  expect(stop).toHaveBeenCalledTimes(2);
});
it('provides an actionable refusal instead of submitting a request', async () => {
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    },
  });
  await expect(requestVoiceMicrophone()).rejects.toThrow('إعدادات الموقع');
});
