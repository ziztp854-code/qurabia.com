import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro/400Regular';
import { ReadexPro_600SemiBold } from '@expo-google-fonts/readex-pro/600SemiBold';
import { ReadexPro_700Bold } from '@expo-google-fonts/readex-pro/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { buildQuizJoinUrl } from './src/join-flow';
import { theme } from './src/theme';

const INVALID_CODE_MESSAGE = 'أدخل رمزًا صحيحًا من ٦ إلى ٨ أحرف أو أرقام.';

function JoinScreen() {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  });

  const regularFont = fontsLoaded && !fontError ? styles.fontRegular : null;
  const semiboldFont = fontsLoaded && !fontError ? styles.fontSemibold : null;
  const boldFont = fontsLoaded && !fontError ? styles.fontBold : null;

  async function continueToJoin() {
    const joinUrl = buildQuizJoinUrl(code);
    if (!joinUrl) {
      setError(INVALID_CODE_MESSAGE);
      inputRef.current?.focus();
      return;
    }

    setError('');
    setOpening(true);
    try {
      await Linking.openURL(joinUrl);
    } catch {
      setError('تعذّر فتح صفحة الانضمام. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.ambientTop} />
      <View pointerEvents="none" style={styles.ambientBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.connectionBadge} accessibilityRole="text">
              <View style={styles.connectionDot} />
              <Text style={[styles.connectionText, semiboldFont]}>متصل بالموقع الرسمي</Text>
            </View>

            <View style={styles.brandBlock} accessibilityRole="header">
              <Image
                source={require('./assets/tahaddi-crown.webp')}
                style={styles.crown}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={[styles.brandName, boldFont]}>تحدّي</Text>
              <Text style={[styles.brandTagline, semiboldFont]}>تفاعل، تنافس، تميّز</Text>
            </View>

            <View style={styles.stageRail} accessibilityElementsHidden>
              <View style={styles.railLine} />
              <View style={styles.railNotch} />
              <View style={styles.railLine} />
            </View>

            <View style={styles.joinCard}>
              <Text style={[styles.eyebrow, semiboldFont]}>دخول اللاعبين</Text>
              <Text style={[styles.title, boldFont]}>ادخل التحدّي</Text>
              <Text style={[styles.description, regularFont]}>
                أدخل الرمز الظاهر على شاشة المضيف للانتقال إلى غرفة المسابقة الرسمية.
              </Text>

              <View style={styles.form}>
                <Text style={[styles.label, semiboldFont]}>رمز الغرفة</Text>
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={(value) => {
                    setCode(value.toUpperCase().replace(/\s/g, ''));
                    if (error) setError('');
                  }}
                  onSubmitEditing={continueToJoin}
                  style={[styles.input, regularFont, error ? styles.inputError : null]}
                  placeholder="مثال: H7UZT3"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  returnKeyType="go"
                  selectionColor={theme.colors.gold}
                  accessibilityLabel="رمز الغرفة"
                  accessibilityHint="اكتب الرمز الظاهر على شاشة المضيف"
                />
                {error ? (
                  <Text
                    style={[styles.error, regularFont]}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {error}
                  </Text>
                ) : (
                  <Text style={[styles.helper, regularFont]}>
                    ستُفتح صفحة الانضمام لإدخال اسم اللاعب ومتابعة الجولة.
                  </Text>
                )}

                <Pressable
                  onPress={continueToJoin}
                  disabled={opening}
                  accessibilityRole="button"
                  accessibilityLabel="انضم الآن"
                  accessibilityState={{ disabled: opening, busy: opening }}
                  android_ripple={{ color: theme.colors.press }}
                  style={({ pressed }) => [
                    styles.joinButton,
                    pressed && !opening ? styles.joinButtonPressed : null,
                    opening ? styles.joinButtonDisabled : null,
                  ]}
                >
                  {opening ? (
                    <ActivityIndicator color={theme.colors.background} />
                  ) : (
                    <Text style={[styles.joinButtonText, boldFont]}>انضم الآن ←</Text>
                  )}
                </Pressable>
              </View>
            </View>

            <Text style={[styles.footer, regularFont]}>qurabia.com • تطبيق تحدّي للهاتف</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <JoinScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    direction: 'rtl',
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  ambientTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.colors.gold,
    opacity: 0.055,
    top: -130,
    right: -80,
  },
  ambientBottom: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: theme.colors.cyan,
    opacity: 0.035,
    bottom: -140,
    left: -110,
  },
  fontRegular: { fontFamily: 'ReadexPro_400Regular' },
  fontSemibold: { fontFamily: 'ReadexPro_600SemiBold' },
  fontBold: { fontFamily: 'ReadexPro_700Bold' },
  connectionBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 36,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  connectionText: {
    color: theme.colors.success,
    fontSize: 12,
    writingDirection: 'rtl',
  },
  brandBlock: { alignItems: 'center', marginTop: theme.spacing.md },
  crown: { width: 104, height: 70, marginBottom: -4 },
  brandName: {
    color: theme.colors.goldLight,
    fontSize: 44,
    lineHeight: 54,
    writingDirection: 'rtl',
  },
  brandTagline: {
    color: theme.colors.gold,
    fontSize: 13,
    marginTop: -3,
    writingDirection: 'rtl',
  },
  stageRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.lg,
  },
  railLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  railNotch: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: theme.colors.cyan,
    transform: [{ rotate: '45deg' }],
  },
  joinCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 38,
    marginTop: theme.spacing.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  description: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 26,
    marginTop: theme.spacing.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  form: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    fontSize: 18,
    textAlign: 'right',
    writingDirection: 'ltr',
    letterSpacing: 1.6,
  },
  inputError: { borderColor: theme.colors.danger },
  helper: {
    minHeight: 38,
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: {
    minHeight: 38,
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  joinButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.gold,
    borderWidth: 1,
    borderColor: theme.colors.goldLight,
    shadowColor: theme.colors.gold,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  joinButtonPressed: { opacity: 0.9 },
  joinButtonDisabled: { opacity: 0.66 },
  joinButtonText: {
    color: theme.colors.background,
    fontSize: 17,
    writingDirection: 'rtl',
  },
  footer: {
    color: theme.colors.muted,
    fontSize: 11,
    marginTop: theme.spacing.lg,
    textAlign: 'center',
  },
});
