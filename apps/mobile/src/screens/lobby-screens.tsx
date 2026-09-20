import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { mobileApi, type MobileHostQuiz, type MobileRoom } from '../api/mobile-api';
import { useSession } from '../auth/session-provider';
import {
  Card,
  ConnectionBanner,
  Field,
  LoadingStatus,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
} from '../components/ui';
import { roomCodeAccessibilityLabel } from '../components/accessibility';
import { Screen } from '../components/screen';
import { resolveJoinIntent } from '../join-flow';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'تعذّر إكمال الطلب الآن.';
}

export function JoinRoomScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'JoinRoom'>) {
  const initialCode = useMemo(
    () => resolveJoinIntent(route.params?.roomCode ?? '')?.roomCode ?? '',
    [route.params?.roomCode],
  );
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');

  function continueToLobby() {
    const intent = resolveJoinIntent(code);
    if (!intent) {
      setError('أدخل رمزًا صحيحًا من ٦ إلى ٨ أحرف أو أرقام.');
      return;
    }
    setError('');
    navigation.navigate('RoomLobby', intent);
  }

  return (
    <Screen keyboardAvoiding>
      <ConnectionBanner />
      <PageHeading
        eyebrow="دخول اللاعبين"
        title="انضم إلى الغرفة"
        description="أدخل الرمز الظاهر على شاشة المضيف."
      />
      <Card accent>
        <Field
          label="رمز الغرفة"
          value={code}
          onChangeText={(value: string) => {
            setCode(value.toUpperCase().replace(/\s/g, ''));
            if (error) setError('');
          }}
          error={error}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          returnKeyType="go"
          onSubmitEditing={continueToLobby}
          textAlign="center"
          style={styles.codeInput}
          accessibilityHint="رمز من ستة إلى ثمانية أحرف أو أرقام"
        />
        <PrimaryButton label="متابعة" onPress={continueToLobby} />
      </Card>
    </Screen>
  );
}

export function CreateRoomScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'CreateRoom'>) {
  const { mode, session } = useSession();
  const authenticated = mode === 'authenticated' ? session : null;
  const [quizzes, setQuizzes] = useState<MobileHostQuiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [loading, setLoading] = useState(Boolean(authenticated));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void mobileApi
      .listHostQuizzes(authenticated.accessToken, controller.signal)
      .then((items) => {
        setQuizzes(items);
        setSelectedQuizId((current) => current || items[0]?.id || '');
        setError('');
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authenticated]);

  async function createRoom() {
    if (!authenticated || !selectedQuizId) return;
    setCreating(true);
    setError('');
    try {
      const result = await mobileApi.createRoom(authenticated.accessToken, selectedQuizId);
      navigation.replace('HostGame', { ticket: result.ticket });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen>
      <PageHeading
        eyebrow="المضيف"
        title="إنشاء غرفة"
        description="اختر مسابقة من حسابك لفتح غرفة مباشرة على الخادم نفسه."
      />
      {!authenticated ? (
        <Card accent>
          <Text style={styles.info}>إنشاء غرفة يتطلب حساب مضيف مسجّلًا.</Text>
          <PrimaryButton label="تسجيل الدخول" onPress={() => navigation.navigate('SignIn')} />
        </Card>
      ) : loading ? (
        <Card>
          <LoadingStatus label="جارٍ تحميل مسابقاتك" />
        </Card>
      ) : quizzes.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>لا توجد مسابقة جاهزة</Text>
          <Text style={styles.info}>أنشئ مسابقة وأسئلتها من المنصة ثم عد لفتح الغرفة.</Text>
        </Card>
      ) : (
        <>
          {quizzes.map((quiz) => {
            const selected = quiz.id === selectedQuizId;
            return (
              <Pressable
                key={quiz.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${quiz.title}، ${quiz.questionCount} سؤال، حتى ${quiz.maxPlayers} لاعب`}
                accessibilityHint="اضغط لاختيار هذه المسابقة"
                onPress={() => setSelectedQuizId(quiz.id)}
                style={[styles.quizCard, selected ? styles.quizCardSelected : null]}
              >
                <Text style={styles.quizTitle}>{quiz.title}</Text>
                <Text style={styles.info}>
                  {quiz.questionCount} سؤال • حتى {quiz.maxPlayers} لاعب
                </Text>
                {selected ? <Text style={styles.selectedLabel}>✓ مختارة</Text> : null}
              </Pressable>
            );
          })}
          <PrimaryButton
            label="فتح الغرفة"
            onPress={() => void createRoom()}
            busy={creating}
            disabled={!selectedQuizId}
          />
        </>
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <SecondaryButton label="العودة" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

export function RoomLobbyScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'RoomLobby'>) {
  const { mode, session } = useSession();
  const [room, setRoom] = useState<MobileRoom | null>(null);
  const [displayName, setDisplayName] = useState(session?.user.name ?? '');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void mobileApi
      .readRoom(route.params.roomCode, controller.signal)
      .then((value) => {
        setRoom(value);
        setError('');
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [route.params.roomCode]);

  async function joinRoom() {
    if (displayName.trim().length < 2) {
      setError('اكتب اسمًا من حرفين على الأقل.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const result = await mobileApi.joinRoom(
        route.params.roomCode,
        displayName,
        mode === 'authenticated' ? session?.accessToken : undefined,
      );
      navigation.replace('PlayerGame', { ticket: result.ticket });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Screen keyboardAvoiding>
      <ConnectionBanner />
      <PageHeading
        eyebrow="غرفة الانتظار"
        title={room?.title ?? `الغرفة ${route.params.roomCode}`}
        description={loading ? 'جارٍ تحميل حالة الغرفة…' : 'راجع المقاعد ثم اختر اسم ظهورك.'}
      />
      <Card accent>
        <View style={styles.roomCodeBox}>
          <Text style={styles.roomCodeLabel} accessible={false}>
            رمز الغرفة
          </Text>
          <Text
            style={styles.roomCode}
            accessibilityLabel={roomCodeAccessibilityLabel(route.params.roomCode)}
          >
            {route.params.roomCode}
          </Text>
          {room ? (
            <Text style={styles.info}>
              {room.participants.length} من {room.maxPlayers} مقاعد
            </Text>
          ) : null}
        </View>
      </Card>
      {loading ? <LoadingStatus label="جارٍ تحميل حالة الغرفة" /> : null}
      {room ? (
        <Card>
          <Text style={styles.emptyTitle}>اللاعبون</Text>
          {room.participants.length === 0 ? (
            <Text style={styles.info}>لاعبك سيكون أول مقعد في الغرفة.</Text>
          ) : (
            room.participants.map((participant) => (
              <View
                key={participant.id}
                style={styles.playerRow}
                accessible
                accessibilityLabel={`${participant.displayName}، ${participant.score} نقطة`}
              >
                <Text style={styles.playerName} accessible={false}>
                  {participant.displayName}
                </Text>
                <Text style={styles.playerScore} accessible={false}>
                  {participant.score}
                </Text>
              </View>
            ))
          )}
        </Card>
      ) : null}
      {!loading && room ? (
        <Card accent>
          <Field
            label="اسم الظهور"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
            autoCorrect={false}
            accessibilityHint="سيظهر هذا الاسم لبقية اللاعبين"
            returnKeyType="go"
            onSubmitEditing={() => void joinRoom()}
          />
          <PrimaryButton label="الانضمام الآن" onPress={() => void joinRoom()} busy={joining} />
        </Card>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <SecondaryButton label="تغيير الرمز" onPress={() => navigation.replace('JoinRoom')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  info: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: {
    color: theme.colors.danger,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  roomCodeBox: { alignItems: 'center', paddingVertical: theme.spacing.md, gap: theme.spacing.xs },
  roomCodeLabel: {
    color: theme.colors.muted,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
    writingDirection: 'rtl',
  },
  roomCode: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 38,
    letterSpacing: 4,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  codeInput: { textAlign: 'center', writingDirection: 'ltr', letterSpacing: 3 },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  quizCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderSoft,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    minHeight: 72,
  },
  quizCardSelected: { borderColor: theme.colors.gold, backgroundColor: theme.colors.surfaceStrong },
  quizTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 17,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectedLabel: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  playerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  playerName: {
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    writingDirection: 'rtl',
  },
  playerScore: { color: theme.colors.goldLight, fontFamily: theme.typography.bold, fontSize: 14 },
});
