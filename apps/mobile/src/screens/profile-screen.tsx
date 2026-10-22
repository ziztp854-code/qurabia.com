import { useState } from 'react';
import type { SessionUser } from '../auth/AuthProvider';
import { Action, Avatar, Body, FormScreen, Notice, Panel, Title, ui } from '../components/ui';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { theme } from '../theme';

export function ProfileScreen({user,asset,onRefresh,onSignOut}:{
  user:SessionUser|null;asset:(path:string)=>ImageSourcePropType|undefined;
  onRefresh:()=>Promise<unknown>;onSignOut:()=>Promise<void>;
}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function run(action:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');
    try{await action();}catch(cause){setError(cause instanceof Error?cause.message:'تعذر تنفيذ الطلب.');}finally{setBusy(false);}}
  return <FormScreen>
    <View style={styles.frame}>
      <View style={styles.pageHeading}>
        <Body weight="semibold" style={[ui.gold,ui.caption]}>مساحتك في تحدّي</Body>
        <Title>حسابي</Title>
      </View>

      <Panel style={styles.profileCard}>
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={styles.cover}>
          <View style={styles.coverLine}/>
          <View style={styles.coverFrame}/>
          <View style={styles.coverFrameInner}/>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarFrame}>
            <Avatar name={user?.name || 'عضو تحدّي'} source={user?.image?asset(user.image):undefined} size={88}/>
          </View>
          <Body muted style={styles.profileEyebrow}>ملفك الشخصي</Body>
          <Title style={styles.name}>{user?.name || 'عضو تحدّي'}</Title>
          <Body muted style={styles.identityCaption}>هذا حسابك في مجالس تحدّي لايف.</Body>
          {!!user?.email&&<View style={styles.emailBlock}>
            <Body muted style={styles.emailLabel}>البريد الإلكتروني</Body>
            <Body style={styles.email}>{user.email}</Body>
          </View>}
        </View>
      </Panel>

      <Panel style={styles.sessionCard}>
        <View style={styles.sectionHeading}>
          <View accessible={false} style={styles.sectionAccent}/>
          <Title small>إدارة الجلسة</Title>
        </View>
        <Body muted style={styles.description}>حدّث بيانات حسابك أو سجّل الخروج من هذا الجهاز.</Body>
        <View style={styles.actions}>
          <Action label="تحديث بيانات الحساب" tone="secondary" busy={busy}
            onPress={()=>{void run(onRefresh);}}/>
          <View accessible={false} style={styles.actionRule}/>
          <Action testID="settings-logout" label="تسجيل الخروج" tone="danger" busy={busy}
            onPress={()=>{void run(onSignOut);}}/>
        </View>
      </Panel>
      <Notice message={error}/>
      <Body muted style={styles.footer}>حافظ على خصوصية حسابك على الأجهزة المشتركة.</Body>
    </View>
  </FormScreen>;
}
const styles = StyleSheet.create({
  frame: {width: '100%', maxWidth: 560, alignSelf: 'center', gap: theme.spacing.md},
  pageHeading: {gap: theme.spacing.xs, paddingVertical: theme.spacing.sm},
  profileCard: {padding: 0, gap: 0, overflow: 'hidden', borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow, shadowOpacity: 0.18, shadowOffset: {width: 0, height: 8},
    shadowRadius: 16, elevation: 2},
  cover: {height: 88, overflow: 'hidden', backgroundColor: theme.colors.surfaceStrong,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border},
  coverLine: {position: 'absolute', height: 1, top: 28, left: 0, right: 0,
    backgroundColor: theme.colors.border},
  coverFrame: {position: 'absolute', width: 140, height: 140, top: -64, right: -20,
    borderWidth: 1, borderColor: theme.colors.border, transform: [{rotate: '35deg'}]},
  coverFrameInner: {position: 'absolute', width: 100, height: 100, top: -42, right: 0,
    borderWidth: 1, borderColor: theme.colors.borderSoft, transform: [{rotate: '35deg'}]},
  identity: {alignItems: 'center', paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg, gap: theme.spacing.xs},
  avatarFrame: {marginTop: -44, padding: theme.spacing.xs, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.goldDark, backgroundColor: theme.colors.surface},
  profileEyebrow: {fontSize: theme.type.caption, lineHeight: 22, marginTop: theme.spacing.sm},
  name: {width: '100%', fontSize: 26, lineHeight: 38, textAlign: 'center'},
  identityCaption: {fontSize: theme.type.small, lineHeight: 24, textAlign: 'center'},
  emailBlock: {width: '100%', gap: theme.spacing.xs, marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.borderSoft},
  emailLabel: {fontSize: theme.type.caption, lineHeight: 22, textAlign: 'center'},
  email: {fontSize: theme.type.small, lineHeight: 24, writingDirection: 'ltr', textAlign: 'center'},
  sessionCard: {padding: theme.spacing.lg, gap: theme.spacing.sm},
  sectionHeading: {flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm},
  sectionAccent: {width: 3, height: 20, borderRadius: theme.radius.pill, backgroundColor: theme.colors.gold},
  description: {fontSize: theme.type.small, lineHeight: 24},
  actions: {gap: theme.spacing.md, marginTop: theme.spacing.sm},
  actionRule: {height: 1, backgroundColor: theme.colors.borderSoft},
  footer: {fontSize: theme.type.caption, lineHeight: 22, textAlign: 'center',
    paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm},
});
