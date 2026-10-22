import { useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, KeyboardViewport, Title, ui } from '../components/ui';
import { theme } from '../theme';
import type { PlayerIdentity } from './live-room';
import { JoinScreen } from './screens/join-screen';
import { GamesScreen } from './screens/games-screen';
import { RoomScreen } from './screens/room-screen';
import { FontsReadyProvider } from './ui';

type Route = { name: 'join' } | { name: 'games' } | { name: 'room'; identity: PlayerIdentity };

export function QuizApp({ onClose, fontsReady }: { onClose: () => void; fontsReady: boolean }) {
  const [route, setRoute] = useState<Route>({ name: 'join' });
  const [name, setName] = useState('');
  function back() { if (route.name === 'join') onClose(); else setRoute({ name: 'join' }); }
  return <Modal visible animationType="none" onRequestClose={back}>
    <KeyboardViewport>
      <SafeAreaView style={[ui.flex, { backgroundColor: theme.colors.background }]} edges={['top','bottom','left','right']}>
        <View style={[ui.row, { padding: theme.spacing.md }]}>
          <Title small style={ui.grow}>المسابقات</Title>
          <Action compact label={route.name === 'join' ? 'إغلاق' : 'رجوع'} tone="secondary" onPress={back}/>
        </View>
        <FontsReadyProvider value={fontsReady}>
          {route.name === 'room' ? <RoomScreen key={route.identity.participantId} identity={route.identity} onLeave={() => setRoute({name:'join'})}/> :
            route.name === 'games' ? <GamesScreen onBack={() => setRoute({name:'join'})}/> :
              <JoinScreen initialName={name} onBrowseGames={() => setRoute({name:'games'})}
                onJoined={identity => { setName(identity.displayName); setRoute({name:'room',identity}); }}/>}
        </FontsReadyProvider>
      </SafeAreaView>
    </KeyboardViewport>
  </Modal>;
}
