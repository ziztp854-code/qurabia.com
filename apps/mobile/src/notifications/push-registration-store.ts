import type { InstallationCapability } from './installation-capability';

export type PushRegistration = {
  token: string;
  ownerUserId: string;
  sessionId: string;
  installationId: string;
  revision: string;
};

type RegistrationState = {
  committed: PushRegistration | null;
  pending: PushRegistration | null;
};

export type PushRegistrationVault = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

const expoPushTokenPattern = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{20,200}\]$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRegistration(value: unknown): value is PushRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.token === 'string' &&
    expoPushTokenPattern.test(record.token) &&
    typeof record.ownerUserId === 'string' &&
    record.ownerUserId.length > 0 &&
    record.ownerUserId.length <= 128 &&
    typeof record.sessionId === 'string' &&
    record.sessionId.length > 0 &&
    record.sessionId.length <= 128 &&
    typeof record.installationId === 'string' &&
    uuidPattern.test(record.installationId) &&
    typeof record.revision === 'string' &&
    uuidPattern.test(record.revision)
  );
}

function parseState(serialized: string | null): RegistrationState {
  if (!serialized) return { committed: null, pending: null };
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { committed: null, pending: null };
    }
    const record = value as Record<string, unknown>;
    return {
      committed: isRegistration(record.committed) ? record.committed : null,
      pending: isRegistration(record.pending) ? record.pending : null,
    };
  } catch {
    return { committed: null, pending: null };
  }
}

function sameRegistration(left: PushRegistration, right: PushRegistration) {
  return (
    left.token === right.token &&
    left.ownerUserId === right.ownerUserId &&
    left.sessionId === right.sessionId &&
    left.installationId === right.installationId &&
    left.revision === right.revision
  );
}

export function createPushRegistrationStore(
  vault: PushRegistrationVault,
  createRevision: () => string,
) {
  let serial: Promise<unknown> = Promise.resolve();
  const exclusively = <T>(operation: () => Promise<T>) => {
    const result = serial.then(operation, operation);
    serial = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const read = async () => parseState(await vault.get());
  const write = async (state: RegistrationState) => {
    if (!state.committed && !state.pending) return vault.remove();
    return vault.set(JSON.stringify(state));
  };

  return {
    getRegistration: () => exclusively(async () => (await read()).committed),
    getCleanupCandidate: (ownerUserId: string, sessionId: string) =>
      exclusively(async () => {
        const state = await read();
        return (
          [state.pending, state.committed].find(
            (candidate) =>
              candidate?.ownerUserId === ownerUserId && candidate.sessionId === sessionId,
          ) ?? null
        );
      }),
    reconcileRegistration: (
      token: string,
      ownerUserId: string,
      sessionId: string,
      capability: InstallationCapability,
      register: (input: {
        token: string;
        previousToken: string | null;
        previousRegistrationRevision: string | null;
        installationId: string;
        installationSecret: string;
        registrationRevision: string;
      }) => Promise<{ registrationRevision: string }>,
    ) =>
      exclusively(async () => {
        const state = await read();
        if (
          !state.pending &&
          state.committed?.token === token &&
          state.committed.ownerUserId === ownerUserId &&
          state.committed.sessionId === sessionId &&
          state.committed.installationId === capability.installationId
        ) {
          return state.committed;
        }
        const reusablePending =
          state.pending?.token === token &&
          state.pending.ownerUserId === ownerUserId &&
          state.pending.sessionId === sessionId &&
          state.pending.installationId === capability.installationId
            ? state.pending
            : null;
        const candidate: PushRegistration = reusablePending ?? {
          token,
          ownerUserId,
          sessionId,
          installationId: capability.installationId,
          revision: createRevision(),
        };
        await write({ committed: state.committed, pending: candidate });
        const response = await register({
          token,
          previousToken:
            state.committed?.installationId === capability.installationId
              ? state.committed.token
              : null,
          previousRegistrationRevision:
            state.committed?.installationId === capability.installationId
              ? state.committed.revision
              : null,
          installationId: capability.installationId,
          installationSecret: capability.installationSecret,
          registrationRevision: candidate.revision,
        });
        if (response.registrationRevision !== candidate.revision) {
          throw new Error('The server acknowledged a different push registration revision.');
        }
        await write({ committed: candidate, pending: null });
        return candidate;
      }),
    clearIfMatches: (expected: PushRegistration) =>
      exclusively(async () => {
        const state = await read();
        const committed =
          state.committed && sameRegistration(state.committed, expected) ? null : state.committed;
        const pending =
          state.pending && sameRegistration(state.pending, expected) ? null : state.pending;
        if (committed === state.committed && pending === state.pending) return false;
        await write({ committed, pending });
        return true;
      }),
  };
}
