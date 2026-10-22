import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type TextInput } from 'react-native';
import { Action, Body, Field, FormScreen, Notice, Panel, Title, ui } from '../components/ui';
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
  return <FormScreen>
    <View style={styles.brand}>
      <Image source={require('../../assets/tahaddi-crown.webp')} resizeMode="contain" style={styles.crown} accessible={false}/>
      <Title style={styles.brandTitle}>تحدّي لايف</Title>
      <Body muted style={ui.center}>صوتك يجمعنا</Body>
      <Body testID="server-status" accessibilityLiveRegion="polite" style={[ui.caption,ui.center,{
        color:serverState==='online'?theme.colors.success:serverState==='error'?theme.colors.danger:theme.colors.muted,
      }]}>{serverState==='online'?'تم الاتصال بخادم تحدّي':serverState==='error'
        ?'لم يكتمل التحقق من الاتصال بالخادم':'جارٍ التحقق من الاتصال بالخادم…'}</Body>
      {serverState==='error'&&<>
        <Notice message={serverError}/>
        <Action testID="server-retry" label="إعادة التحقق من الاتصال" tone="secondary" compact
          onPress={()=>setServerAttempt(current=>current+1)}/>
      </>}
    </View>
    <Panel>
      <Body weight="semibold" style={ui.gold}>أهلًا بعودتك</Body>
      <Title>خذ مكانك في المجلس</Title>
      <Body muted>سجّل الدخول بحساب تحدّي للانضمام إلى الغرف والمشاركة في الحديث.</Body>
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
        <Action testID="login-submit" label="تسجيل الدخول" busy={busy} onPress={() => { void submit(); }}/>
      </View>
    </Panel>
    <Body muted style={[ui.caption, ui.center]}>تُرسل بيانات الدخول عبر اتصال آمن إلى خدمة تحدّي.</Body>
  </FormScreen>;
}
const styles = StyleSheet.create({
  brand: {alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm},
  crown: {width: 92, height: 62}, brandTitle: {fontSize: theme.type.display, lineHeight: 52, color: theme.colors.goldLight},
  form: {gap: theme.spacing.md, marginTop: theme.spacing.md},
});
