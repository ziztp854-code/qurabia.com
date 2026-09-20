import * as SecureStore from 'expo-secure-store';
import type { SessionVault } from './session-store';

const SESSION_KEY = 'tahaddi.mobile.session.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureSessionVault: SessionVault = {
  get: () => SecureStore.getItemAsync(SESSION_KEY, secureOptions),
  set: (value) => SecureStore.setItemAsync(SESSION_KEY, value, secureOptions),
  remove: () => SecureStore.deleteItemAsync(SESSION_KEY, secureOptions),
};
