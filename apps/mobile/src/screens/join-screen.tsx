import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { roomCodeFromLink, siteUrl } from '../join-flow';
import {
  joinEndpoint,
  OFFLINE_MESSAGE,
  parseJoinResponse,
  type PlayerIdentity,
} from '../live-room';
import { theme } from '../theme';
import { AppText, Button, Card, Screen, uiStyles } from '../ui';

const JOIN_TIMEOUT_MS = 10_000;

async function requestJoin(roomCode: string, playerName: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JOIN_TIMEOUT_MS);
  try {
    const response = await fetch(joinEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomCode, playerName }),
      signal: controller.signal,
    });
    return parseJoinResponse(response.status, await response.json().catch(() => null));
  } catch {
    return { ok: false as const, fatal: false, message: OFFLINE_MESSAGE };
  } finally {
    clearTimeout(timeout);
  }
}

export function JoinScreen({
  initialName,
  onJoined,
  onBrowseGames,
}: {
  initialName: string;
  onJoined: (identity: PlayerIdentity) => void;
  onBrowseGames: () => void;
}) {
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [playerName, setPlayerName] = useState(initialName);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fillFromLink = (url: string | null | undefined) => {
      const roomCode = roomCodeFromLink(url);
      if (roomCode) setCode(roomCode);
    };
    void Linking.getInitialURL().then(fillFromLink);
    const subscription = Linking.addEventListener('url', ({ url }) => fillFromLink(url));
    return () => subscription.remove();
  }, []);

  async function join() {
    const roomCode = normalizeRoomCode(code);
    if (playerName.trim().length < 2) {
      setError('اكتب اسمًا من حرفين على الأقل.');
      nameRef.current?.focus();
      return;
    }
    if (!isRoomCode(roomCode)) {
      setError('أدخل رمزًا صحيحًا من ٦ إلى ٨ أحرف أو أرقام.');
      codeRef.current?.focus();
      return;
    }

    setError('');
    setJoining(true);
    const result = await requestJoin(roomCode, playerName);
    setJoining(false);
    if (result.ok) {
      onJoined(result.identity);
    } else {
      setError(result.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={styles.brandBlock} accessibilityRole="header">
          <Image
            source={require('../../assets/tahaddi-crown.webp')}
            style={styles.crown}
            resizeMode="contain"
            accessible={false}
          />
          <AppText weight="bold" style={styles.brandName}>
            تحدّي
          </AppText>
          <AppText weight="semibold" style={styles.brandTagline}>
            تفاعل، تنافس، تميّز
          </AppText>
        </View>

        <View style={styles.stageRail} accessibilityElementsHidden>
          <View style={styles.railLine} />
          <View style={styles.railNotch} />
          <View style={styles.railLine} />
        </View>

        <Card>
          <AppText weight="semibold" style={uiStyles.eyebrow}>
            دخول اللاعبين
          </AppText>
          <AppText weight="bold" style={uiStyles.title}>
            ادخل التحدّي
          </AppText>
          <AppText style={uiStyles.body}>
            اكتب اسمك والرمز الظاهر على شاشة المضيف، وستلعب الجولة كاملة من هاتفك.
          </AppText>

          <View style={styles.form}>
            <AppText weight="semibold" style={styles.label} nativeID="player-name-label">
              اسم اللاعب
            </AppText>
            <TextInput
              ref={nameRef}
              value={playerName}
              onChangeText={(value) => {
                setPlayerName(value);
                if (error) setError('');
              }}
              onSubmitEditing={() => codeRef.current?.focus()}
              style={[styles.input, styles.nameInput]}
              placeholder="الاسم الذي سيظهر في الغرفة"
              placeholderTextColor={theme.colors.placeholder}
              autoComplete="nickname"
              textContentType="nickname"
              maxLength={40}
              returnKeyType="next"
              selectionColor={theme.colors.gold}
              accessibilityLabelledBy="player-name-label"
              accessibilityLabel="اسم اللاعب"
            />

            <AppText weight="semibold" style={styles.label} nativeID="room-code-label">
              رمز الغرفة
            </AppText>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(value) => {
                setCode(value.toUpperCase().replace(/\s/g, ''));
                if (error) setError('');
              }}
              onSubmitEditing={join}
              style={[styles.input, styles.codeInput]}
              placeholder="مثال: H7UZT3"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              returnKeyType="go"
              selectionColor={theme.colors.gold}
              accessibilityLabelledBy="room-code-label"
              accessibilityLabel="رمز الغرفة"
              accessibilityHint="اكتب الرمز الظاهر على شاشة المضيف"
            />

            <AppText
              style={[error ? uiStyles.danger : uiStyles.small, styles.feedback]}
              accessibilityRole={error ? 'alert' : undefined}
              accessibilityLiveRegion="polite"
            >
              {error || 'لا تحتاج إلى حساب. اسمك يظهر للمضيف وبقية اللاعبين فقط.'}
            </AppText>

            <Button label="انضم الآن ←" onPress={join} loading={joining} />
          </View>
        </Card>

        <Button variant="ghost" label="تصفّح ألعاب تحدّي" onPress={onBrowseGames} />

        <View style={styles.links}>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(siteUrl('/privacy'))}
          >
            <AppText style={styles.link}>سياسة الخصوصية</AppText>
          </Pressable>
          <AppText style={styles.linkDivider}>•</AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(siteUrl('/terms'))}
          >
            <AppText style={styles.link}>الشروط</AppText>
          </Pressable>
          <AppText style={styles.linkDivider}>•</AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(siteUrl('/contact'))}
          >
            <AppText style={styles.link}>الدعم</AppText>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  brandBlock: { alignItems: 'center', marginTop: theme.spacing.md },
  crown: { width: 104, height: 70, marginBottom: -4 },
  brandName: { color: theme.colors.goldLight, fontSize: 44, lineHeight: 54, textAlign: 'center' },
  brandTagline: { color: theme.colors.gold, fontSize: 13, marginTop: -3, textAlign: 'center' },
  stageRail: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  railLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  railNotch: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: theme.colors.cyan,
    transform: [{ rotate: '45deg' }],
  },
  form: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
  label: { fontSize: 14 },
  input: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'right',
  },
  nameInput: { fontSize: 17, writingDirection: 'rtl' },
  codeInput: { fontSize: 18, writingDirection: 'ltr', letterSpacing: 1.6 },
  feedback: { minHeight: 40 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm },
  link: { color: theme.colors.muted, fontSize: 12, textDecorationLine: 'underline' },
  linkDivider: { color: theme.colors.placeholder, fontSize: 12 },
});
