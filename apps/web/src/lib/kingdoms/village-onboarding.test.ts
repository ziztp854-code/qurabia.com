import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { completeVillageOnboarding, readVillageOnboarding } from './village-onboarding';

const identity = { id: 'alice', tokenVersion: 2 };
const completedAt = new Date('2026-10-02T12:00:00.000Z');

function database(user: unknown, completed: boolean = true) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    $queryRaw: vi
      .fn()
      .mockResolvedValue(completed ? [{ villageOnboardingCompletedAt: completedAt }] : []),
  } as unknown as DatabaseClient;
}

describe('Village onboarding account boundary', () => {
  it('keeps a new authenticated account eligible for onboarding', async () => {
    const db = database({ status: 'ACTIVE', tokenVersion: 2, villageOnboardingCompletedAt: null });
    expect(await readVillageOnboarding(identity, db)).toEqual({
      completed: false,
      completedAt: null,
    });
  });

  it('returns the account timestamp without requiring a world or active season', async () => {
    const db = database({
      status: 'ACTIVE',
      tokenVersion: 2,
      villageOnboardingCompletedAt: completedAt,
    });
    expect(await readVillageOnboarding(identity, db)).toEqual({
      completed: true,
      completedAt: '2026-10-02T12:00:00.000Z',
    });
  });

  it.each([
    null,
    { status: 'SUSPENDED', tokenVersion: 2, villageOnboardingCompletedAt: null },
    { status: 'ACTIVE', tokenVersion: 3, villageOnboardingCompletedAt: null },
  ])('rejects invalid stored account state %j', async (user) => {
    await expect(readVillageOnboarding(identity, database(user))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('returns only the timestamp issued by the database on completion', async () => {
    expect(await completeVillageOnboarding(identity, database(null))).toEqual({
      completed: true,
      completedAt: '2026-10-02T12:00:00.000Z',
    });
  });

  it('rejects completion if the account fails authorization during the atomic update', async () => {
    await expect(completeVillageOnboarding(identity, database(null, false))).rejects.toMatchObject({
      status: 401,
    });
  });
});
