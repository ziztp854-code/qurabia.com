import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { mobileApi, type MobileHostQuiz, type MobileProfile } from '../api/mobile-api';
import { useSession } from '../auth/session-provider';
import {
  ConnectionBanner,
  FeatureRow,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  Card,
} from '../components/ui';
import { Screen } from '../components/screen';
import { mobileEnvironment } from '../core/environment';
import type { RootStackParamList } from '../navigation/types';
import { useNotifications } from '../notifications/notification-provider';
import { notificationSettingsState } from '../notifications/notification-settings-state';
import { theme } from '../theme';

function useRootNavigation() {
  return useNavigation<NativeStackNavigationProp<RootStackParamList>>();
}

export function HomeScreen() {
  const navigation = useRootNavigation();
  return (
    <Screen>
      <View style={styles.topLine}>
        <ConnectionBanner />
        <Text style={styles.wordmark}>تحدّي</Text>
      </View>
      <Card accent>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.liveLabel}>الساحة المباشرة</Text>
            <Text style={styles.heroTitle}>الغرفة تبدأ برمز، والحماس يبدأ بك.</Text>
          </View>
          <Image
            source={require('../../assets/tahaddi-crown.webp')}
            style={styles.crown}
            resizeMode="contain"
            accessible={false}
          />
        </View>
        <PrimaryButton label="انضم برمز" onPress={() => navigation.navigate('JoinRoom')} />
        <SecondaryButton label="أنشئ غرفة" onPress={() => navigation.navigate('CreateRoom')} />
      </Card>
      <PageHeading eyebrow="منصة واحدة" title="كل أدوارك في مكان واحد" />
      <FeatureRow
        title="كمتسابق"
        description="ادخل الغرفة، شاهد السؤال، أرسل الإجابة وتابع ترتيبك."
      />
      <FeatureRow
        title="كمضيف"
        description="جهّز الغرفة، راقب اللاعبين، وتحكم في انتقالات الجولة."
      />
    </Screen>
  );
}

export function LobbyHubScreen() {
  const navigation = useRootNavigation();
  const { mode, session } = useSession();
  const [quizzes, setQuizzes] = useState<MobileHostQuiz[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (mode !== 'authenticated' || !session) {
      setQuizzes([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    void mobileApi
      .listHostQuizzes(session.accessToken, controller.signal)
      .then((items) => {
        setQuizzes(items);
        setStatus('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [mode, session]);
  const activeRooms = quizzes.filter((quiz) => quiz.activeRoom);

  return (
    <Screen>
      <ConnectionBanner />
      <PageHeading
        eyebrow="اللوبي"
        title="غرف تحدّي"
        description="ادخل برمز موجود أو أنشئ غرفة جديدة من مسابقاتك."
      />
      <PrimaryButton label="الانضمام إلى غرفة" onPress={() => navigation.navigate('JoinRoom')} />
      <SecondaryButton label="إنشاء غرفة" onPress={() => navigation.navigate('CreateRoom')} />
      {status === 'loading' ? (
        <FeatureRow title="غرفك" description="جارٍ تحميل الغرف النشطة…" />
      ) : null}
      {status === 'error' ? (
        <FeatureRow title="تعذّر التحديث" description="تحقق من الاتصال ثم افتح التبويب مجددًا." />
      ) : null}
      {status === 'idle' && mode === 'authenticated' && activeRooms.length === 0 ? (
        <FeatureRow title="لا توجد غرف نشطة" description="اختر إنشاء غرفة لبدء جولة جديدة." />
      ) : null}
      {activeRooms.map((quiz) => (
        <FeatureRow
          key={quiz.id}
          title={quiz.title}
          description={`الغرفة ${quiz.roomCode} • ${quiz.activeRoom?.status === 'ACTIVE' ? 'جولة جارية' : 'بانتظار اللاعبين'}`}
        />
      ))}
    </Screen>
  );
}

export function ProfileScreen() {
  const navigation = useRootNavigation();
  const { mode, session } = useSession();
  const authenticated = mode === 'authenticated' ? session : null;
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!authenticated) {
      setProfile(null);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    void mobileApi
      .getProfile(authenticated.accessToken, controller.signal)
      .then((value) => {
        setProfile(value);
        setStatus('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [authenticated]);

  return (
    <Screen>
      <PageHeading
        eyebrow="الملف الشخصي"
        title={profile?.displayName ?? authenticated?.user.name ?? 'حساب ضيف'}
        description={
          authenticated
            ? authenticated.user.email
            : 'سجّل الدخول لمزامنة الرتبة والنتائج ومسابقاتك.'
        }
      />
      <Card accent>
        <Text style={styles.metricLabel}>الرتبة الحالية</Text>
        <Text style={styles.rank}>
          {profile
            ? `${profile.rank.emblem} ${profile.rank.name}`
            : status === 'loading'
              ? 'جارٍ التحميل…'
              : '—'}
        </Text>
        <Text style={styles.body}>
          {profile?.rank.tagline ??
            (status === 'error'
              ? 'تعذّر تحميل بيانات الرتبة الآن.'
              : 'بيانات الرتبة تُقرأ من حسابك في تحدّي.')}
        </Text>
      </Card>
      {profile ? (
        <View style={styles.metricsGrid}>
          <Card>
            <Text style={styles.metricValue}>{profile.stats.quizzes}</Text>
            <Text style={styles.metricLabel}>مسابقات</Text>
          </Card>
          <Card>
            <Text style={styles.metricValue}>{profile.stats.questions}</Text>
            <Text style={styles.metricLabel}>أسئلة</Text>
          </Card>
          <Card>
            <Text style={styles.metricValue}>{profile.stats.participations}</Text>
            <Text style={styles.metricLabel}>مشاركات</Text>
          </Card>
          <Card>
            <Text style={styles.metricValue}>{profile.stats.hostedRooms}</Text>
            <Text style={styles.metricLabel}>غرف مستضافة</Text>
          </Card>
        </View>
      ) : null}
      {!authenticated ? (
        <PrimaryButton label="تسجيل الدخول" onPress={() => navigation.navigate('SignIn')} />
      ) : null}
    </Screen>
  );
}

export function SettingsScreen() {
  const navigation = useRootNavigation();
  const { mode, signOut } = useSession();
  const notifications = useNotifications();
  const notificationState = notificationSettingsState({
    authenticated: mode === 'authenticated',
    status: notifications.status,
    permissionStatus: notifications.permissionStatus,
    message: notifications.message,
  });

  useFocusEffect(
    useCallback(() => {
      void notifications.refreshStatus();
    }, [notifications.refreshStatus]),
  );

  const handleNotificationAction = useCallback(() => {
    if (notificationState.action === 'enable') {
      void notifications.requestPermissionAndRegister();
    } else if (notificationState.action === 'disable') {
      void notifications.unregister();
    } else if (notificationState.action === 'settings') {
      void notifications.openSystemSettings();
    } else if (notificationState.action === 'sign-in') {
      navigation.navigate('SignIn');
    }
  }, [navigation, notificationState.action, notifications]);

  const notificationToneColor =
    notificationState.tone === 'success'
      ? theme.colors.success
      : notificationState.tone === 'warning'
        ? theme.colors.warning
        : notificationState.tone === 'error'
          ? theme.colors.danger
          : theme.colors.muted;

  return (
    <Screen>
      <PageHeading
        eyebrow="الإعدادات"
        title="تجربة الهاتف"
        description="إعدادات اللغة والاتصال والخصوصية لتطبيق تحدّي."
      />
      <FeatureRow title="اللغة والاتجاه" description="العربية • واجهة من اليمين إلى اليسار" />
      <FeatureRow
        title="حماية الجلسة"
        description="الرموز الحساسة محفوظة في المخزن الآمن للنظام عبر Secure Storage."
      />
      <FeatureRow
        title="الخدمة العامة"
        description={
          mobileEnvironment.apiBaseUrl === 'https://qurabia.com'
            ? 'qurabia.com'
            : 'بيئة تطوير محلية'
        }
      />
      <Card accent>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle}>الإشعارات</Text>
          <View style={[styles.notificationStatus, { borderColor: notificationToneColor }]}>
            <Text style={[styles.notificationStatusText, { color: notificationToneColor }]}>
              {notificationState.permissionLabel}
            </Text>
          </View>
        </View>
        <Text
          style={styles.notificationDescription}
          accessibilityRole={notificationState.tone === 'error' ? 'alert' : 'text'}
          accessibilityLiveRegion={notificationState.tone === 'error' ? 'assertive' : 'polite'}
        >
          {notificationState.description}
        </Text>
        {notificationState.busy ? (
          <PrimaryButton
            label={notificationState.actionLabel ?? 'جارٍ التحديث…'}
            busy
            onPress={() => {}}
          />
        ) : notificationState.action === 'disable' ? (
          <SecondaryButton
            label={notificationState.actionLabel ?? 'تعطيل الإشعارات'}
            onPress={handleNotificationAction}
          />
        ) : notificationState.action !== 'none' && notificationState.actionLabel ? (
          <PrimaryButton label={notificationState.actionLabel} onPress={handleNotificationAction} />
        ) : null}
      </Card>
      {mode === 'authenticated' ? (
        <SecondaryButton
          label="تسجيل الخروج"
          onPress={() => {
            void signOut().then(() =>
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] }),
            );
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topLine: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 23,
    writingDirection: 'rtl',
  },
  heroRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm },
  heroCopy: { flex: 1, gap: theme.spacing.xs },
  crown: { width: 96, height: 76 },
  liveLabel: {
    color: theme.colors.cyan,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 25,
    lineHeight: 36,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metricLabel: {
    color: theme.colors.muted,
    fontFamily: theme.typography.semibold,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rank: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metricsGrid: { gap: theme.spacing.sm },
  metricValue: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 24,
    textAlign: 'right',
  },
  notificationHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  notificationTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notificationStatus: {
    maxWidth: '58%',
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  notificationStatusText: {
    fontFamily: theme.typography.semibold,
    fontSize: 11,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  notificationDescription: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
