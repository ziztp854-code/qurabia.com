import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro/400Regular';
import { ReadexPro_600SemiBold } from '@expo-google-fonts/readex-pro/600SemiBold';
import { ReadexPro_700Bold } from '@expo-google-fonts/readex-pro/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PlayerIdentity } from './src/live-room';
import { GamesScreen } from './src/screens/games-screen';
import { JoinScreen } from './src/screens/join-screen';
import { RoomScreen } from './src/screens/room-screen';
import { FontsReadyProvider } from './src/ui';

type Route = { name: 'join' } | { name: 'games' } | { name: 'room'; identity: PlayerIdentity };

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  });
  const [route, setRoute] = useState<Route>({ name: 'join' });
  const [lastPlayerName, setLastPlayerName] = useState('');

  return (
    <SafeAreaProvider>
      <FontsReadyProvider value={fontsLoaded && !fontError}>
        <StatusBar style="light" />
        {route.name === 'room' ? (
          <RoomScreen
            key={route.identity.participantId}
            identity={route.identity}
            onLeave={() => setRoute({ name: 'join' })}
          />
        ) : route.name === 'games' ? (
          <GamesScreen onBack={() => setRoute({ name: 'join' })} />
        ) : (
          <JoinScreen
            initialName={lastPlayerName}
            onJoined={(identity) => {
              setLastPlayerName(identity.displayName);
              setRoute({ name: 'room', identity });
            }}
            onBrowseGames={() => setRoute({ name: 'games' })}
          />
        )}
      </FontsReadyProvider>
    </SafeAreaProvider>
  );
}
