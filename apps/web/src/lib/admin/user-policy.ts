import type { AppRole } from '../auth/authorization';

export const MANAGED_USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type ManagedUserStatus = (typeof MANAGED_USER_STATUSES)[number];

type ManagedUser = {
  id: string;
  role: AppRole;
  status: string;
  tokenVersion: number;
};

type UserManagementRequest = {
  actorId: string;
  target: ManagedUser;
  requestedRole: AppRole;
  requestedStatus: ManagedUserStatus;
  expectedTokenVersion: number;
  activeAdminCount: number;
};

export type UserManagementDenial =
  | 'SELF_MANAGEMENT_FORBIDDEN'
  | 'PROTECTED_MANAGER'
  | 'MANAGER_ROLE_RESERVED'
  | 'LAST_ACTIVE_ADMIN'
  | 'STALE_USER_VERSION'
  | 'NO_CHANGES';

export function decideUserManagementUpdate(
  request: UserManagementRequest,
): { allowed: true } | { allowed: false; reason: UserManagementDenial } {
  if (request.actorId === request.target.id) {
    return { allowed: false, reason: 'SELF_MANAGEMENT_FORBIDDEN' };
  }

  if (request.target.role === 'OWNER') {
    return { allowed: false, reason: 'PROTECTED_MANAGER' };
  }

  if (request.requestedRole === 'OWNER') {
    return { allowed: false, reason: 'MANAGER_ROLE_RESERVED' };
  }

  if (request.expectedTokenVersion !== request.target.tokenVersion) {
    return { allowed: false, reason: 'STALE_USER_VERSION' };
  }

  if (
    request.target.role === request.requestedRole &&
    request.target.status === request.requestedStatus
  ) {
    return { allowed: false, reason: 'NO_CHANGES' };
  }

  const removesActiveAdmin =
    request.target.role === 'ADMIN' &&
    request.target.status === 'ACTIVE' &&
    (request.requestedRole !== 'ADMIN' || request.requestedStatus !== 'ACTIVE');
  if (removesActiveAdmin && request.activeAdminCount <= 1) {
    return { allowed: false, reason: 'LAST_ACTIVE_ADMIN' };
  }

  return { allowed: true };
}
