import type { NavigatorScreenParams } from '@react-navigation/native';
import type { LiveConnectionTicket } from '@tahaddi/contracts/client';

export type MainTabParamList = {
  Home: undefined;
  Lobby: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  JoinRoom: { roomCode?: string } | undefined;
  CreateRoom: undefined;
  RoomLobby: { roomCode: string };
  HostGame: { ticket: LiveConnectionTicket };
  PlayerGame: { ticket: LiveConnectionTicket };
};
