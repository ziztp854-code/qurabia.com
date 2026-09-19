import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, generateRoomCode, isRoomCode, normalizeRoomCode } from './room-code';

describe('room code allocation primitives', () => {
  it('uses a relay-friendly alphabet without visually ambiguous characters', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it('normalizes pasted room codes before validation', () => {
    expect(normalizeRoomCode(' ab cd 23 ')).toBe('ABCD23');
    expect(isRoomCode(' ab cd 23 ')).toBe(true);
  });

  it('generates valid server-owned room codes', () => {
    for (let index = 0; index < 64; index += 1) {
      const code = generateRoomCode();

      expect(code).toHaveLength(6);
      expect(isRoomCode(code)).toBe(true);
    }
  });

  it('rejects unsupported code lengths', () => {
    expect(() => generateRoomCode(5)).toThrow(RangeError);
    expect(() => generateRoomCode(9)).toThrow(RangeError);
  });
});
