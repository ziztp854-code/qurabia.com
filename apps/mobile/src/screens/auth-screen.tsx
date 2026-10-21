import { useRef, useState } from 'react';
import { Image, StyleSheet, View, type TextInput } from 'react-native';
import { Action, Body, Field, FormScreen, Notice, Panel, Title, ui } from '../components/ui';
import { theme } from '../theme';

export function AuthScreen({ signIn, authError }: {
  signIn: (email: string, password: string) => Promise<void>; authError: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setError('');
    setBusy(true);
    try { await signIn(email.trim(), password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدخول. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  }
  return <FormScreen>
    <View style={styles.brand}>
      <Image source={require('../../assets/tahaddi-crown.webp')} resizeMode="contain" style={styles.crown} accessible={false}/>
      <Title style={styles.brandTitle}>تحدّي لايف</Title>
      <Body muted style={ui.center}>صوتك يجمعنا</Body>
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
        <Notice testID="login-error" message={error || authError}/>
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
