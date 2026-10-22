import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useRooms } from '../rooms/useRooms';
import { canUseMicrophone } from '../rooms/state';
import { captureRoomExitTarget, executeRoomExit, type RoomExitMode, type RoomExitTarget } from './room-exit';
import { NativeVoiceSession, useNativeVoiceSession } from '../voice';
import { useVoiceChat } from '../chat/use-voice-chat';
import { useEmojiCatalog } from '../chat/use-emoji-catalog';
import { useKeyboardVisible } from '../navigation/use-keyboard';
import { useNavigation } from '../navigation/use-navigation';
import { Body, KeyboardViewport, Loading, Notice, UiProvider, ui } from '../components/ui';
import { AuthScreen } from './auth-screen';
import { RoomsScreen } from './rooms-screen';
import { RoomScreen } from './room-screen';
import { ProfileScreen } from './profile-screen';
import { theme } from '../theme';
import { BottomTabs } from '../components/bottom-tabs';
import { bundledRoomArt } from '../assets/room-art';

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
  const [exitBusy,setExitBusy]=useState(false);
  const [logoutBusy,setLogoutBusy]=useState(false);
  const snapshotRef=useRef(rooms.snapshot);
  snapshotRef.current=rooms.snapshot;
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
  function askHostLogout():Promise<boolean>{
    return new Promise(resolve=>Alert.alert('إنهاء البث وتسجيل الخروج',
      'سيُنهي هذا البث لجميع المشاركين، ثم يسجل خروجك من الحساب.',[
        {text:'بقاء',style:'cancel',onPress:()=>resolve(false)},
        {text:'إنهاء البث والخروج',style:'destructive',onPress:()=>resolve(true)},
      ],{cancelable:false}));
  }
  function askAfterCloseFailure(logout:boolean):Promise<'stay'|'retry'|'local'>{
    return new Promise(resolve=>{
      const actions:Array<{text:string;style?:'cancel'|'destructive'|'default';onPress:()=>void}>=[
        {text:'البقاء في الغرفة',style:'cancel',onPress:()=>resolve('stay')},
        {text:'إعادة المحاولة',onPress:()=>resolve('retry')},
      ];
      if(logout)actions.push({text:'الخروج من هذا الجهاز فقط',style:'destructive',onPress:()=>resolve('local')});
      Alert.alert('لم يتم تأكيد إنهاء البث',
        logout?'لم يُسجل خروجك. يمكنك إعادة المحاولة أو الخروج من هذا الجهاز فقط؛ عندها قد يظل البث مفتوحًا.'
          :'لم يؤكد الخادم إنهاء البث. يمكنك البقاء وإعادة تشغيل الصوت أو إعادة محاولة الإنهاء.',
        actions,{cancelable:false});
    });
  }
  async function runExit(initialMode:RoomExitMode,target:RoomExitTarget,confirmLogout=false):Promise<boolean>{
    if(logoutGuard.current)return false;
    logoutGuard.current=true;
    setExitBusy(true);
    setError('');
    let mode=initialMode;
    try{
      if(confirmLogout&&target.host&&!(await askHostLogout()))return false;
      if(!sameSession(target.generation)||
        (currentRoomId.current!==target.roomId&&currentRoomId.current!==null))return false;
      setLogoutBusy(mode==='logout'||mode==='local-logout');
      for(;;){
        const result=await executeRoomExit(target,mode,{
          sessionGeneration:()=>auth.client.sessionGeneration,
          currentRoomId:()=>currentRoomId.current,
          stopAudio:()=>voice.leave(),
          end:()=>rooms.end(),
          leave:()=>rooms.leave(),
          signOut:()=>auth.signOut(),
        });
        if(result.status==='stale')return false;
        if(result.status==='not-host'){
          setError('إنهاء البث متاح للمضيف الموجود في الغرفة فقط.');
          return false;
        }
        if(result.status==='close-failed'){
          setError(mode==='logout'?'لم يتم تأكيد إنهاء البث. لم يُسجل خروجك من الحساب.':'لم يتم تأكيد إنهاء البث. يمكنك إعادة المحاولة.');
          const choice=await askAfterCloseFailure(mode==='logout'||mode==='local-logout');
          if(!sameSession(target.generation)||
            (currentRoomId.current!==target.roomId&&currentRoomId.current!==null))return false;
          if(choice==='stay')return false;
          if(choice==='local')mode='local-logout';
          continue;
        }
        if(result.warnings.length)setError(result.warnings.join(' '));
        if(mode==='end'||mode==='leave'){
          if(sameSession(target.generation)&&
            (currentRoomId.current===null||currentRoomId.current===target.roomId))navigation.go('rooms');
        }
        return true;
      }
    }catch{
      if(sameSession(target.generation))setError(mode==='logout'||mode==='local-logout'
        ?'تعذر إكمال تسجيل الخروج بأمان. أعد المحاولة.':'تعذر إكمال مغادرة الغرفة. أعد المحاولة.');
      return false;
    }finally{
      logoutGuard.current=false;
      setExitBusy(false);
      setLogoutBusy(false);
    }
  }
  async function leave(){
    const target=captureRoomExitTarget(snapshotRef.current,auth.client.sessionGeneration);
    await runExit('leave',target);
  }
  async function endBroadcast(expectedRoomId:string){
    const target=captureRoomExitTarget(snapshotRef.current,auth.client.sessionGeneration);
    if(target.roomId!==expectedRoomId)return;
    await runExit('end',target);
  }
  async function signOut(){
    const target=captureRoomExitTarget(snapshotRef.current,auth.client.sessionGeneration);
    await runExit('logout',target,true);
  }
  useEffect(()=>{
    const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(logoutGuard.current)return true;
      if(navigation.screen==='room'){navigation.go('rooms');return true;}
      if(navigation.screen!=='home'){navigation.go('home');return true;}
      if(rooms.snapshot){
        const target=captureRoomExitTarget(snapshotRef.current,auth.client.sessionGeneration);
        Alert.alert('الخروج من تحدّي',target.host
          ?'هل تريد إنهاء البث لجميع المشاركين والخروج من التطبيق؟'
          :'توجد جلسة صوتية نشطة. هل تريد مغادرة الغرفة والخروج؟',[
          {text:'بقاء',style:'cancel'},
          {text:target.host?'إنهاء البث والخروج':'مغادرة وخروج',style:'destructive',onPress:()=>{
            void runExit(target.host?'end':'leave',target).then(complete=>{
              if(complete&&sameSession(target.generation)&&!currentRoomId.current&&!logoutGuard.current)BackHandler.exitApp();
            });
          }},
        ],{cancelable:false});
        return true;
      }
      return false;
    });
    return()=>handler.remove();
  },[navigation.screen,navigation.go,rooms.snapshot,rooms.leave,voice]);
  function asset(path:string):ImageSourcePropType|undefined{
    const bundled=bundledRoomArt(path);
    if(bundled)return bundled;
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
    <View style={ui.flex} pointerEvents={exitBusy?'none':'auto'}>
      {navigation.screen==='profile'?<ProfileScreen user={auth.user} asset={asset}
        onRefresh={auth.refreshSession} onSignOut={signOut}/>:
        navigation.screen==='room'&&rooms.snapshot?<RoomScreen snapshot={rooms.snapshot} rooms={rooms}
          exiting={exitBusy} keyboardVisible={keyboardVisible} voice={audio} chat={chat} catalog={emojis} asset={asset} onToggleMic={toggleMic}
          onLeave={leave} onEnd={async()=>{const id=rooms.snapshot?.room.id;if(id)await endBroadcast(id);}} onAudioOutput={device=>voice.setAudioOutput(device)}
          onRetryAudio={async()=>{if(!logoutGuard.current&&rooms.snapshot){setError('');await voice.connect(rooms.snapshot.room.id,rooms.snapshot.me||undefined);}}}/>:
          <RoomsScreen model={rooms} home={navigation.screen==='home'} displayName={auth.user?.name||''}
            asset={asset} onJoined={()=>{setError('');navigation.go('room');}}/>}
      {rooms.snapshot&&navigation.screen!=='room'&&<Pressable disabled={exitBusy} accessibilityState={{disabled:exitBusy}} accessibilityRole="button"
        accessibilityLabel={'العودة إلى غرفة '+rooms.snapshot.room.name}
        onPress={()=>navigation.go('room')} style={({pressed})=>[styles.dock,pressed&&styles.pressed]}>
        <View style={[styles.dot,{backgroundColor:audio.state==='connected'?theme.colors.success:theme.colors.gold}]}/>
        <View style={ui.grow}><Body weight="semibold" numberOfLines={1}>{rooms.snapshot.room.name}</Body>
          <Body muted style={ui.caption}>{audio.state==='connected'?'جلسة صوت نشطة':audio.state==='disconnected'?'الصوت متوقف على هذا الجهاز':audio.state==='error'?'تعذر اتصال الصوت':'جارٍ توصيل الصوت'} · {audio.muted?'ميكروفونك مكتوم':'الميكروفون يعمل'}</Body></View>
        <Body style={ui.gold}>العودة للمجلس</Body>
      </Pressable>}
      {!keyboardVisible&&<BottomTabs screen={navigation.screen} disabled={exitBusy} onNavigate={navigation.go}/>}
    </View>;
  return <UiProvider fontsReady={fontsReady}>
    <KeyboardViewport>
    <SafeAreaView style={styles.root} edges={['top','bottom','left','right']}><Notice message={error}/>{content}</SafeAreaView>
    </KeyboardViewport>
  </UiProvider>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:theme.colors.background},
  dock:{flexDirection:'row-reverse',alignItems:'center',gap:12,padding:12,marginHorizontal:16,marginTop:6,borderRadius:16,backgroundColor:theme.colors.surfaceStrong,
    borderWidth:1,borderColor:theme.colors.border},
  dot:{width:8,height:8,borderRadius:4},pressed:{opacity:0.75},
});
