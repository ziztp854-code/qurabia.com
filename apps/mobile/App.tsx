import { Cairo_400Regular } from '@expo-google-fonts/cairo/400Regular';
import { Cairo_600SemiBold } from '@expo-google-fonts/cairo/600SemiBold';
import { Cairo_700Bold } from '@expo-google-fonts/cairo/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthProvider';
import { NativeApp } from './src/screens/native-app';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold,
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <NativeApp fontsReady={fontsLoaded && !fontError} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
