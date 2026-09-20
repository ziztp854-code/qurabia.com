import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createPushRegistrationStore, type PushRegistrationVault } from './push-registration-store';

const PUSH_REGISTRATION_KEY = 'tahaddi.mobile.push-registration.v2';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const secureVault: PushRegistrationVault = {
  get: () => SecureStore.getItemAsync(PUSH_REGISTRATION_KEY, secureOptions),
  set: (value) => SecureStore.setItemAsync(PUSH_REGISTRATION_KEY, value, secureOptions),
  remove: () => SecureStore.deleteItemAsync(PUSH_REGISTRATION_KEY, secureOptions),
};

export const pushTokenStore = createPushRegistrationStore(secureVault, () => Crypto.randomUUID());
export type { PushRegistration, PushRegistrationVault } from './push-registration-store';
