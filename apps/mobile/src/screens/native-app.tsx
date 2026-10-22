import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useRooms } from '../rooms/useRooms';
import { canUseMicrophone } from '../rooms/state';
import { NativeVoiceSession, useNativeVoiceSession } from '../voice';
import { useVoiceChat } from '../chat/use-voice-chat';
import { useEmojiCatalog } from '../chat/use-emoji-catalog';
import { useKeyboardVisible } from '../navigation/use-keyboard';
import { useNavigation } from '../navigation/use-navigation';
import { Body, Loading, Notice, UiProvider, ui } from '../components/ui';
import { AuthScreen } from './auth-screen';
import { RoomsScreen } from './rooms-screen';
import { RoomScreen } from './room-screen';
import { ProfileScreen } from './profile-screen';
import { theme } from '../theme';

export function NativeApp({fontsReady=false}:{fontsReady?:boolean}){
  const auth=useAuth();
  const rooms=useRooms(auth.client.request,{enabled:auth.status==='authenticated'});
  const [voice]=useState(()=>new NativeVoiceSession(auth.client.request));
  const audio=useNativeVoiceSession(voice);
  const chat=useVoiceChat({snapshot:rooms.snapshot,send:rooms.send,refreshSnapshot:rooms.refreshSnapshot,media:voice});
  const emojis=useEmojiCatalog(auth.client.request,auth.status==='authenticated');
  const navigation=useNavigation();
  const keyboardVisible=useKeyboardVisible();
  const [error,setError]=useState('');
  const logoutGuard=useRef(false);
  const [logoutBusy,setLogoutBusy]=useState(false);
  const currentRoomId=useRef<string|null>(null);
  currentRoomId.current=rooms.snapshot?.room.id??null;
  const roomId=rooms.snapshot?.room.id;
  const memberId=rooms.snapshot?.me?.id;
  useEffect(()=>{
    if(!roomId||!memberId){void voice.leave().catch(()=>{});return;}
    const generation=auth.client.sessionGeneration;
    void voice.connect(roomId,rooms.snapshot?.me||undefined).catch(cause=>{
      if(sameRoomSession(generation,roomId)&&!logoutGuard.current)
        setError(cause instanceof Error?cause.message:'تعذر توصيل الصوت.');
    });
    // Media session lives at this level, independent of screens, drafts and lists.
    // Authoritative permission updates are handled in the separate effect below.
  },[voice,roomId,memberId]);
  useEffect(()=>{voice.updateParticipant(rooms.snapshot?.me||null);},[voice,rooms.snapshot]);
  useEffect(()=>()=>{void voice.dispose().catch(()=>{});},[voice]);
  useEffect(()=>{
    if(auth.status!=='authenticated')navigation.go('home');
  },[auth.status,navigation.go]);
  useEffect(()=>{
    if(navigation.screen==='room'&&!rooms.snapshot)navigation.go('rooms');
  },[navigation.screen,rooms.snapshot,navigation.go]);
  function sameSession(generation:number){
    return auth.client.sessionGeneration===generation;
  }
  function sameRoomSession(generation:number,expectedRoomId:string){
    return sameSession(generation)&&currentRoomId.current===expectedRoomId;
  }
  async function cleanupMembership(generation:number,expectedRoomId:string|null){
    const failures:string[]=[];
    if(!sameSession(generation))return failures;
    try{await voice.leave();}
    catch{failures.push('تعذر إنهاء جلسة الصوت على الجهاز.');}
    // Never let an old callback leave a replacement account or a new room.
    if(!sameSession(generation)||currentRoomId.current!==expectedRoomId)return failures;
    try{await rooms.leave();}
    catch{failures.push('تعذر تأكيد مغادرة الغرفة لدى الخادم.');}
    return failures;
  }
  async function leave(){
    if(logoutGuard.current)return;
    const generation=auth.client.sessionGeneration;
    const expectedRoomId=currentRoomId.current;
    const failures=await cleanupMembership(generation,expectedRoomId);
    if(!sameSession(generation))return;
    // Room cleanup clears the old snapshot. A replacement room must keep its UI.
    if(currentRoomId.current&&currentRoomId.current!==expectedRoomId)return;
    navigation.go('rooms');
    if(failures.length){
      const message=failures.join(' ');
      setError(message);
      throw new Error(message);
    }
  }
  async function signOut(){
    if(logoutGuard.current)return;
    logoutGuard.current=true;
    setLogoutBusy(true);
    setError('');
    const generation=auth.client.sessionGeneration;
    const expectedRoomId=currentRoomId.current;
    try{
      const failures=await cleanupMembership(generation,expectedRoomId);
      // Login/expiry invalidates this generation. Never revoke a newer session.
      if(!sameSession(generation))return;
      if(failures.length)setError(failures.join(' '));
      // Revoke despite cleanup failures, with replacement login hidden until done.
      await auth.signOut();
    } finally {
      logoutGuard.current=false;
      setLogoutBusy(false);
    }
  }
  useEffect(()=>{
    const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(logoutGuard.current)return true;
      if(navigation.screen==='room'){navigation.go('rooms');return true;}
      if(navigation.screen!=='home'){navigation.go('home');return true;}
      if(rooms.snapshot){
        Alert.alert('الخروج من تحدّي','توجد جلسة صوتية نشطة. هل تريد مغادرة الغرفة والخروج؟',[
          {text:'بقاء',style:'cancel'},
          {text:'مغادرة وخروج',style:'destructive',onPress:()=>{
            const generation=auth.client.sessionGeneration;
            void leave().then(()=>{
              if(sameSession(generation)&&!currentRoomId.current&&!logoutGuard.current)BackHandler.exitApp();
            }).catch(cause=>{
              if(sameSession(generation))setError(cause instanceof Error?cause.message:'تعذر مغادرة الغرفة.');
            });
          }},
        ]);
        return true;
      }
      return false;
    });
    return()=>handler.remove();
  },[navigation.screen,navigation.go,rooms.snapshot,rooms.leave,voice]);
  function asset(path:string):ImageSourcePropType|undefined{
    try{return auth.client.assetSource(path);}catch{return undefined;}
  }
  async function toggleMic(){
    if(logoutGuard.current)return;
    const generation=auth.client.sessionGeneration;
    const snapshot=rooms.snapshot;
    if(!snapshot||!canUseMicrophone(snapshot.room,snapshot.me))return;
    const expectedRoomId=snapshot.room.id;
    if(!sameRoomSession(generation,expectedRoomId))return;
    if(!audio.muted){
      await voice.setMuted(true);
      if(!sameRoomSession(generation,expectedRoomId)||logoutGuard.current)return;
      await rooms.send({type:'mute',muted:true});
      return;
    }
    const next=await rooms.send({type:'mute',muted:false});
    if(!sameRoomSession(generation,expectedRoomId)||logoutGuard.current)return;
    voice.updateParticipant(next.me);
    try{
      await voice.setMuted(false);
    } catch(cause){
      // A late permission/SDK failure belongs only to the original room/session.
      if(!sameRoomSession(generation,expectedRoomId)||logoutGuard.current)return;
      await rooms.send({type:'mute',muted:true}).catch(()=>{});
      if(!sameRoomSession(generation,expectedRoomId)||logoutGuard.current)return;
      throw cause;
    }
  }
  const content=logoutBusy?<Loading label="جارٍ تسجيل الخروج…"/>:auth.status==='loading'?<Loading label="جارٍ استعادة الجلسة…"/>:
    auth.status!=='authenticated'?<AuthScreen apiRequest={auth.client.request} signIn={async(email,password)=>{setError('');await auth.signIn(email,password);}} authError={auth.error}/>:
    <View style={ui.flex}>
      {navigation.screen==='profile'?<ProfileScreen user={auth.user} asset={asset}
        onRefresh={auth.refreshSession} onSignOut={signOut}/>:
        navigation.screen==='room'&&rooms.snapshot?<RoomScreen snapshot={rooms.snapshot} rooms={rooms}
          keyboardVisible={keyboardVisible} voice={audio} chat={chat} catalog={emojis} asset={asset} onToggleMic={toggleMic}
          onLeave={leave} onAudioOutput={device=>voice.setAudioOutput(device)}
          onRetryAudio={async()=>{if(rooms.snapshot){setError('');await voice.connect(rooms.snapshot.room.id,rooms.snapshot.me||undefined);}}}/>:
          <RoomsScreen model={rooms} home={navigation.screen==='home'} displayName={auth.user?.name||''}
            asset={asset} onJoined={()=>{setError('');navigation.go('room');}}/>}
      {rooms.snapshot&&navigation.screen!=='room'&&<Pressable accessibilityRole="button"
        accessibilityLabel={'العودة إلى غرفة '+rooms.snapshot.room.name}
        onPress={()=>navigation.go('room')} style={({pressed})=>[styles.dock,pressed&&styles.pressed]}>
        <View style={[styles.dot,{backgroundColor:audio.state==='connected'?theme.colors.success:theme.colors.gold}]}/>
        <View style={ui.grow}><Body weight="semibold" numberOfLines={1}>{rooms.snapshot.room.name}</Body>
          <Body muted style={ui.caption}>{audio.state==='connected'?'جلسة صوت نشطة':'جارٍ توصيل الصوت'} · {audio.muted?'ميكروفونك مكتوم':'الميكروفون يعمل'}</Body></View>
        <Body style={ui.gold}>العودة للمجلس</Body>
      </Pressable>}
      {!keyboardVisible&&<View style={styles.tabs} accessibilityRole="tablist">
        {([['home','الرئيسية'],['rooms','الغرف'],['profile','حسابي']] as const).map(([id,label])=>
          <Pressable key={id} testID={'nav-'+id} accessibilityRole="tab"
            accessibilityState={{selected:navigation.screen===id}} accessibilityLabel={label}
            onPress={()=>navigation.go(id)} android_ripple={{color:theme.colors.press}}
            style={({pressed})=>[styles.tab,navigation.screen===id&&styles.tabActive,pressed&&styles.pressed]}>
            <Body weight="semibold" style={[ui.small,navigation.screen===id&&ui.gold]}>{label}</Body>
          </Pressable>)}
      </View>}
    </View>;
  return <UiProvider fontsReady={fontsReady}>
    <SafeAreaView style={styles.root} edges={['top','bottom','left','right']}><Notice message={error}/>{content}</SafeAreaView>
  </UiProvider>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:theme.colors.background},
  tabs:{flexDirection:'row-reverse',paddingHorizontal:8,paddingVertical:8,borderTopWidth:1,
    borderTopColor:theme.colors.borderSoft,backgroundColor:theme.colors.surface},
  tab:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12},
  tabActive:{backgroundColor:theme.colors.surfaceStrong,borderTopWidth:2,borderTopColor:theme.colors.gold},
  dock:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:12,backgroundColor:theme.colors.surfaceStrong,
    borderTopWidth:1,borderTopColor:theme.colors.border},
  dot:{width:8,height:8,borderRadius:4},pressed:{opacity:0.75},
});
