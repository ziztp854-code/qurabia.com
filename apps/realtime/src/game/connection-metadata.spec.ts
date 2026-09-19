import { getLiveConnectionMetadata } from './connection-metadata.js';

function createClient() {
  return {
    id: 'socket-1',
    handshake: {
      address: '10.0.0.5',
      headers: {
        'x-forwarded-for': '203.0.113.44, 10.0.0.5',
        'user-agent': 'Mozilla/5.0 Chrome/125.0',
      },
    },
  };
}

describe('getLiveConnectionMetadata', () => {
  it('stores a deterministic HMAC instead of the raw browser identifier', () => {
    const metadata = getLiveConnectionMetadata(
      createClient() as never,
      '018f5e2a-7b66-7b2c-9a51-2397f59d67e1',
      'device-hash-test-secret',
    );

    expect(metadata.deviceHash).toBe(
      '4f539b26ffe67c80e4609e18fa26d0aa703b36c99303baa9ef0f7c0a2b1e58db',
    );
    expect(JSON.stringify(metadata)).not.toContain('018f5e2a');
  });

  it('ignores malformed or untrusted browser identifiers', () => {
    const metadata = getLiveConnectionMetadata(
      createClient() as never,
      '<script>not-a-device</script>',
      'device-hash-test-secret',
    );

    expect(metadata.deviceHash).toBeNull();
  });
});
