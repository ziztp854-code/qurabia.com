import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Switch, View, type ImageSourcePropType } from 'react-native';
import type { VoiceCreateInput, VoiceRoom } from '../api/contracts';
import type { useRooms } from '../rooms/useRooms';
import { Action, Body, Empty, Field, Loading, Notice, Panel, Sheet, Title, ui } from '../components/ui';
import { theme } from '../theme';

export type RoomsModel = ReturnType<typeof useRooms>;
const categories = ['مجالس', 'سوالف', 'ألعاب', 'مسابقات', 'موسيقى', 'ثقافة', 'خاصة'] as const;
const covers = [
  ['friends','مجلس الأصدقاء'],['coffee','قهوة وسوالف'],['gaming','مساحة التحدي'],
  ['oud','جلسة طرب'],['discussion','نقاشات حرة'],['quiz','مسابقات مباشرة'],
] as const;
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
      contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={model.refreshing} onRefresh={() => { void model.refresh().catch(()=>{}); }}
        tintColor={theme.colors.gold} colors={[theme.colors.gold]}/>}
      ListHeaderComponent={<View style={ui.gap}>
        {home && <Panel><Body muted>أهلًا {displayName || 'بك'}</Body>
          <Title>مجلسك يبدأ هنا</Title><Body muted>اكتشف الغرف الحية، أو اجمع أصحابك في مساحة من صنعك.</Body></Panel>}
        <View style={ui.row}><View style={ui.grow}><Body style={ui.gold}>تحدّي لايف</Body><Title>غرف على الهواء</Title></View>
          <Action compact testID="rooms-refresh" tone="secondary" label="تحديث" busy={model.refreshing}
            onPress={() => { void model.refresh().catch(()=>{}); }}/></View>
        <Field label="ابحث عن مجلس" value={query} onChangeText={setQuery} placeholder="اسم الغرفة أو المضيف"
          returnKeyType="search" autoCorrect={false}/>
        <View style={ui.wrap}>{['الكل', ...categories].map(item => <Pressable key={item}
          accessibilityRole="button" accessibilityState={{selected: category === item}}
          onPress={() => setCategory(item)}
          style={({pressed}) => [styles.chip,category === item && styles.chipSelected,pressed && styles.pressed]}>
          <Body style={[ui.small,category === item && styles.chipText]}>{item}</Body></Pressable>)}</View>
        <Notice message={model.error}/>
        <Action testID="room-create" label="أنشئ غرفة صوتية" onPress={() => setCreating(true)}/>
        <Body muted style={ui.small}>{filtered.length.toLocaleString('ar-SA')} غرفة في القائمة الحالية</Body>
      </View>}
      renderItem={({item}) => <RoomCard room={item} source={asset(item.cover)} onPress={() => {
        if(model.snapshot?.room.id === item.id) onJoined();
        else {setError('');setPassword('');setSelected(item);}
      }}/>}
      ListEmptyComponent={model.loading ? <Loading/> : <Empty
        title={query ? 'لا توجد نتائج' : 'لا توجد غرف معروضة'}
        description={query ? 'جرّب اسمًا آخر أو اختر تصنيفًا مختلفًا.' : 'اسحب القائمة للتحديث، أو أنشئ غرفتك الأولى.'}/>}
      ItemSeparatorComponent={() => <View style={{height: theme.spacing.md}}/>}/>
    <Sheet title={selected?.name || 'الانضمام إلى الغرفة'} visible={!!selected} onClose={() => {if(!busy) setSelected(null);}}>
      <Body muted>{selected?.description || 'انضم إلى الحديث مع أعضاء الغرفة.'}</Body>
      {!!selected?.passwordRequired && <Field label="كلمة مرور الغرفة" secureTextEntry value={password} onChangeText={setPassword} ltr/>}
      <Notice message={error}/><Action label="انضم إلى الغرفة" busy={busy} onPress={() => { void join(); }}/>
    </Sheet>
    <RoomEditor visible={creating} onClose={() => setCreating(false)} asset={asset} onSave={async input => {
      await model.create(input);setCreating(false);onJoined();
    }}/>
  </View>;
}
function RoomCard({room,source,onPress}: {room:VoiceRoom;source?:ImageSourcePropType;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={room.name + '، المضيف ' + room.hostName}
    onPress={onPress} style={({pressed}) => [styles.room,pressed && styles.pressed]}>
    {!!source && <Image source={source} style={styles.cover} resizeMode="cover" accessible={false}/>}
    <View style={styles.roomBody}>
      <View style={ui.row}><Body style={[ui.small,ui.gold]}>{room.category}</Body>
        <View style={ui.grow}/><Body style={[ui.caption,{color:theme.colors.success}]}>{room.isPrivate ? 'خاصة' : 'عامة'}</Body></View>
      <Title small>{room.name}</Title><Body muted numberOfLines={2}>{room.description}</Body>
      <View style={ui.row}><Body muted style={ui.small}>بضيافة {room.hostName}</Body><View style={ui.grow}/>
        <Body style={ui.small}>{room.participantCount.toLocaleString('ar-SA')} مشارك</Body></View>
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
  return <Sheet visible={visible} title={initial?'إعدادات الغرفة':'أنشئ مساحتك الصوتية'} onClose={() => {if(!busy)onClose();}}>
    <Field testID="room-name-input" label="اسم الغرفة" value={name} onChangeText={setName} maxLength={80}/>
    <Field label="عن الغرفة" value={description} onChangeText={setDescription} maxLength={500} multiline/>
    <Body weight="semibold">التصنيف</Body><View style={ui.wrap}>{categories.map(value => <Action key={value} compact
      label={value} tone={category===value?'primary':'secondary'} onPress={() => setCategory(value)}/>)}</View>
    <Body weight="semibold">الغلاف</Body><View style={ui.wrap}>{covers.map(([id,label]) => {
      const path='/voice/covers/'+id+'.webp';const source=asset(path);
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{selected:cover===path}} onPress={() => setCover(path)}
        style={[styles.coverChoice,cover===path&&styles.coverSelected]}>
        {!!source&&<Image source={source} style={styles.coverThumb} accessible={false}/>}
        <Body style={ui.caption}>{label}</Body></Pressable>;
    })}</View>
    <Body weight="semibold">عدد المقاعد</Body><View style={ui.wrap}>{[2,4,6,8,12,16].map(value => <Action key={value} compact
      label={value.toLocaleString('ar-SA')} tone={seatCount===value?'primary':'secondary'} onPress={() => setSeatCount(value)}/>)}</View>
    <Toggle label="غرفة خاصة" value={isPrivate} onValueChange={setPrivate}/>
    {isPrivate&&<Field label={initial?'كلمة مرور جديدة (اختيارية)':'كلمة مرور (اختيارية)'}
      value={password} onChangeText={setPassword} secureTextEntry maxLength={128} ltr/>}
    <Toggle label="السماح بطلب الميكروفون" value={allowMicRequests} onValueChange={setMicRequests}/>
    <Toggle label="تفعيل الدردشة" value={chatEnabled} onValueChange={setChat}/>
    <Toggle label="السماح للمشرفين بالإدارة" value={moderatorsCanManage} onValueChange={setModerators}/>
    <Notice message={error}/><Action testID="room-save" label={initial?'حفظ الإعدادات':'إنشاء الغرفة'} busy={busy}
      onPress={() => {void save();}}/>
    <Body muted style={ui.caption}>تبدأ جلستك والميكروفون مكتوم.</Body>
  </Sheet>;
}
function Toggle({label,value,onValueChange}:{label:string;value:boolean;onValueChange:(value:boolean)=>void}) {
  return <View style={ui.row}><Body style={ui.grow}>{label}</Body><Switch accessibilityLabel={label}
    value={value} onValueChange={onValueChange} trackColor={{false:theme.colors.controlBorder,true:theme.colors.gold}}
    thumbColor={theme.colors.text}/></View>;
}
const styles=StyleSheet.create({
  chip:{minHeight:48,paddingHorizontal:16,paddingVertical:8,borderRadius:theme.radius.pill,
    backgroundColor:theme.colors.surface,borderWidth:1,borderColor:theme.colors.controlBorder},
  chipSelected:{backgroundColor:theme.colors.gold,borderColor:theme.colors.gold},
  chipText:{color:theme.colors.ink},pressed:{opacity:0.75},
  room:{borderRadius:theme.radius.lg,overflow:'hidden',backgroundColor:theme.colors.surface,
    borderWidth:1,borderColor:theme.colors.borderSoft},
  cover:{width:'100%',height:136},roomBody:{padding:theme.spacing.md,gap:theme.spacing.sm},
  coverChoice:{width:'47%',minHeight:82,padding:8,gap:4,borderRadius:theme.radius.sm,
    borderWidth:1,borderColor:theme.colors.controlBorder},
  coverSelected:{borderColor:theme.colors.gold,borderWidth:2},coverThumb:{width:'100%',height:68,borderRadius:8},
});
