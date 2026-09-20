import NetInfo from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type NetworkState = 'checking' | 'online' | 'offline';
const NetworkContext = createContext<NetworkState>('checking');

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState>('checking');

  useEffect(
    () =>
      NetInfo.addEventListener((next) => {
        const reachable = next.isConnected === true && next.isInternetReachable !== false;
        setState(reachable ? 'online' : 'offline');
      }),
    [],
  );

  return <NetworkContext.Provider value={state}>{children}</NetworkContext.Provider>;
}

export function useNetworkState() {
  return useContext(NetworkContext);
}
