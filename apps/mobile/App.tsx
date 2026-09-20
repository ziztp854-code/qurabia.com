import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro/400Regular';
import { ReadexPro_600SemiBold } from '@expo-google-fonts/readex-pro/600SemiBold';
import { ReadexPro_700Bold } from '@expo-google-fonts/readex-pro/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from './src/auth/session-provider';
import { NetworkProvider } from './src/network/network-provider';
import { RootNavigator } from './src/navigation/root-navigator';
import { NotificationProvider } from './src/notifications/notification-provider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NetworkProvider>
        <SessionProvider>
          <NotificationProvider>
            <RootNavigator />
          </NotificationProvider>
        </SessionProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
