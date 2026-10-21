import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import type { VoiceEvent, VoiceParticipant, VoiceSnapshot } from '../api/contracts';
import { availableSeat, canManageRoom, canUseMicrophone } from '../rooms/state';
import type { VoiceAudioSnapshot } from '../voice';
import { Action, Avatar, Body, Notice, Sheet, Title, ui } from '../components/ui';
import { ChatPanel, type ChatModel, type EmojiCatalog } from '../components/chat-panel';
import { RoomEditor, type RoomsModel } from './rooms-screen';
import { theme } from '../theme';

const roleLabels={host:'المضيف',moderator:'مشرف',speaker:'متحدث',listener:'مستمع'} as const;
const connectionLabels={disconnected:'الصوت غير متصل',connecting:'جارٍ توصيل الصوت…',connected:'الصوت متصل',
  reconnecting:'جارٍ استعادة الصوت…',error:'تعذر اتصال الصوت'} as const;
export function RoomScreen({snapshot,rooms,voice,chat,catalog,asset,onToggleMic,onRetryAudio,onAudioOutput,onLeave,keyboardVisible=false}:{
  keyboardVisible?:boolean;snapshot:VoiceSnapshot;rooms:RoomsModel;voice:VoiceAudioSnapshot;chat:ChatModel;catalog:EmojiCatalog;
  asset:(path:string)=>ImageSourcePropType|undefined;onToggleMic:()=>Promise<void>;onRetryAudio:()=>Promise<void>;
  onAudioOutput:(device:string)=>Promise<void>;onLeave:()=>Promise<void>;
}) {
  const [selected,setSelected]=useState<VoiceParticipant|null>(null);
  const [seat,setSeat]=useState<number|null>(null);const [allSeats,setAllSeats]=useState(false);
  const [settings,setSettings]=useState(false);const [audioSettings,setAudioSettings]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const manage=canManageRoom(snapshot);
  async function run(action:()=>Promise<unknown>){
    if(busy)return;setBusy(true);setError('');
    try{await action();}catch(cause){setError(cause instanceof Error?cause.message:'تعذر تنفيذ الطلب.');}
    finally{setBusy(false);}
  }
  async function send(event:VoiceEvent){await rooms.send(event);}
  function participantAction(event:VoiceEvent){void run(async()=>{await send(event);setSelected(null);});}
  function confirmLeave(){Alert.alert('مغادرة الغرفة','سيتوقف الصوت وتغادر المجلس.',[
    {text:'بقاء',style:'cancel'},{text:'مغادرة',style:'destructive',onPress:()=>{void run(onLeave);}},
  ]);}
  function selectSeat(index:number){setAllSeats(false);const person=snapshot.participants.find(item=>item.seatIndex===index);
    if(person)setSelected(person);else setSeat(index);}
  function seats(limit:number){return <View style={styles.seats}>{Array.from({length:Math.min(limit,snapshot.room.seatCount)},(_,index)=>{
    const person=snapshot.participants.find(item=>item.seatIndex===index);const locked=snapshot.room.lockedSeats.includes(index);
    return <Pressable key={index} accessibilityRole="button" accessibilityLabel={person
      ?person.name+'، '+roleLabels[person.role]+(person.muted?'، مكتوم':'، الميكروفون متاح')
      :'المقعد '+(index+1)+(locked?'، مغلق':'، متاح')}
      onPress={()=>selectSeat(index)} style={({pressed})=>[styles.seat,pressed&&styles.pressed]}>
      {person?<Avatar size={50} name={person.name} source={person.image?asset(person.image):undefined}
        speaking={voice.speakers.includes(person.id)}/>:<View style={styles.emptySeat}><Body muted>{locked?'مغلق':String(index+1)}</Body></View>}
      <Body style={ui.caption} numberOfLines={1}>{person?.name || (locked?'مقعد مغلق':'مقعد متاح')}</Body>
      {!!person&&<Body style={[ui.caption,{color:person.moderatorMuted?theme.colors.danger:theme.colors.muted}]}>
        {person.moderatorMuted?'كتم إداري':person.muted?'مكتوم':roleLabels[person.role]}</Body>}
    </Pressable>;
  })}</View>;}
  return <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS==='ios'?'padding':'height'}>
    <View style={styles.room}>
      <View style={ui.row}><View style={ui.grow}><Title small testID="room-title">{snapshot.room.name}</Title>
        <Body muted style={ui.caption}>{snapshot.room.participantCount.toLocaleString('ar-SA')} مشارك · {snapshot.room.category}</Body></View>
        <Action compact testID="leave-room" tone="danger" label="مغادرة" busy={busy} onPress={confirmLeave}/></View>
      <View testID="connection-status" style={ui.row} accessibilityLiveRegion="polite">
        <View style={[styles.dot,{backgroundColor:voice.state==='connected'?theme.colors.success:theme.colors.gold}]}/>
        <Body style={ui.small}>{connectionLabels[voice.state]}</Body>
        <View style={ui.grow}/><Body muted style={ui.caption}>{rooms.connection==='online'?'بيانات الغرفة متصلة':'جارٍ مزامنة الغرفة'}</Body>
      </View>
      {!keyboardVisible&&seats(4)}
      {!keyboardVisible&&<View style={ui.row}><Action compact tone="secondary" label={'الأعضاء والمقاعد ('+snapshot.participants.length+')'}
        onPress={()=>setAllSeats(true)}/>
        <View style={ui.grow}/>{manage&&<Action compact tone="secondary" label="إعدادات" onPress={()=>setSettings(true)}/>}</View>}
      <Notice message={error || rooms.error || voice.error}/>
      {voice.state==='error'&&<Action tone="secondary" label="إعادة توصيل الصوت" busy={busy}
        onPress={()=>{void run(onRetryAudio);}}/>}
      <ChatPanel snapshot={snapshot} chat={chat} catalog={catalog} asset={asset} manage={manage}
        onModerate={async(messageId,action)=>{
          await send(action==='delete'?{type:'delete-message',messageId}:action==='report'
            ?{type:'report',messageId,reason:'بلاغ مستخدم من تطبيق Android'}
            :{type:'pin-message',messageId,pinned:action==='pin'});
        }}/>
      {!keyboardVisible&&<View style={styles.controls}>
        <Action testID="mic-toggle" label={snapshot.me?.moderatorMuted?'الميكروفون مكتوم إداريًا':voice.muted?'تشغيل الميكروفون':'كتم الميكروفون'}
          busy={busy} disabled={!canUseMicrophone(snapshot.room,snapshot.me)||voice.state!=='connected'}
          onPress={()=>{void run(onToggleMic);}}/>
        <View style={ui.row}>
          {snapshot.me?.seatIndex===null&&<Action compact label={snapshot.me.handRaised?'إلغاء طلب الحديث':'طلب الميكروفون'}
            tone="secondary" busy={busy} disabled={!snapshot.room.allowMicRequests} onPress={()=>{void run(async()=>{
              if(snapshot.me?.handRaised)await send({type:'hand',raised:false});
              else await send({type:'request-seat'});
            });}}/>}
          {snapshot.me&&snapshot.me.seatIndex!==null&&snapshot.me.role!=='host'&&<Action compact label="مغادرة المقعد"
            tone="secondary" busy={busy} onPress={()=>{void run(()=>send({type:'leave-seat'}));}}/>}
          <View style={ui.grow}/><Action compact label="مخرج الصوت" tone="secondary" onPress={()=>setAudioSettings(true)}/>
        </View>
      </View>}
    </View>
    <Sheet visible={allSeats} title="المقاعد وأعضاء المجلس" onClose={()=>setAllSeats(false)}>
      {seats(snapshot.room.seatCount)}
      <Title small>المستمعون</Title>
      <View style={ui.wrap}>{snapshot.participants.filter(person=>person.seatIndex===null).map(person=><Pressable
        key={person.id} accessibilityRole="button" accessibilityLabel={person.name} style={styles.member}
        onPress={()=>{setAllSeats(false);setSelected(person);}}><Avatar name={person.name} source={person.image?asset(person.image):undefined}/>
        <Body style={ui.small}>{person.name}</Body>{person.handRaised&&<Body style={[ui.caption,ui.gold]}>طلب الحديث</Body>}</Pressable>)}</View>
    </Sheet>
    <Sheet visible={seat!==null} title={'المقعد '+((seat??0)+1)} onClose={()=>setSeat(null)}>
      {!snapshot.room.lockedSeats.includes(seat??-1)&&snapshot.me?.seatIndex===null&&
        <Action label="طلب هذا المقعد" busy={busy} disabled={!snapshot.room.allowMicRequests&&!manage} onPress={()=>{
          if(seat!==null)void run(async()=>{await send({type:'request-seat',seatIndex:seat});setSeat(null);});
        }}/>}
      {manage&&<Action label={snapshot.room.lockedSeats.includes(seat??-1)?'فتح المقعد':'إغلاق المقعد'} tone="secondary" busy={busy}
        onPress={()=>{if(seat!==null)void run(async()=>{
          await send({type:'lock-seat',seatIndex:seat,locked:!snapshot.room.lockedSeats.includes(seat)});setSeat(null);
        });}}/>}
      {!manage&&snapshot.room.lockedSeats.includes(seat??-1)&&<Body muted>أغلق المضيف هذا المقعد.</Body>}
    </Sheet>
    <Sheet visible={!!selected} title={selected?.name||'عضو المجلس'} onClose={()=>setSelected(null)}>
      {!!selected&&<>
        <Avatar name={selected.name} source={selected.image?asset(selected.image):undefined} size={72}/>
        <Body>{roleLabels[selected.role]}</Body>
        {manage&&selected.id!==snapshot.me?.id&&selected.role!=='host'&&<>
          {selected.seatIndex===null&&availableSeat(snapshot,selected.requestedSeat??undefined)!==undefined&&
            <Action label={selected.handRaised?'قبول طلب الحديث':'دعوة إلى الميكروفون'} busy={busy}
              onPress={()=>{const index=availableSeat(snapshot,selected.requestedSeat??undefined);
                if(index!==undefined)participantAction({type:'approve-seat',userId:selected.id,seatIndex:index});}}/>}
          {selected.handRaised&&<Action label="رفض طلب الحديث" tone="secondary" busy={busy}
            onPress={()=>participantAction({type:'deny-seat',userId:selected.id})}/>}
          {selected.seatIndex!==null&&<Action label={selected.moderatorMuted?'رفع الكتم الإداري':'كتم الميكروفون إداريًا'}
            tone="secondary" busy={busy} onPress={()=>participantAction({type:'moderator-mute',userId:selected.id,muted:!selected.moderatorMuted})}/>}
          {snapshot.me?.role==='host'&&<Action label={selected.role==='moderator'?'إزالة الإشراف':'تعيين مشرف'}
            tone="secondary" busy={busy} onPress={()=>participantAction({type:'role',userId:selected.id,
              role:selected.role==='moderator'?'listener':'moderator'})}/>}
          <Action label="إخراج من الغرفة" tone="danger" busy={busy} onPress={()=>Alert.alert('إخراج العضو',selected.name,[
            {text:'إلغاء',style:'cancel'},{text:'إخراج',style:'destructive',onPress:()=>participantAction({type:'remove',userId:selected.id})},
          ])}/>
        </>}
      </>}
    </Sheet>
    <Sheet visible={audioSettings} title="مخرج الصوت" onClose={()=>setAudioSettings(false)}>
      <Body muted>المخرج الحالي: {voice.selectedOutput || 'الافتراضي'}</Body>
      {[...new Set([...voice.audioOutputs,'bluetooth'])].map(device=><Action key={device} label={audioOutputLabel(device)} tone="secondary"
        busy={busy} onPress={()=>{void run(async()=>{await onAudioOutput(device);setAudioSettings(false);});}}/>)}
      {!voice.backgroundSupported&&<Notice tone="info" message="استمرار الصوت عند قفل الشاشة غير مثبت في هذه النسخة."/>}
    </Sheet>
    {settings&&<RoomEditor visible={settings} initial={snapshot.room} asset={asset} onClose={()=>setSettings(false)}
      onSave={async input=>{await rooms.update(input);setSettings(false);}}/>}
  </KeyboardAvoidingView>;
}
function audioOutputLabel(device:string){
  const value=device.toLowerCase();
  if(value.includes('bluetooth'))return 'بلوتوث';
  if(value.includes('speaker'))return 'مكبر الصوت';
  if(value.includes('earpiece'))return 'سماعة الهاتف';
  if(value.includes('wired')||value.includes('headset'))return 'السماعة السلكية';
  return device==='default'?'المخرج الافتراضي':device;
}
const styles=StyleSheet.create({
  room:{flex:1,width:'100%',maxWidth:760,alignSelf:'center',paddingHorizontal:16,paddingTop:8,gap:8},
  seats:{flexDirection:'row-reverse',flexWrap:'wrap',gap:8},
  seat:{width:'23%',minHeight:90,alignItems:'center',justifyContent:'flex-start',gap:2,paddingVertical:4},
  emptySeat:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center',
    backgroundColor:theme.colors.surfaceStrong,borderWidth:1,borderStyle:'dashed',borderColor:theme.colors.controlBorder},
  member:{minWidth:88,minHeight:96,alignItems:'center',padding:8,gap:4},
  pressed:{opacity:0.75},dot:{width:8,height:8,borderRadius:4},
  controls:{gap:8,paddingVertical:8,borderTopWidth:1,borderTopColor:theme.colors.borderSoft},
});
