export type InstallationCapability = {
  installationId: string;
  installationSecret: string;
};

export type InstallationCapabilityVault = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
};

const capabilityPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCapability(value: unknown): value is InstallationCapability {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.installationId === 'string' &&
    uuidPattern.test(record.installationId) &&
    typeof record.installationSecret === 'string' &&
    capabilityPattern.test(record.installationSecret)
  );
}

export function createInstallationCapabilityStore(
  vault: InstallationCapabilityVault,
  createCapability: () => Promise<InstallationCapability>,
) {
  let inFlight: Promise<InstallationCapability> | null = null;
  return {
    getOrCreate() {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        const serialized = await vault.get();
        if (serialized) {
          try {
            const parsed: unknown = JSON.parse(serialized);
            if (isCapability(parsed)) return parsed;
          } catch {
            // Replace malformed keychain data with a fresh capability.
          }
        }
        const created = await createCapability();
        if (!isCapability(created))
          throw new Error('Secure installation capability generation failed.');
        await vault.set(JSON.stringify(created));
        return created;
      })().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
