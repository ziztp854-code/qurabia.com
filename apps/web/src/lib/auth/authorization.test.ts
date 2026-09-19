import { describe, expect, it } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  PERMISSION_LABELS,
  canAccessAdmin,
  canManageQuestions,
  hasPermission,
  normalizeAllowedRoles,
  permissionsForRole,
  type AppRole,
} from './authorization';

describe('admin authorization', () => {
  it('allows every administrative role into its scoped console', () => {
    expect(canAccessAdmin('OWNER')).toBe(true);
    expect(canAccessAdmin('ADMIN')).toBe(true);
    expect(canAccessAdmin('CONTENT_EDITOR')).toBe(true);
    expect(canAccessAdmin('MODERATOR')).toBe(true);
    expect(canAccessAdmin('USER')).toBe(false);
  });

  it('denies unknown and missing roles', () => {
    expect(canAccessAdmin('SUPER_ADMIN')).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
  });

  it('يحصر إدارة بنك الأسئلة في الأدمن والمالك', () => {
    expect(canManageQuestions('OWNER')).toBe(true);
    expect(canManageQuestions('ADMIN')).toBe(true);
    expect(canManageQuestions('CONTENT_EDITOR')).toBe(false);
    expect(canManageQuestions('MODERATOR')).toBe(false);
    expect(canManageQuestions('USER')).toBe(false);
    expect(canManageQuestions(undefined)).toBe(false);
  });

  it('deduplicates known roles and drops unknown values', () => {
    expect(normalizeAllowedRoles(['OWNER', 'ADMIN', 'ADMIN', 'CONTENT_EDITOR'])).toEqual([
      'OWNER',
      'ADMIN',
      'CONTENT_EDITOR',
    ]);
  });

  it.each([
    ['OWNER', ADMIN_PERMISSIONS],
    ['ADMIN', ADMIN_PERMISSIONS],
    ['CONTENT_EDITOR', ['MANAGE_CONTENT', 'PUBLISH_CONTENT', 'VIEW_REPORTS']],
    ['MODERATOR', ['MANAGE_ROOMS', 'VIEW_REPORTS']],
    ['USER', []],
  ] satisfies [AppRole, readonly string[]][])(
    'applies the complete permission matrix for %s',
    (role, expectedPermissions) => {
      for (const permission of ADMIN_PERMISSIONS) {
        expect(hasPermission(role, permission)).toBe(
          expectedPermissions.some((expected) => expected === permission),
        );
      }
    },
  );

  it('denies unknown roles and permissions by default', () => {
    expect(hasPermission('SUPER_ADMIN', 'MANAGE_USERS')).toBe(false);
    expect(hasPermission('ADMIN', 'DELETE_AUDIT_LOG')).toBe(false);
  });

  it('يعيد صلاحيات الدور الفعلية لا تسميات الأدوار', () => {
    expect(permissionsForRole('OWNER')).toEqual(ADMIN_PERMISSIONS);
    expect(permissionsForRole('USER')).toEqual([]);
    expect(permissionsForRole('UNKNOWN')).toEqual([]);
  });

  it('يوفّر تسمية عربية لكل صلاحية إدارية', () => {
    expect(Object.keys(PERMISSION_LABELS)).toEqual([...ADMIN_PERMISSIONS]);
    expect(PERMISSION_LABELS.MANAGE_USERS).toBe('إدارة المستخدمين');
    expect(PERMISSION_LABELS.VIEW_AUDIT).toBe('قراءة سجل النشاط');
  });
});
