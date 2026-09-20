import type { InstallationCapability } from './installation-capability';
import type { PushRegistration } from './push-registration-store';

type Dependencies = {
  registration: PushRegistration;
  capability: InstallationCapability;
  unregister(input: {
    expoPushToken: string;
    installationId: string;
    installationSecret: string;
    registrationRevision: string;
  }): Promise<unknown>;
  clear(registration: PushRegistration): Promise<boolean>;
};

export async function unregisterPushRegistration({
  registration,
  capability,
  unregister,
  clear,
}: Dependencies) {
  if (capability.installationId !== registration.installationId) {
    throw new Error('The push registration belongs to another installation.');
  }
  await unregister({
    expoPushToken: registration.token,
    installationId: registration.installationId,
    installationSecret: capability.installationSecret,
    registrationRevision: registration.revision,
  });
  return clear(registration);
}
