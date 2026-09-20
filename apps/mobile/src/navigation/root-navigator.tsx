import {
  DarkTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StartupScreen, SignInScreen, SignUpScreen, WelcomeScreen } from '../screens/auth-screens';
import { HostGameScreen, PlayerGameScreen } from '../screens/game-screens';
import { CreateRoomScreen, JoinRoomScreen, RoomLobbyScreen } from '../screens/lobby-screens';
import { HomeScreen, LobbyHubScreen, ProfileScreen, SettingsScreen } from '../screens/main-screens';
import { useSession } from '../auth/session-provider';
import { theme } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.colors.gold,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.borderSoft,
    notification: theme.colors.cyan,
  },
};

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tahaddi://', 'https://qurabia.com'],
  config: {
    screens: {
      Welcome: '',
      SignIn: 'auth/sign-in',
      SignUp: 'auth/sign-up',
      Main: {
        screens: {
          Home: 'home',
          Lobby: 'lobby',
          Profile: 'profile',
          Settings: 'settings',
        },
      },
      JoinRoom: 'join/:roomCode?',
      CreateRoom: 'rooms/create',
    },
  },
};

function MainTabs() {
  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.gold,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarActiveBackgroundColor: theme.colors.surfaceStrong,
        tabBarStyle: {
          minHeight: 68,
          paddingTop: 9,
          paddingBottom: 9,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderSoft,
        },
        tabBarLabelStyle: { fontFamily: theme.typography.semibold, fontSize: 13 },
        tabBarItemStyle: {
          minHeight: theme.touch.minimum,
          marginHorizontal: 3,
          borderRadius: theme.radius.sm,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <MainTab.Screen name="Home" component={HomeScreen} options={{ title: 'الرئيسية' }} />
      <MainTab.Screen name="Lobby" component={LobbyHubScreen} options={{ title: 'اللوبي' }} />
      <MainTab.Screen name="Profile" component={ProfileScreen} options={{ title: 'ملفي' }} />
      <MainTab.Screen name="Settings" component={SettingsScreen} options={{ title: 'الإعدادات' }} />
    </MainTab.Navigator>
  );
}

export function RootNavigator() {
  const { mode } = useSession();
  if (mode === 'booting') return <StartupScreen />;

  return (
    <NavigationContainer theme={navigationTheme} linking={linking} direction="rtl">
      <RootStack.Navigator
        initialRouteName={mode === 'authenticated' || mode === 'guest' ? 'Main' : 'Welcome'}
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontFamily: theme.typography.bold },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <RootStack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="SignIn"
          component={SignInScreen}
          options={{ title: 'تسجيل الدخول' }}
        />
        <RootStack.Screen
          name="SignUp"
          component={SignUpScreen}
          options={{ title: 'إنشاء حساب' }}
        />
        <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <RootStack.Screen
          name="JoinRoom"
          component={JoinRoomScreen}
          options={{ title: 'الانضمام' }}
        />
        <RootStack.Screen
          name="CreateRoom"
          component={CreateRoomScreen}
          options={{ title: 'إنشاء غرفة' }}
        />
        <RootStack.Screen
          name="RoomLobby"
          component={RoomLobbyScreen}
          options={{ title: 'اللوبي' }}
        />
        {mode === 'authenticated' ? (
          <RootStack.Screen
            name="HostGame"
            component={HostGameScreen}
            options={{ title: 'شاشة المضيف', gestureEnabled: false }}
          />
        ) : null}
        <RootStack.Screen
          name="PlayerGame"
          component={PlayerGameScreen}
          options={{ title: 'شاشة المتسابق', gestureEnabled: false }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
