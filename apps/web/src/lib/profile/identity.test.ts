import { describe, expect, it } from 'vitest';
import { profileIdentitySchema } from './identity';
const input = { displayName: ' عبدالعزيز ', username: ' Aziz_24 ', bio: 'أحب التحدّي' };
describe('profile identity validation', () => {
  it('normalizes names and makes usernames case-insensitive before persistence', () => {
    expect(profileIdentitySchema.parse(input)).toEqual({
      displayName: 'عبدالعزيز',
      username: 'aziz_24',
      bio: input.bio,
    });
  });
  it.each(['ab', 'a'.repeat(31), 'has space', '@someone', 'مستخدم', 'user/name'])(
    'rejects invalid username %s',
    (username) => {
      expect(profileIdentitySchema.safeParse({ ...input, username }).success).toBe(false);
    },
  );
  it.each(['_member', '123member', 'a'.repeat(30)])(
    'preserves compatible usernames %s',
    (username) => {
      expect(profileIdentitySchema.safeParse({ ...input, username }).success).toBe(true);
    },
  );
  it('bounds names and biography and disallows bidi impersonation while allowing Arabic/newlines', () => {
    for (const patch of [
      { displayName: ' ' },
      { displayName: 'a'.repeat(81) },
      { displayName: 'اسم\u202eevil' },
      { bio: 'b'.repeat(501) },
    ])
      expect(profileIdentitySchema.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(profileIdentitySchema.safeParse({ ...input, bio: 'سطر أول\nسطر ثانٍ' }).success).toBe(
      true,
    );
  });
});
