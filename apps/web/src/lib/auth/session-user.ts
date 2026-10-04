type SessionIdentity = {
  id: string;
  tokenVersion: number;
};

export type StoredIdentity = {
  id: string;
  role: string;
  status: string;
  tokenVersion: number;
};

export function isSessionUserCurrent(
  sessionUser: SessionIdentity,
  storedUser: StoredIdentity | null,
): storedUser is StoredIdentity {
  return (
    storedUser?.status === 'ACTIVE' &&
    storedUser.id === sessionUser.id &&
    storedUser.tokenVersion === sessionUser.tokenVersion
  );
}
