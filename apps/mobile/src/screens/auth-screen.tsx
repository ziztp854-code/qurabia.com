import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type TextInput } from 'react-native';
import { Action, Body, Field, FormScreen, Notice, Panel, Title } from '../components/ui';
import { theme } from '../theme';
import type { ApiRequest } from '../rooms/api';
import { presentConnectionError, presentLoginError, presentSessionNotice } from './auth-error';

export function AuthScreen({ signIn, authError, apiRequest }: {
  apiRequest: ApiRequest;
  signIn: (email: string, password: string) => Promise<void>; authError: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const [serverState,setServerState]=useState<'loading'|'online'|'error'>('loading');
  const [serverError,setServerError]=useState('');
  const [serverAttempt,setServerAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setServerState('loading');
    setServerError('');
    // This check deliberately uses the app's native HTTP client. A healthy
    // unauthenticated NextAuth endpoint returns exactly an empty JSON object.
    void apiRequest<unknown>('/api/auth/session',{signal:controller.signal,timeoutMs:15_000})
      .then(value=>{
        if(controller.signal.aborted)return;
        if(value===null||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==0)
          throw new Error('استجابة التحقق من الجلسة غير متوقعة. أعد المحاولة.');
        setServerState('online');
      })
      .catch((cause:unknown)=>{
        if(controller.signal.aborted)return;
        setServerState('error');
        setServerError(presentConnectionError(cause));
      });
    return()=>controller.abort();
  },[apiRequest,serverAttempt]);
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setError('');
    setBusy(true);
    try { await signIn(email.trim(), password); }
    catch (cause) { setError(presentLoginError(cause).message); }
    finally { setBusy(false); }
  }
  return <View style={styles.screen}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={styles.studioBackdrop}>
      <Image source={require('../../assets/voice-covers/studio.webp')} resizeMode="cover"
        style={StyleSheet.absoluteFillObject} accessible={false}/>
      <View style={styles.studioScrim}/>
    </View>
    <FormScreen>
    <View style={styles.frame}>
      <View style={styles.brand}>
        <View style={styles.logoFrame}>
          <Image source={require('../../assets/tahaddi-crown.webp')} resizeMode="contain"
            style={styles.crown} accessible={false}/>
        </View>
        <View style={styles.brandCopy}>
          <Title style={styles.brandTitle}>تحدّي لايف</Title>
          <Body muted style={styles.tagline}>صوتك يجمعنا</Body>
        </View>
      </View>

      <View style={styles.connection}>
        <View style={styles.statusPill}>
          <View accessible={false} style={[styles.statusDot,{
            backgroundColor:serverState==='online'?theme.colors.success:serverState==='error'?theme.colors.danger:theme.colors.muted,
          }]}/>
          <Body testID="server-status" accessibilityLiveRegion="polite" style={[styles.statusText,{
            color:serverState==='online'?theme.colors.success:serverState==='error'?theme.colors.danger:theme.colors.muted,
          }]}>{serverState==='online'?'تم الاتصال بخادم تحدّي':serverState==='error'
            ?'لم يكتمل التحقق من الاتصال بالخادم':'جارٍ التحقق من الاتصال بالخادم…'}</Body>
        </View>
        {serverState==='error'&&<>
          <Notice message={serverError}/>
          <Action testID="server-retry" label="إعادة التحقق من الاتصال" tone="secondary" compact
            onPress={()=>setServerAttempt(current=>current+1)}/>
        </>}
      </View>

      <Panel style={styles.loginCard}>
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={styles.cardAccent}/>
        <View style={styles.formHeading}>
          <Title style={styles.welcome}>أهلًا بعودتك</Title>
          <Body muted style={styles.introduction}>سجّل الدخول بحسابك وخذ مكانك في المجلس.</Body>
        </View>
        <View style={styles.form}>
          <Field testID="login-email" label="البريد الإلكتروني" value={email}
            onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} ltr returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()} editable={!busy}/>
          <Field inputRef={passwordRef} testID="login-password" label="كلمة المرور" value={password}
            onChangeText={setPassword} autoComplete="current-password" textContentType="password"
            secureTextEntry autoCapitalize="none" autoCorrect={false} ltr returnKeyType="go"
            onSubmitEditing={() => { void submit(); }} editable={!busy}/>
          <Notice testID="login-error" message={error || presentSessionNotice(authError)}/>
          <View style={styles.submit}>
            <Action testID="login-submit" label="تسجيل الدخول" busy={busy} onPress={() => { void submit(); }}/>
          </View>
        </View>
      </Panel>

      <View style={styles.footer}>
        <View accessible={false} style={styles.footerRule}/>
        <Body muted style={styles.footerText}>استخدم البريد الإلكتروني المرتبط بحسابك.</Body>
        <View accessible={false} style={styles.footerRule}/>
      </View>
    </View>
    </FormScreen>
  </View>;
}
const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: theme.colors.background},
  studioBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, height: 240,
    overflow: 'hidden', borderBottomLeftRadius: theme.radius.lg, borderBottomRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceStrong, borderBottomWidth: 1, borderBottomColor: theme.colors.borderSoft},
  studioScrim: {...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.background, opacity: 0.48},
  frame: {width: '100%', maxWidth: 480, alignSelf: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm},
  brand: {minHeight: 88, flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.md,
    padding: theme.spacing.sm, borderRadius: theme.radius.lg, overflow: 'hidden'},
  logoFrame: {width: 72, height: 72, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surfaceStrong, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, shadowColor: theme.colors.shadow, shadowOpacity: 0.22,
    shadowOffset: {width: 0, height: 6}, shadowRadius: 12, elevation: 2},
  crown: {width: 56, height: 40},
  brandCopy: {flex: 1, gap: theme.spacing.xs},
  brandTitle: {fontSize: 28, lineHeight: 40, color: theme.colors.goldLight},
  tagline: {fontSize: theme.type.small, lineHeight: 24},
  connection: {gap: theme.spacing.sm},
  statusPill: {alignSelf: 'stretch', flexDirection: 'row-reverse', alignItems: 'center',
    minHeight: 40, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm, borderRadius: theme.radius.pill, borderWidth: 1,
    borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.roomBackground},
  statusDot: {width: 7, height: 7, borderRadius: theme.radius.pill},
  statusText: {flex: 1, fontSize: theme.type.caption, lineHeight: 22},
  loginCard: {backgroundColor: theme.colors.surface, padding: theme.spacing.lg, gap: theme.spacing.md, borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow, shadowOpacity: 0.20, shadowOffset: {width: 0, height: 10},
    shadowRadius: 20, elevation: 3},
  cardAccent: {width: 40, height: 3, alignSelf: 'flex-end', borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.gold},
  formHeading: {gap: theme.spacing.xs},
  welcome: {fontSize: 26, lineHeight: 38},
  introduction: {fontSize: theme.type.small, lineHeight: 24},
  form: {gap: theme.spacing.md, marginTop: theme.spacing.xs},
  submit: {marginTop: theme.spacing.xs},
  footer: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.sm},
  footerRule: {height: 1, flex: 1, backgroundColor: theme.colors.borderSoft},
  footerText: {flexShrink: 1, fontSize: theme.type.caption, lineHeight: 22, textAlign: 'center'},
});
