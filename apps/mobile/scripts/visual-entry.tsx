/** CI-only public visual presentation. Never use as the distribution entry.
 * No authentication, sessions, network transport, media connection or real users.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Cairo_400Regular } from '@expo-google-fonts/cairo/400Regular';
import { Cairo_600SemiBold } from '@expo-google-fonts/cairo/600SemiBold';
import { Cairo_700Bold } from '@expo-google-fonts/cairo/700Bold';
import { Body, Loading, UiProvider, ui } from '../src/components/ui';
import { BottomTabs } from '../src/components/bottom-tabs';
import { bundledRoomArt } from '../src/assets/room-art';
import { RoomsScreen, type RoomsModel } from '../src/screens/rooms-screen';
import { ProfileScreen } from '../src/screens/profile-screen';
import { RoomScreen } from '../src/screens/room-screen';
import { useKeyboardVisible } from '../src/navigation/use-keyboard';
import type { NativeScreen } from '../src/navigation/use-navigation';
import type { VoiceParticipant, VoiceRoom, VoiceSnapshot } from '../src/api/contracts';
import type { VoiceAudioSnapshot } from '../src/voice';
import type { ChatModel, EmojiCatalog } from '../src/components/chat-panel';
import { theme } from '../src/theme';

const PRESENTATION_ONLY = 'معاينة تصميم ببيانات عامة؛ لا يوجد اتصال أو إرسال أو بث.';
const blocked = async (): Promise<never> => { throw new Error(PRESENTATION_ONLY); };
const noChange = () => undefined;
const fixedTime = Date.parse('2026-10-22T18:30:00Z');
const people: VoiceParticipant[] = [
  ['public-demo-host', 'سارة • عرض', 'host', 0],
  ['public-demo-speaker', 'نواف • عرض', 'speaker', 1],
  ['public-demo-listener', 'ريم • عرض', 'listener', null],
].map(([id, name, role, seatIndex]) => ({
  id: String(id), name: String(name), role: role as VoiceParticipant['role'],
  seatIndex: seatIndex as number | null, image: null, muted: true,
  moderatorMuted: false, handRaised: false, requestedSeat: null,
  joinedAt: fixedTime, lastSeenAt: fixedTime, accountBadges: [],
}));
const roomNames = ['مجلس المساء', 'قهوة وسوالف', 'ليلة العود', 'تحدّي الأصدقاء', 'حكاية وثقافة', 'أسئلة خفيفة'];
const covers = ['friends', 'coffee', 'oud', 'gaming', 'discussion', 'quiz'];
const rooms: VoiceRoom[] = roomNames.map((name, index) => ({
  id: 'public-demo-room-' + index, name, description: 'مجلس عام لمعاينة الهوية والتفاصيل البصرية فقط.',
  category: index === 3 ? 'ألعاب' : index === 4 ? 'ثقافة' : 'مجالس',
  cover: '/voice/covers/' + covers[index] + '.webp', seatCount: 8,
  isPrivate: false, allowMicRequests: true, chatEnabled: true, moderatorsCanManage: true,
  hostId: people[0].id, hostName: people[0].name, hostImage: null,
  createdAt: fixedTime, active: true, lockedSeats: [7], participantCount: 3,
  listenerCount: 1, speakers: people.slice(0, 2), passwordRequired: false,
}));
const snapshot: VoiceSnapshot = {
  room: rooms[0], participants: people, me: people[0], cursor: 1,
  messages: [
    { id: 'public-demo-message-1', userId: people[1].id, name: people[1].name, image: null,
      text: 'أهلًا بالجميع ✨ هذه بيانات عامة لمعاينة التصميم.', createdAt: fixedTime,
      replyTo: null, pinned: false, reactions: { '👏': [people[0].id] } },
    { id: 'public-demo-message-2', userId: people[0].id, name: people[0].name, image: null,
      text: 'مساحة هادئة للسوالف والأفكار الجميلة.', createdAt: fixedTime + 60_000,
      replyTo: null, pinned: false, reactions: {} },
  ],
};
const roomModel: RoomsModel = {
  rooms, stats: { activeRooms: rooms.length, listeners: 6, participants: 18 },
  snapshot, loading: false, refreshing: false, busy: false, error: null, connection: 'idle',
  refresh: blocked, refreshSnapshot: blocked, create: blocked, join: blocked,
  leave: blocked, end: blocked, send: blocked, update: blocked,
  adoptSnapshot: noChange, clearError: noChange,
};
const audio: VoiceAudioSnapshot = {
  roomId: null, state: 'disconnected', error: '', muted: true, canPublish: false,
  speakers: [], audioOutputs: [], selectedOutput: '', backgroundSupported: false,
};
const chat: ChatModel = {
  messages: snapshot.messages, busy: false, error: '',
  sendMessage: blocked, react: blocked, sendGift: blocked, refresh: blocked,
  acceptData: noChange, clearError: noChange,
};
const catalog: EmojiCatalog = { packs: [], loading: false, error: '', reload: noChange };

export default function VisualEntry() {
  const [screen, setScreen] = useState<NativeScreen>('home');
  const [fontsLoaded, fontError] = useFonts({ Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold });
  const keyboardVisible = useKeyboardVisible();
  const ready = fontsLoaded && !fontError;
  return <SafeAreaProvider><StatusBar style="light"/><UiProvider fontsReady={ready}>
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.presentation} testID="visual-preview-public">
        <Body style={styles.caption}>معاينة تصميم • بيانات عامة</Body>
        <Pressable testID="preview-live" accessibilityRole="button" accessibilityLabel="عرض المجلس التجريبي"
          onPress={() => setScreen('room')} style={styles.previewLink}><Body style={styles.caption}>المجلس</Body></Pressable>
      </View>
      {!ready ? <Loading label={fontError ? 'تعذر تحميل خطوط المعاينة' : 'جارٍ تجهيز المعاينة…'}/> :
        <View style={ui.flex} testID={'visual-page-' + screen}>
          {screen === 'profile' ? <ProfileScreen user={{id: 'public-demo-host', name: 'سارة • عرض'}}
            asset={bundledRoomArt} onRefresh={blocked} onSignOut={blocked}/> :
           screen === 'room' ? <RoomScreen snapshot={snapshot} rooms={roomModel} voice={audio}
            chat={chat} catalog={catalog} asset={bundledRoomArt} keyboardVisible={keyboardVisible}
            onToggleMic={blocked} onRetryAudio={blocked} onAudioOutput={blocked}
            onLeave={blocked} onEnd={blocked}/> :
           <RoomsScreen model={roomModel} asset={bundledRoomArt} home={screen === 'home'}
             displayName="سارة • عرض" onJoined={noChange}/>}
        </View>}
      {!keyboardVisible && <BottomTabs screen={screen} onNavigate={setScreen}/>}
    </SafeAreaView>
  </UiProvider></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  presentation: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: theme.colors.borderSoft, paddingHorizontal: 12, paddingVertical: 4 },
  caption: { color: theme.colors.muted, fontSize: 10, lineHeight: 18 },
  previewLink: { minHeight: 40, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
});
