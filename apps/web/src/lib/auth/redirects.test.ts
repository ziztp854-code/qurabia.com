import { describe, expect, it } from 'vitest';
import { sanitizeCallbackPath } from './redirects';

describe('auth redirects', () => {
  it('keeps safe relative callback paths', () => {
    expect(sanitizeCallbackPath('/profile?tab=security')).toBe('/profile?tab=security');
  });

  it('rejects external and protocol-relative callback paths', () => {
    expect(sanitizeCallbackPath('https://evil.example')).toBe('/dashboard');
    expect(sanitizeCallbackPath('//evil.example/path')).toBe('/dashboard');
  });

  it('rejects backslash based callback paths', () => {
    expect(sanitizeCallbackPath('/\\evil')).toBe('/dashboard');
  });
});
