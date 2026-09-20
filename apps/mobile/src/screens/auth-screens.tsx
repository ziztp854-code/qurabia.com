import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi, MobileAuthApiError } from '../api/auth-api';
import { useSession } from '../auth/session-provider';
import { Card, Field, PageHeading, PrimaryButton, SecondaryButton } from '../components/ui';
import { Screen } from '../components/screen';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

export function StartupScreen() {
  return (
    <Screen scroll={false} includeTopInset>
      <View
        style={styles.startup}
        accessibilityRole="progressbar"
        accessibilityLabel="جارٍ تجهيز تحدّي"
      >
        <Image
          source={require('../../assets/tahaddi-crown.webp')}
          style={styles.crown}
          resizeMode="contain"
          accessible={false}
        />
        <Text style={styles.brand}>تحدّي</Text>
        <Text style={styles.muted}>نجهّز ساحة اللعب…</Text>
      </View>
    </Screen>
  );
}

export function WelcomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Welcome'>) {
  const { continueAsGuest } = useSession();
  return (
    <Screen includeTopInset>
      <View style={styles.hero}>
        <Image
          source={require('../../assets/tahaddi-crown.webp')}
          style={styles.crown}
          resizeMode="contain"
          accessibilityLabel="تاج تحدّي"
        />
        <Text style={styles.brand}>تحدّي</Text>
        <Text style={styles.tagline}>تفاعل، تنافس، تميّز</Text>
      </View>
      <Card accent>
        <PageHeading
          title="ادخل ساحة التحدّي"
          description="تطبيق عربي أصلي للانضمام إلى الغرف ومتابعة الجولة لحظة بلحظة."
        />
        <PrimaryButton label="تسجيل الدخول" onPress={() => navigation.navigate('SignIn')} />
        <SecondaryButton label="إنشاء حساب" onPress={() => navigation.navigate('SignUp')} />
        <SecondaryButton
          label="المتابعة كضيف"
          onPress={() => {
            continueAsGuest();
            navigation.replace('Main');
          }}
        />
      </Card>
    </Screen>
  );
}

type AuthVariant = 'sign-in' | 'sign-up';

function AuthForm({
  variant,
  navigation,
}: {
  variant: AuthVariant;
  navigation: NativeStackScreenProps<RootStackParamList, 'SignIn' | 'SignUp'>['navigation'];
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { saveSession } = useSession();
  const signingUp = variant === 'sign-up';

  async function submit() {
    if (busy) return;
    const invalidSignUpPassword =
      signingUp && (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password));
    if (
      (signingUp && name.trim().length < 2) ||
      !email.includes('@') ||
      (!signingUp && !password) ||
      invalidSignUpPassword
    ) {
      setMessage(
        signingUp
          ? 'راجع البيانات. كلمة المرور ١٠ أحرف على الأقل، وتضم حرفًا ورقمًا.'
          : 'أدخل البريد الإلكتروني وكلمة المرور.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const session = signingUp
        ? await authApi.signUp({ name: name.trim(), email: email.trim(), password })
        : await authApi.signIn({ email: email.trim(), password });
      await saveSession(session);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      setMessage(
        error instanceof MobileAuthApiError
          ? error.message
          : 'تعذّر إكمال الطلب الآن. حاول مجددًا.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboardAvoiding>
      <View style={styles.formWrap}>
        <PageHeading
          eyebrow="حساب تحدّي"
          title={signingUp ? 'إنشاء حساب' : 'تسجيل الدخول'}
          description="ستستخدم حسابك نفسه في الموقع وتطبيق iPhone."
        />
        <Card>
          {signingUp ? (
            <Field
              label="الاسم"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
            />
          ) : null}
          <Field
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.ltrInput}
            accessibilityHint="اكتب البريد الإلكتروني بالأحرف اللاتينية"
          />
          <Field
            label="كلمة المرور"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            textContentType={signingUp ? 'newPassword' : 'password'}
            style={styles.ltrInput}
            accessibilityHint={
              signingUp
                ? 'عشرة أحرف على الأقل، وتتضمن حرفًا لاتينيًا ورقمًا'
                : 'أدخل كلمة مرور حسابك'
            }
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {message ? (
            <Text
              style={styles.notice}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {message}
            </Text>
          ) : null}
          <PrimaryButton
            label={signingUp ? 'إنشاء الحساب' : 'دخول'}
            onPress={() => void submit()}
            busy={busy}
          />
          <SecondaryButton label="العودة" onPress={() => navigation.goBack()} />
        </Card>
      </View>
    </Screen>
  );
}

export function SignInScreen(props: NativeStackScreenProps<RootStackParamList, 'SignIn'>) {
  return <AuthForm variant="sign-in" navigation={props.navigation} />;
}

export function SignUpScreen(props: NativeStackScreenProps<RootStackParamList, 'SignUp'>) {
  return <AuthForm variant="sign-up" navigation={props.navigation} />;
}

const styles = StyleSheet.create({
  startup: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  hero: { alignItems: 'center', paddingVertical: theme.spacing.lg },
  crown: { width: 150, height: 100 },
  brand: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 46,
    lineHeight: 58,
    writingDirection: 'rtl',
  },
  tagline: {
    color: theme.colors.gold,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    writingDirection: 'rtl',
  },
  muted: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 14,
    writingDirection: 'rtl',
  },
  formWrap: { flex: 1, gap: theme.spacing.md },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  notice: {
    color: theme.colors.warning,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
