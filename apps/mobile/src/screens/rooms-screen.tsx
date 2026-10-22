import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Switch, View, type ImageSourcePropType } from 'react-native';
import type { VoiceCreateInput, VoiceRoom } from '../api/contracts';
import type { useRooms } from '../rooms/useRooms';
import { Action, Body, Empty, Field, Loading, Notice, Sheet, Title, ui } from '../components/ui';
import { theme } from '../theme';

export type RoomsModel = ReturnType<typeof useRooms>;
const categories = ['مجالس', 'سوالف', 'ألعاب', 'مسابقات', 'موسيقى', 'ثقافة', 'خاصة'] as const;
const covers = [
  ['friends','مجلس الأصدقاء'],['coffee','قهوة وسوالف'],['gaming','مساحة التحدي'],
  ['oud','جلسة طرب'],['discussion','نقاشات حرة'],['quiz','مسابقات مباشرة'],
] as const;
const filters = ['الكل', ...categories];
export function RoomsScreen({ model, onJoined, asset, home = false, displayName = '' }: {
  model: RoomsModel; onJoined: () => void; asset: (path: string) => ImageSourcePropType | undefined;
  home?: boolean; displayName?: string;
}) {
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState('الكل');
  const [creating,setCreating] = useState(false);
  const [selected,setSelected] = useState<VoiceRoom | null>(null);
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const filtered = useMemo(() => model.rooms.filter(room =>
    (category === 'الكل' || room.category === category) &&
    (room.name + ' ' + room.description + ' ' + room.hostName).includes(query.trim())), [model.rooms,query,category]);
  async function join() {
    if (!selected || busy) return;
    setBusy(true);setError('');
    try {
      await model.join(selected.id, password ? {password} : undefined);
      setSelected(null);setPassword('');onJoined();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'تعذر الانضمام إلى الغرفة.');}
    finally {setBusy(false);}
  }
  return <View style={ui.flex}>
    <FlatList testID="rooms-list" data={filtered} keyExtractor={room => room.id}
      contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={model.refreshing} onRefresh={() => { void model.refresh().catch(()=>{}); }}
        tintColor={theme.colors.gold} colors={[theme.colors.gold]}/>}
      ListHeaderComponent={<View style={styles.header}>
        <View style={ui.row}>
          <View style={styles.brandMark} accessible={false}><Image source={require('../../assets/tahaddi-crown.webp')}
            resizeMode="contain" style={styles.crown}/></View>
          <View style={ui.grow}><Body weight="bold" style={styles.brandName}>تحدّي لايف</Body>
            <Body muted style={ui.caption} numberOfLines={1}>{home?'أهلًا، '+(displayName || 'بك'):'مساحة للصوت والحديث'}</Body></View>
          <Action compact testID="rooms-refresh" tone="secondary" label="تحديث" busy={model.refreshing}
            onPress={() => { void model.refresh().catch(()=>{}); }}/>
        </View>
        <View style={ui.row}>
          <View style={ui.grow}><Title small style={styles.discoveryTitle} numberOfLines={1}>مجالس على الهواء</Title>
            <Body muted style={ui.caption}>{filtered.length.toLocaleString('ar-SA')} غرفة{category==='الكل'?'':' · '+category}</Body></View>
          <Action compact testID="room-create" label="أنشئ غرفة" accessibilityLabel="أنشئ غرفة صوتية"
            onPress={() => setCreating(true)}/>
        </View>
        <Field testID="room-search" label="ابحث عن مجلس" hideLabel value={query} onChangeText={setQuery}
          placeholder="ابحث عن غرفة أو مضيف" style={styles.search} returnKeyType="search" autoCorrect={false}/>
        <FlatList horizontal inverted data={filters} keyExtractor={item=>item}
          style={styles.filterRail} contentContainerStyle={styles.filterContent} showsHorizontalScrollIndicator={false}
          renderItem={({item})=><Pressable accessibilityRole="button" accessibilityState={{selected:category===item}}
            onPress={()=>setCategory(item)} android_ripple={{color:theme.colors.press}}
            style={({pressed})=>[styles.chip,category===item&&styles.chipSelected,pressed&&styles.pressed]}>
            <Body weight={category===item?'bold':'regular'} style={[ui.small,category===item&&styles.chipText]}>{item}</Body>
          </Pressable>}/>
        <Notice message={model.error}/>
      </View>}
      renderItem={({item,index}) => <RoomCard room={item} source={asset(item.cover)} featured={home&&index===0} onPress={() => {
        if(model.snapshot?.room.id === item.id) onJoined();
        else {setError('');setPassword('');setSelected(item);}
      }}/>}
      ListEmptyComponent={model.loading ? <Loading/> : <Empty
        title={query ? 'لا توجد نتائج' : 'المجلس القادم قد يكون مجلسك'}
        description={query ? 'جرّب اسمًا آخر أو اختر تصنيفًا مختلفًا.' : 'لا توجد غرف في هذا التصنيف الآن. حدّث القائمة أو أنشئ غرفة صوتية.'}/>}
      ItemSeparatorComponent={() => <View style={{height: theme.spacing.md}}/>}/>
    <Sheet title={selected?.name || 'الانضمام إلى الغرفة'} visible={!!selected} onClose={() => {if(!busy) setSelected(null);}}
      footer={<><Notice message={error}/><Action label="انضم إلى الغرفة" busy={busy} onPress={() => { void join(); }}/></>}>
      <Body muted>{selected?.description || 'انضم إلى الحديث مع أعضاء الغرفة.'}</Body>
      {!!selected?.passwordRequired && <Field label="كلمة مرور الغرفة" secureTextEntry value={password} onChangeText={setPassword} ltr/>}
    </Sheet>
    <RoomEditor visible={creating} onClose={() => setCreating(false)} asset={asset} onSave={async input => {
      await model.create(input);setCreating(false);onJoined();
    }}/>
  </View>;
}
function RoomCard({room,source,onPress,featured=false}: {
  room:VoiceRoom;source?:ImageSourcePropType;onPress:()=>void;featured?:boolean;
}) {
  const [failed,setFailed]=useState(false);
  const sourceKey=typeof source==='number'?String(source):JSON.stringify(source);
  useEffect(()=>setFailed(false),[sourceKey]);
  return <Pressable testID={featured?'featured-room':undefined} accessibilityRole="button"
    accessibilityLabel={room.name+'، '+(room.active?'على الهواء':'غير نشطة')+'، المضيف '+room.hostName+'، '+room.participantCount+' مشارك'}
    onPress={onPress} android_ripple={{color:theme.colors.press}}
    style={({pressed}) => [styles.room,featured&&styles.featuredRoom,pressed&&styles.pressed]}>
    <View style={[styles.artwork,featured&&styles.featuredArtwork]}>
      {source&&!failed?<Image source={source} onError={()=>setFailed(true)} style={styles.cover} resizeMode="cover" accessible={false}/>:
        <Image source={require('../../assets/tahaddi-crown.webp')} style={styles.coverFallback} resizeMode="contain" accessible={false}/>}
      <View style={styles.privacy}><Body style={ui.caption}>{room.isPrivate?'خاصة':'عامة'}</Body></View>
      {featured&&<View style={styles.coverCategory}><Body weight="semibold" style={[ui.caption,ui.gold]}>{room.category}</Body></View>}
    </View>
    <View style={[styles.roomBody,!featured&&styles.compactBody]}>
      <View style={ui.row}>{!featured&&<Body style={[ui.caption,ui.gold]}>{room.category}</Body>}
        <View style={styles.liveLabel}><View accessible={false}
          style={[styles.dot,{backgroundColor:room.active?theme.colors.live:theme.colors.muted}]}/>
          <Body style={ui.caption}>{room.active?'مباشر':'متوقفة'}</Body></View>
        <View style={ui.grow}/><Body weight="semibold" style={ui.caption}>{room.participantCount.toLocaleString('ar-SA')} مشارك</Body></View>
      <Title small testID={featured?'featured-room-title':undefined} style={featured?styles.featuredTitle:styles.cardTitle} numberOfLines={2}>{room.name}</Title>
      <Body muted testID={featured?'featured-room-host':undefined} style={ui.caption} numberOfLines={1}>بضيافة {room.hostName}</Body>
      {featured&&!!room.description&&<Body muted style={ui.small} numberOfLines={1}>{room.description}</Body>}
    </View>
  </Pressable>;
}
export function RoomEditor({visible,onClose,onSave,asset,initial}:{
  visible:boolean;onClose:()=>void;onSave:(input:VoiceCreateInput)=>Promise<void>;
  asset:(path:string)=>ImageSourcePropType|undefined;initial?:VoiceRoom;
}) {
  const [name,setName]=useState(initial?.name || '');
  const [description,setDescription]=useState(initial?.description || '');
  const [category,setCategory]=useState<VoiceCreateInput['category']>(initial?.category || 'مجالس');
  const [cover,setCover]=useState(initial?.cover || '/voice/covers/friends.webp');
  const [seatCount,setSeatCount]=useState(initial?.seatCount || 8);
  const [isPrivate,setPrivate]=useState(initial?.isPrivate || false);
  const [password,setPassword]=useState('');
  const [allowMicRequests,setMicRequests]=useState(initial?.allowMicRequests ?? true);
  const [chatEnabled,setChat]=useState(initial?.chatEnabled ?? true);
  const [moderatorsCanManage,setModerators]=useState(initial?.moderatorsCanManage ?? true);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function save() {
    if(busy) return;
    if(name.trim().length<3){setError('اكتب اسمًا للغرفة من ٣ أحرف على الأقل.');return;}
    if(isPrivate && password && password.length<6){setError('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');return;}
    setBusy(true);setError('');
    try {await onSave({name:name.trim(),description:description.trim(),category,cover,seatCount,isPrivate,
      allowMicRequests,chatEnabled,moderatorsCanManage,...(isPrivate&&password?{password}:{})});}
    catch(cause){setError(cause instanceof Error?cause.message:'تعذر حفظ الغرفة.');}
    finally{setBusy(false);}
  }
  return <Sheet visible={visible} title={initial?'إعدادات الغرفة':'أنشئ مساحتك الصوتية'} onClose={() => {if(!busy)onClose();}}
    footer={<><Notice testID="room-editor-error" message={error}/>
      <Action testID="room-save" label={initial?'حفظ الإعدادات':'إنشاء الغرفة'} busy={busy} onPress={() => {void save();}}/>
      <Body muted style={[ui.caption,ui.center]}>تبدأ جلستك والميكروفون مكتوم.</Body></>}>
    <View style={styles.editorSection}>
      <Field testID="room-name-input" label="اسم الغرفة" value={name} onChangeText={setName} maxLength={80}
        placeholder="اسم يجمع أصحاب المجلس"/>
      <Field label="عن الغرفة" value={description} onChangeText={setDescription} maxLength={500}
        placeholder="عن ماذا سيكون الحديث؟" multiline/>
    </View>
    <View style={styles.editorSection}><Title small>طابع المجلس</Title>
      <Body muted style={ui.small}>اختر التصنيف والغلاف الأقرب لحديثك.</Body>
      <View style={ui.wrap}>{categories.map(value => <Pressable key={value} accessibilityRole="button"
        accessibilityState={{selected:category===value}} accessibilityLabel={value} onPress={()=>setCategory(value)}
        style={({pressed})=>[styles.chip,category===value&&styles.chipSelected,pressed&&styles.pressed]}>
        <Body style={[ui.small,category===value&&styles.chipText]}>{value}</Body></Pressable>)}</View>
      <View style={styles.coverGrid}>{covers.map(([id,label]) => {
        const path='/voice/covers/'+id+'.webp';const source=asset(path);
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
          accessibilityState={{selected:cover===path}} onPress={() => setCover(path)}
          style={({pressed})=>[styles.coverChoice,cover===path&&styles.coverSelected,pressed&&styles.pressed]}>
          {!!source&&<Image source={source} style={styles.coverThumb} accessible={false}/>}
          <View style={styles.coverCaption}><Body style={ui.caption}>{label}</Body>
            {cover===path&&<Body weight="bold" style={[ui.caption,ui.gold]}>محدد</Body>}</View>
        </Pressable>;
      })}</View>
    </View>
    <View style={styles.editorSection}><Title small>المقاعد والمشاركة</Title>
      <Body weight="semibold">عدد المقاعد</Body><View style={ui.wrap}>{[2,4,6,8,12,16].map(value => <Action key={value} compact
        label={value.toLocaleString('ar-SA')} tone={seatCount===value?'primary':'secondary'} onPress={() => setSeatCount(value)}/>)}</View>
      <Toggle label="غرفة خاصة" value={isPrivate} onValueChange={setPrivate}/>
      {isPrivate&&<Field label={initial?'كلمة مرور جديدة (اختيارية)':'كلمة مرور (اختيارية)'}
        value={password} onChangeText={setPassword} secureTextEntry maxLength={128} ltr/>}
      <Toggle label="السماح بطلب الميكروفون" value={allowMicRequests} onValueChange={setMicRequests}/>
      <Toggle label="تفعيل الدردشة" value={chatEnabled} onValueChange={setChat}/>
      <Toggle label="السماح للمشرفين بالإدارة" value={moderatorsCanManage} onValueChange={setModerators}/>
    </View>
  </Sheet>;
}
function Toggle({label,value,onValueChange}:{label:string;value:boolean;onValueChange:(value:boolean)=>void}) {
  return <View style={styles.toggle}><Body style={ui.grow}>{label}</Body><Switch accessibilityLabel={label}
    value={value} onValueChange={onValueChange} trackColor={{false:theme.colors.controlBorder,true:theme.colors.gold}}
    thumbColor={theme.colors.text}/></View>;
}
const styles=StyleSheet.create({
  header:{gap:8},brandMark:{width:40,height:40,borderRadius:theme.radius.md,
    borderWidth:1,borderColor:theme.colors.border,backgroundColor:theme.colors.goldSoft,alignItems:'center',justifyContent:'center'},
  crown:{width:30,height:24},brandName:{fontSize:18,lineHeight:28},
  discoveryTitle:{fontSize:18,lineHeight:28},search:{minHeight:48,paddingVertical:8},
  filterRail:{flexGrow:0},filterContent:{gap:theme.spacing.sm},
  chip:{minHeight:theme.touch,paddingHorizontal:theme.spacing.md,paddingVertical:10,borderRadius:theme.radius.pill,
    justifyContent:'center',backgroundColor:theme.colors.surface,borderWidth:1,borderColor:theme.colors.controlBorder},
  chipSelected:{backgroundColor:theme.colors.goldSoft,borderColor:theme.colors.gold},
  chipText:{color:theme.colors.goldLight},pressed:{opacity:0.78},
  room:{flexDirection:'row-reverse',borderRadius:theme.radius.lg,overflow:'hidden',backgroundColor:theme.colors.surface,
    borderWidth:1,borderColor:theme.colors.borderSoft},
  featuredRoom:{flexDirection:'column',borderColor:theme.colors.border},
  artwork:{width:80,minHeight:128,alignItems:'center',justifyContent:'center',backgroundColor:theme.colors.surfaceStrong},
  featuredArtwork:{width:'100%',height:120,minHeight:120},
  cover:{position:'absolute',top:0,right:0,bottom:0,left:0,width:'100%',height:'100%'},coverFallback:{width:52,height:40},
  privacy:{position:'absolute',bottom:8,right:8,backgroundColor:theme.colors.overlay,borderRadius:8,
    paddingVertical:2,paddingHorizontal:4,alignItems:'center'},
  coverCategory:{position:'absolute',top:8,right:8,paddingHorizontal:8,paddingVertical:2,
    borderRadius:8,backgroundColor:theme.colors.overlay},
  roomBody:{minWidth:0,padding:12,gap:4},compactBody:{flex:1},
  cardTitle:{fontSize:18,lineHeight:28},featuredTitle:{fontSize:20,lineHeight:32},
  liveLabel:{flexDirection:'row-reverse',alignItems:'center',gap:4},
  dot:{width:6,height:6,borderRadius:3},
  editorSection:{gap:theme.spacing.md,paddingBottom:theme.spacing.lg,borderBottomWidth:1,borderBottomColor:theme.colors.borderSoft},
  coverGrid:{flexDirection:'row-reverse',flexWrap:'wrap',justifyContent:'space-between',gap:12},
  coverChoice:{width:'47%',minHeight:100,overflow:'hidden',borderRadius:theme.radius.sm,
    borderWidth:2,borderColor:theme.colors.controlBorder,backgroundColor:theme.colors.surfaceStrong},
  coverSelected:{borderColor:theme.colors.gold},coverThumb:{width:'100%',height:72},
  coverCaption:{padding:8,gap:4},toggle:{flexDirection:'row-reverse',alignItems:'center',gap:theme.spacing.md,minHeight:56,
    paddingVertical:8,borderBottomWidth:1,borderBottomColor:theme.colors.borderSoft},
});
