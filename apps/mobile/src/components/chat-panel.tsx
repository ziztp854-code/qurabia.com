import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, FlatList, Pressable, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { VoiceMessage, VoiceParticipant, VoiceSnapshot } from '../api/contracts';
import type { useVoiceChat } from '../chat/use-voice-chat';
import type { useEmojiCatalog } from '../chat/use-emoji-catalog';
import { emojiAssetPath, emojiToken, tokenizeEmoji, VOICE_EMOJIS, VOICE_GIFTS } from '../chat/emojis';
import { Action, Body, Empty, Notice, Sheet, Title, ui } from './ui';
import { theme } from '../theme';

export type ChatModel = ReturnType<typeof useVoiceChat>;
export type EmojiCatalog = ReturnType<typeof useEmojiCatalog>;
export const ChatPanel = memo(function ChatPanel({snapshot,chat,catalog,asset,manage,onModerate}:{
  snapshot:VoiceSnapshot;chat:ChatModel;catalog:EmojiCatalog;asset:(path:string)=>ImageSourcePropType|undefined;
  manage:boolean;onModerate:(messageId:string,action:'delete'|'pin'|'unpin'|'report')=>Promise<void>;
}) {
  const [draft,setDraft]=useState('');const [picker,setPicker]=useState(false);
  const [selected,setSelected]=useState<VoiceMessage|null>(null);const [giftTo,setGiftTo]=useState<VoiceParticipant|null>(null);
  const [reply,setReply]=useState<VoiceMessage|null>(null);const [error,setError]=useState('');
  const [still,setStill]=useState(true);const input=useRef<TextInput>(null);
  useEffect(()=>{
    let reduced=true;let active=AppState.currentState==='active';let alive=true;
    const update=()=>{if(alive)setStill(reduced||!active);};
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{reduced=value;update();}).catch(()=>{});
    const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduced=value;update();});
    const state=AppState.addEventListener('change',value=>{active=value==='active';update();});
    return()=>{alive=false;motion.remove();state.remove();};
  },[]);
  const messages=useMemo(()=>[...chat.messages].reverse(),[chat.messages]);
  async function send(){
    const text=draft.trim();if(!text||chat.busy)return;setError('');
    try{await chat.sendMessage(text,reply?.id);setDraft('');setReply(null);}
    catch(cause){setError(cause instanceof Error?cause.message:'تعذر إرسال الرسالة. بقي النص لتتمكن من المحاولة.');}
  }
  async function react(emoji:string){
    if(!selected)return;setError('');
    try{await chat.react(selected.id,emoji);setSelected(null);}
    catch(cause){setError(cause instanceof Error?cause.message:'تعذر إضافة التفاعل.');}
  }
  return <View style={styles.panel}>
    <View style={styles.heading}><Title small>حديث المجلس</Title><Body muted style={ui.caption}>{chat.messages.length.toLocaleString('ar-SA')} رسالة</Body></View>
    <FlatList data={messages} inverted keyExtractor={message=>message.id} initialNumToRender={20}
      maxToRenderPerBatch={12} windowSize={5} keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.messages} style={ui.flex}
      renderItem={({item})=><MessageItem message={item} own={item.userId===snapshot.me?.id} asset={asset} still={still}
        onPress={()=>setSelected(item)}/>}
      ListEmptyComponent={<View style={{transform:[{scaleY:-1}]}}><Empty title="هنا يبدأ الحديث"
        description="شارك تحية أو فكرة مع أعضاء المجلس."/></View>}/>
    <Notice message={error || chat.error}/>
    {!!reply&&<View style={ui.row}><Body muted style={[ui.small,ui.grow]} numberOfLines={1}>رد على {reply.name}: {reply.text}</Body>
      <Action compact tone="secondary" label="إلغاء الرد" onPress={()=>setReply(null)}/></View>}
    {snapshot.room.chatEnabled?<View style={styles.composer}>
      <View style={ui.row}>
        <Action compact tone="secondary" label="الفيسات" onPress={()=>setPicker(true)}/>
        <Action compact tone="secondary" label="هدية" disabled={snapshot.participants.length<2}
          onPress={()=>setGiftTo(snapshot.participants.find(person=>person.id!==snapshot.me?.id)||null)}/>
      </View>
      <View style={ui.row}>
        <TextInput ref={input} testID="chat-input" accessibilityLabel="اكتب رسالة" value={draft} onChangeText={setDraft}
          placeholder="اكتب رسالة…" placeholderTextColor={theme.colors.muted} maxLength={1000} multiline
          textAlign="right" selectionColor={theme.colors.gold} style={styles.input}
          editable={!chat.busy} blurOnSubmit={false}/>
        <Action testID="chat-send" compact label="إرسال" disabled={!draft.trim()} busy={chat.busy}
          onPress={()=>{void send();}}/>
      </View>
    </View>:<Notice tone="info" message="أوقف المضيف الدردشة في هذه الغرفة."/>}
    <Sheet visible={picker} onClose={()=>setPicker(false)} title="الفيسات والإيموجي">
      <View style={ui.wrap}>{VOICE_EMOJIS.map(([value,label])=><Pressable key={value}
        accessibilityRole="button" accessibilityLabel={label} style={styles.emojiButton}
        onPress={()=>{setDraft(current=>(current+value).slice(0,1000));setPicker(false);input.current?.focus();}}>
        <Body style={styles.emoji}>{value}</Body></Pressable>)}</View>
      <Notice message={catalog.error}/>
      {catalog.packs.filter(pack=>pack.enabled).map(pack=><View key={pack.id} style={ui.gap}>
        <Title small>{pack.name}</Title><View style={ui.wrap}>{pack.emojis.map(emoji=><Pressable key={emoji.id}
          accessibilityRole="button" accessibilityLabel={emoji.label} style={styles.customEmojiButton}
          onPress={()=>{setDraft(current=>(current+emojiToken(emoji.id)).slice(0,1000));setPicker(false);input.current?.focus();}}>
          <ExpoImage source={asset(emojiAssetPath(emoji.id,still))} style={styles.customEmoji} contentFit="contain"/>
          <Body style={ui.caption} numberOfLines={1}>{emoji.label}</Body>
        </Pressable>)}</View>
      </View>)}
      <Action tone="secondary" label="تحديث الفيسات" busy={catalog.loading} onPress={()=>{catalog.reload();}}/>
    </Sheet>
    <Sheet visible={!!selected} title={selected?'رسالة '+selected.name:'الرسالة'} onClose={()=>setSelected(null)}>
      <View style={ui.wrap}>{VOICE_EMOJIS.slice(0,6).map(([value,label])=><Action key={value} label={value+' '+label}
        compact tone="secondary" busy={chat.busy} onPress={()=>{void react(value);}}/>)}</View>
      <Action label="الرد على الرسالة" tone="secondary" onPress={()=>{setReply(selected);setSelected(null);input.current?.focus();}}/>
      {(manage||selected?.userId===snapshot.me?.id)&&<Action label="حذف الرسالة" tone="danger" onPress={()=>{
        if(selected)void onModerate(selected.id,'delete').then(()=>setSelected(null)).catch(cause=>setError(String(cause.message||cause)));
      }}/>}
      {manage&&<Action label={selected?.pinned?'إلغاء التثبيت':'تثبيت الرسالة'} tone="secondary" onPress={()=>{
        if(selected)void onModerate(selected.id,selected.pinned?'unpin':'pin').then(()=>setSelected(null)).catch(cause=>setError(String(cause.message||cause)));
      }}/>}
      <Action label="الإبلاغ عن الرسالة" tone="secondary" onPress={()=>{
        if(selected)void onModerate(selected.id,'report').then(()=>{setSelected(null);setError('أُرسل البلاغ للمراجعة.');}).catch(cause=>setError(String(cause.message||cause)));
      }}/>
    </Sheet>
    <Sheet visible={!!giftTo} title="إرسال هدية" onClose={()=>setGiftTo(null)}>
      <Body muted>الهدايا المتاحة حاليًا في الغرفة مجانية.</Body>
      <Body weight="semibold">إلى</Body><View style={ui.wrap}>{snapshot.participants.filter(person=>person.id!==snapshot.me?.id).map(person=><Action
        compact key={person.id} label={person.name} tone={giftTo?.id===person.id?'primary':'secondary'} onPress={()=>setGiftTo(person)}/>)}</View>
      <View style={ui.wrap}>{VOICE_GIFTS.map(gift=><Action key={gift.id} label={gift.emoji+' '+gift.name}
        tone="secondary" busy={chat.busy} onPress={()=>{
          if(giftTo)void chat.sendGift(gift.id,giftTo.id).then(()=>setGiftTo(null)).catch(cause=>setError(String(cause.message||cause)));
        }}/>)}</View>
    </Sheet>
  </View>;
});
const MessageItem=memo(function MessageItem({message,own,asset,still,onPress}:{
  message:VoiceMessage;own:boolean;asset:(path:string)=>ImageSourcePropType|undefined;still:boolean;onPress:()=>void;
}){
  const segments=useMemo(()=>tokenizeEmoji(message.text),[message.text]);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={message.name+': '+message.text}
    style={({pressed})=>[styles.message,own&&styles.ownMessage,pressed&&styles.pressed]}>
    <View style={ui.row}><Body weight="semibold" style={[ui.small,ui.gold]}>{message.name}</Body>
      {message.pinned&&<Body muted style={ui.caption}>مثبتة</Body>}
      <View style={ui.grow}/><Body muted style={ui.caption}>{new Date(message.createdAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</Body></View>
    <View style={styles.messageText}>{segments.map((segment,index)=>segment.type==='text'
      ?<Body key={index}>{segment.text}</Body>
      :<ExpoImage key={index} source={asset(emojiAssetPath(segment.id,still))}
        style={styles.customEmoji} contentFit="contain" accessibilityLabel="فيس"/>)}</View>
    {!!message.gift&&<Body style={ui.small}>هدية إلى {message.gift.recipientName}</Body>}
    <View style={ui.wrap}>{Object.entries(message.reactions).filter(([,users])=>users.length>0).map(([value,users])=><Body
      key={value} style={ui.caption}>{value} {users.length.toLocaleString('ar-SA')}</Body>)}</View>
  </Pressable>;
});
const styles=StyleSheet.create({
  panel:{flex:1,minHeight:100,gap:8},heading:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'},
  messages:{paddingVertical:8,gap:8},message:{padding:12,borderRadius:16,backgroundColor:theme.colors.surface,
    borderWidth:1,borderColor:theme.colors.borderSoft,gap:4},ownMessage:{borderColor:theme.colors.border},
  messageText:{flexDirection:'row-reverse',flexWrap:'wrap',alignItems:'center',gap:2},
  composer:{gap:8,paddingTop:8,borderTopWidth:1,borderTopColor:theme.colors.borderSoft},
  input:{flex:1,minHeight:48,maxHeight:124,paddingHorizontal:12,paddingVertical:8,
    color:theme.colors.text,fontSize:16,borderWidth:1,borderColor:theme.colors.controlBorder,borderRadius:16,
    backgroundColor:theme.colors.surface,writingDirection:'rtl'},
  emojiButton:{minWidth:52,minHeight:52,alignItems:'center',justifyContent:'center'},
  emoji:{fontSize:28,lineHeight:40},customEmoji:{width:48,height:48},
  customEmojiButton:{minWidth:76,minHeight:80,padding:8,alignItems:'center',gap:4},
  pressed:{opacity:0.75},
});
