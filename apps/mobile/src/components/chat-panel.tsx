import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, FlatList, Pressable, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { VoiceMessage, VoiceParticipant, VoiceSnapshot } from '../api/contracts';
import type { useVoiceChat } from '../chat/use-voice-chat';
import type { useEmojiCatalog } from '../chat/use-emoji-catalog';
import { emojiAssetPath, emojiToken, tokenizeEmoji, VOICE_EMOJIS, VOICE_GIFTS } from '../chat/emojis';
import { Action, Avatar, Body, Empty, Notice, Sheet, Title, ui } from './ui';
import { theme } from '../theme';

export type ChatModel = ReturnType<typeof useVoiceChat>;
export type EmojiCatalog = ReturnType<typeof useEmojiCatalog>;
export const ChatPanel = memo(function ChatPanel({snapshot,chat,catalog,asset,manage,onModerate,compact=false}:{
  compact?:boolean;snapshot:VoiceSnapshot;chat:ChatModel;catalog:EmojiCatalog;asset:(path:string)=>ImageSourcePropType|undefined;
  manage:boolean;onModerate:(messageId:string,action:'delete'|'pin'|'unpin'|'report')=>Promise<void>;
}) {
  const [draft,setDraft]=useState('');const [picker,setPicker]=useState(false);
  const [extras,setExtras]=useState(false);
  useEffect(()=>{if(picker)setExtras(false);},[picker]);
  const [selected,setSelected]=useState<VoiceMessage|null>(null);const [giftTo,setGiftTo]=useState<VoiceParticipant|null>(null);
  const [reply,setReply]=useState<VoiceMessage|null>(null);const [error,setError]=useState('');
  useEffect(()=>{if(giftTo)setExtras(false);},[giftTo]);
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
  return <View style={[styles.panel,compact&&styles.compactPanel]}>
    {!compact&&<View style={styles.heading}><Title small style={styles.chatTitle}>حديث المجلس</Title>
      <View style={styles.messageCount}><Body muted style={[ui.caption,styles.countLabel]}>{chat.messages.length.toLocaleString('ar-SA')} رسالة</Body></View></View>}
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
      {!compact&&<View style={styles.composerTools}>
        <Pressable accessibilityRole="button" accessibilityLabel="الفيسات" android_ripple={{color:theme.colors.press}}
          style={({pressed})=>[styles.quickAction,pressed&&styles.pressed]} onPress={()=>setPicker(true)}>
          <Body weight="semibold" style={styles.quickActionLabel}>الفيسات</Body>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="هدية" android_ripple={{color:theme.colors.press}}
          accessibilityState={{disabled:snapshot.participants.length<2}} disabled={snapshot.participants.length<2}
          style={({pressed})=>[styles.quickAction,pressed&&styles.pressed,snapshot.participants.length<2&&styles.disabled]}
          onPress={()=>setGiftTo(snapshot.participants.find(person=>person.id!==snapshot.me?.id)||null)}>
          <Body weight="semibold" style={styles.quickActionLabel}>هدية</Body>
        </Pressable>
      </View>}
      <View style={styles.composerField}>
        {compact&&<Action compact tone="secondary" label="إضافات" accessibilityLabel="الفيسات والهدايا"
          onPress={()=>setExtras(true)}/>}
        <TextInput ref={input} testID="chat-input" accessibilityLabel="اكتب رسالة" value={draft} onChangeText={setDraft}
          placeholder="اكتب رسالة…" placeholderTextColor={theme.colors.muted} maxLength={1000} multiline
          textAlign="right" selectionColor={theme.colors.gold} style={styles.input}
          editable={!chat.busy} blurOnSubmit={false}/>
        <Action testID="chat-send" compact label="إرسال" disabled={!draft.trim()} busy={chat.busy}
          onPress={()=>{void send();}}/>
      </View>
    </View>:<Notice tone="info" message="أوقف المضيف الدردشة في هذه الغرفة."/>}
    <Sheet visible={compact&&extras&&!picker&&!giftTo} onClose={()=>setExtras(false)} title="إضافات الحديث">
      <Action tone="secondary" label="الفيسات" onPress={()=>setPicker(true)}/>
      <Action tone="secondary" label="هدية" disabled={snapshot.participants.length<2}
        onPress={()=>setGiftTo(snapshot.participants.find(person=>person.id!==snapshot.me?.id)||null)}/>
    </Sheet>
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
    <View style={styles.messageHeading}>
      <Avatar name={message.name} source={message.image?asset(message.image):undefined} size={28}/>
      <Body weight="semibold" numberOfLines={1} style={[ui.small,styles.author,own&&styles.ownAuthor]}>{message.name}</Body>
      {message.pinned&&<Body muted style={[ui.caption,styles.pinned]}>مثبتة</Body>}
      <Body muted style={[ui.caption,styles.timestamp]}>{new Date(message.createdAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</Body></View>
    <View style={styles.messageText}>{segments.map((segment,index)=>segment.type==='text'
      ?<Body key={index}>{segment.text}</Body>
      :<ExpoImage key={index} source={asset(emojiAssetPath(segment.id,still))}
        style={styles.messageEmoji} contentFit="contain" accessibilityLabel="فيس"/>)}</View>
    {!!message.gift&&<View style={styles.giftReceipt}><Body style={[ui.small,ui.gold]}>هدية إلى {message.gift.recipientName}</Body></View>}
    <View style={ui.wrap}>{Object.entries(message.reactions).filter(([,users])=>users.length>0).map(([value,users])=><View
      key={value} style={styles.reactionPill}>
      {tokenizeEmoji(value).map((segment,index)=>segment.type==='text'
        ?<Body key={index} style={ui.caption}>{segment.text}</Body>
        :<ExpoImage key={index} source={asset(emojiAssetPath(segment.id,still))}
          style={styles.reactionEmoji} contentFit="contain" accessibilityLabel="فيس"/>)}
      <Body style={[ui.caption,styles.reactionCount]}>{users.length.toLocaleString('ar-SA')}</Body>
    </View>)}</View>
  </Pressable>;
});
const styles=StyleSheet.create({
  panel:{flex:1,minHeight:100,gap:8},compactPanel:{minHeight:0},
  heading:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8,paddingTop:2},
  chatTitle:{fontSize:18,lineHeight:28},
  messageCount:{paddingHorizontal:10,paddingVertical:3,borderRadius:theme.radius.pill,
    backgroundColor:theme.colors.surface,borderWidth:1,borderColor:theme.colors.borderSoft},
  countLabel:{lineHeight:18},
  messages:{paddingVertical:8,gap:10},
  message:{alignSelf:'flex-start',maxWidth:'94%',minWidth:'66%',padding:12,borderRadius:20,
    borderTopLeftRadius:6,backgroundColor:theme.colors.surface,borderWidth:1,borderColor:theme.colors.borderSoft,gap:6},
  ownMessage:{alignSelf:'flex-end',borderTopLeftRadius:20,borderTopRightRadius:6,
    backgroundColor:theme.colors.goldSoft,borderColor:theme.colors.border},
  messageHeading:{flexDirection:'row-reverse',alignItems:'center',gap:6},
  author:{flex:1,minWidth:0,color:theme.colors.text,lineHeight:22},ownAuthor:{color:theme.colors.gold},
  timestamp:{fontSize:10,lineHeight:18,flexShrink:0},pinned:{fontSize:10,lineHeight:18},
  messageText:{flexDirection:'row-reverse',flexWrap:'wrap',alignItems:'center',gap:2},
  messageEmoji:{width:32,height:32},
  giftReceipt:{paddingHorizontal:10,paddingVertical:6,borderRadius:theme.radius.sm,
    borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.surface},
  reactionPill:{flexDirection:'row-reverse',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:3,
    borderRadius:theme.radius.pill,backgroundColor:theme.colors.surfaceStrong,
    borderWidth:1,borderColor:theme.colors.borderSoft},
  reactionEmoji:{width:20,height:20},reactionCount:{lineHeight:20,color:theme.colors.goldLight},
  composer:{gap:2,padding:8,borderWidth:1,borderColor:theme.colors.controlBorder,
    borderRadius:theme.radius.lg,backgroundColor:theme.colors.input},
  composerTools:{flexDirection:'row-reverse',alignItems:'center',gap:4},
  quickAction:{minWidth:64,minHeight:48,paddingHorizontal:12,alignItems:'center',justifyContent:'center',
    borderRadius:theme.radius.sm},
  quickActionLabel:{fontSize:13,lineHeight:20,color:theme.colors.muted},
  composerField:{flexDirection:'row-reverse',alignItems:'flex-end',gap:8},
  input:{flex:1,minWidth:0,minHeight:48,maxHeight:124,paddingHorizontal:8,paddingVertical:10,
    color:theme.colors.text,fontSize:16,backgroundColor:theme.colors.input,writingDirection:'rtl'},
  emojiButton:{minWidth:52,minHeight:52,alignItems:'center',justifyContent:'center',
    borderRadius:theme.radius.sm,backgroundColor:theme.colors.surfaceStrong},
  emoji:{fontSize:28,lineHeight:40},customEmoji:{width:48,height:48},
  customEmojiButton:{minWidth:76,minHeight:80,padding:8,alignItems:'center',gap:4,
    borderRadius:theme.radius.sm,backgroundColor:theme.colors.surfaceStrong},
  pressed:{opacity:0.75},disabled:{opacity:0.5},
});
