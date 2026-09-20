import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  createInstallationCapabilityStore,
  type InstallationCapability,
} from './installation-capability';

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function createSecureCapability(): Promise<InstallationCapability> {
  return {
    installationId: Crypto.randomUUID(),
    installationSecret: bytesToHex(await Crypto.getRandomBytesAsync(32)),
  };
}

const INSTALLATION_CAPABILITY_KEY = 'tahaddi.mobile.installation-capability.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const installationCapabilityStore = createInstallationCapabilityStore(
  {
    get: () => SecureStore.getItemAsync(INSTALLATION_CAPABILITY_KEY, secureOptions),
    set: (value) => SecureStore.setItemAsync(INSTALLATION_CAPABILITY_KEY, value, secureOptions),
  },
  createSecureCapability,
);

export type { InstallationCapability } from './installation-capability';
