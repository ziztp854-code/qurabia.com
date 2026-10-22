import { useState } from 'react';
import type { SessionUser } from '../auth/AuthProvider';
import { Action, Avatar, Body, FormScreen, Notice, Panel, Title, ui } from '../components/ui';
import type { ImageSourcePropType } from 'react-native';

export function ProfileScreen({user,asset,onRefresh,onSignOut}:{
  user:SessionUser|null;asset:(path:string)=>ImageSourcePropType|undefined;
  onRefresh:()=>Promise<unknown>;onSignOut:()=>Promise<void>;
}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function run(action:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');
    try{await action();}catch(cause){setError(cause instanceof Error?cause.message:'تعذر تنفيذ الطلب.');}finally{setBusy(false);}}
  return <FormScreen>
    <Title>حسابي</Title>
    <Panel><Avatar name={user?.name || 'عضو تحدّي'} source={user?.image?asset(user.image):undefined} size={80}/>
      <Title>{user?.name || 'عضو تحدّي'}</Title>
      {!!user?.email&&<Body style={ui.ltr}>{user.email}</Body>}
      <Body muted>بيانات حسابك كما أعادتها خدمة تحدّي.</Body>
    </Panel>
    <Panel><Title small>الجلسة</Title>
      <Body muted>يمكنك تحديث بيانات الجلسة أو تسجيل الخروج من هذا الجهاز.</Body>
      <Action label="تحديث بيانات الحساب" tone="secondary" busy={busy}
        onPress={()=>{void run(onRefresh);}}/>
      <Action testID="settings-logout" label="تسجيل الخروج" tone="danger" busy={busy}
        onPress={()=>{void run(onSignOut);}}/>
    </Panel>
    <Notice message={error}/>
  </FormScreen>;
}
