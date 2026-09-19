import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearLadderGuestIdentity,
  getOrCreateLadderGuestId,
  getOrCreateLadderGuestToken,
  isLadderSessionStorageAvailable,
  saveLastLadderRoomCode,
  getLastLadderRoomCode,
} from './ladder-session-storage';

const LADDER_GUEST_ID_KEY = 'tahaddi-ladder-guest-id';
const LADDER_GUEST_TOKEN_KEY = 'tahaddi-ladder-guest-token';
const LADDER_LAST_ROOM_KEY = 'tahaddi-ladder-last-room';

describe('ladder-session-storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('reports session storage as available in jsdom', () => {
    expect(isLadderSessionStorageAvailable()).toBe(true);
  });

  it('generates and persists a stable guest id on first call', () => {
    const id = getOrCreateLadderGuestId();
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(sessionStorage.getItem(LADDER_GUEST_ID_KEY)).toBe(id);
    expect(getOrCreateLadderGuestId()).toBe(id);
  });

  it('generates and persists a 64-character hex token on first call', () => {
    const token = getOrCreateLadderGuestToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionStorage.getItem(LADDER_GUEST_TOKEN_KEY)).toBe(token);
    expect(getOrCreateLadderGuestToken()).toBe(token);
  });

  it('regenerates a guest id when the stored value is missing or too short', () => {
    sessionStorage.setItem(LADDER_GUEST_ID_KEY, 'short');
    const id = getOrCreateLadderGuestId();
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(id).not.toBe('short');
  });

  it('regenerates a token when the stored value is missing or too short', () => {
    sessionStorage.setItem(LADDER_GUEST_TOKEN_KEY, 'weak');
    const token = getOrCreateLadderGuestToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe('weak');
  });

  it('returns different ids across calls when storage is empty (randomness check)', () => {
    sessionStorage.clear();
    const first = getOrCreateLadderGuestId();
    sessionStorage.clear();
    const second = getOrCreateLadderGuestId();
    expect(first).not.toBe(second);
  });

  it('clears the persisted identity and lets the next call mint a new pair', () => {
    const id = getOrCreateLadderGuestId();
    const token = getOrCreateLadderGuestToken();
    expect(sessionStorage.getItem(LADDER_GUEST_ID_KEY)).toBe(id);
    expect(sessionStorage.getItem(LADDER_GUEST_TOKEN_KEY)).toBe(token);

    clearLadderGuestIdentity();

    expect(sessionStorage.getItem(LADDER_GUEST_ID_KEY)).toBeNull();
    expect(sessionStorage.getItem(LADDER_GUEST_TOKEN_KEY)).toBeNull();

    const nextId = getOrCreateLadderGuestId();
    const nextToken = getOrCreateLadderGuestToken();
    expect(nextId).not.toBe(id);
    expect(nextToken).not.toBe(token);
  });

  it('survives a simulated tab reload (re-reads persisted id/token)', () => {
    const id = getOrCreateLadderGuestId();
    const token = getOrCreateLadderGuestToken();
    // Simulate reading on a fresh page mount (no re-creation, just re-read)
    expect(getOrCreateLadderGuestId()).toBe(id);
    expect(getOrCreateLadderGuestToken()).toBe(token);
  });

  it('persists the last room code in localStorage so a return visit can rejoin', () => {
    saveLastLadderRoomCode('AB12CD34');
    expect(localStorage.getItem(LADDER_LAST_ROOM_KEY)).toBe('AB12CD34');
    expect(getLastLadderRoomCode()).toBe('AB12CD34');
  });

  it('clears the last room code when given an empty string', () => {
    saveLastLadderRoomCode('AB12CD34');
    saveLastLadderRoomCode('');
    expect(localStorage.getItem(LADDER_LAST_ROOM_KEY)).toBeNull();
    expect(getLastLadderRoomCode()).toBe('');
  });

  it('returns empty string when localStorage has no last room', () => {
    expect(getLastLadderRoomCode()).toBe('');
  });
});
