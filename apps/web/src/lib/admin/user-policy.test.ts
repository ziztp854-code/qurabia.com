import { describe, expect, it } from 'vitest';
import { decideUserManagementUpdate } from './user-policy';

const target = {
  id: 'target-user',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  tokenVersion: 4,
};

describe('admin user-management policy', () => {
  it('allows an administrator to change another user', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'admin-user',
        target,
        requestedRole: 'MODERATOR',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 2,
      }),
    ).toEqual({ allowed: true });
  });

  it('supports the content editor role', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'admin-user',
        target,
        requestedRole: 'CONTENT_EDITOR',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 2,
      }),
    ).toEqual({ allowed: true });
  });

  it('prevents administrators from changing their own access', () => {
    expect(
      decideUserManagementUpdate({
        actorId: target.id,
        target,
        requestedRole: 'MODERATOR',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 2,
      }),
    ).toEqual({ allowed: false, reason: 'SELF_MANAGEMENT_FORBIDDEN' });
  });

  it('protects the final active administrator', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'another-admin',
        target: { ...target, role: 'ADMIN' },
        requestedRole: 'USER',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 1,
      }),
    ).toEqual({ allowed: false, reason: 'LAST_ACTIVE_ADMIN' });
  });

  it('rejects a stale form after the account changed', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'admin-user',
        target,
        requestedRole: 'USER',
        requestedStatus: 'SUSPENDED',
        expectedTokenVersion: 3,
        activeAdminCount: 2,
      }),
    ).toEqual({ allowed: false, reason: 'STALE_USER_VERSION' });
  });

  it('rejects updates that do not change anything', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'admin-user',
        target,
        requestedRole: 'USER',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 2,
      }),
    ).toEqual({ allowed: false, reason: 'NO_CHANGES' });
  });

  it('protects the primary manager from changes by administrators', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'admin-user',
        target: { ...target, role: 'OWNER' },
        requestedRole: 'ADMIN',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 3,
      }),
    ).toEqual({ allowed: false, reason: 'PROTECTED_MANAGER' });
  });

  it('reserves the manager role from ordinary role updates', () => {
    expect(
      decideUserManagementUpdate({
        actorId: 'owner-user',
        target,
        requestedRole: 'OWNER',
        requestedStatus: 'ACTIVE',
        expectedTokenVersion: 4,
        activeAdminCount: 3,
      }),
    ).toEqual({ allowed: false, reason: 'MANAGER_ROLE_RESERVED' });
  });
});
