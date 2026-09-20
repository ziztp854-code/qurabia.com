import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  GamePhase,
  LiveConnectionTicket,
  LiveRole,
  PlayerInfo,
  QuestionPayload,
} from '@tahaddi/contracts/client';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/screen';
import {
  Card,
  ConnectionBanner,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
} from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import type { LiveGameClientState } from '../realtime/live-game-state';
import { useLiveGame } from '../realtime/use-live-game';
import { theme } from '../theme';

const phaseLabels: Record<GamePhase, string> = {
  LOBBY: 'غرفة الانتظار',
  QUESTION: 'السؤال مفتوح',
  REVEAL: 'كشف الإجابة',
  LEADERBOARD: 'الترتيب الحالي',
  FINISHED: 'انتهى التحدّي',
};

const answerRejectionMessages: Record<string, string> = {
  INVALID_SESSION: 'الجلسة غير متاحة.',
  INVALID_PLAYER: 'تعذّر التحقق من المتسابق.',
  QUESTION_NOT_ACTIVE: 'السؤال غير مفتوح الآن.',
  QUESTION_MISMATCH: 'انتقلت الجلسة إلى سؤال آخر.',
  INVALID_OPTION: 'الخيار المحدد غير صالح.',
  DUPLICATE_ANSWER: 'تم استلام إجابتك مسبقًا.',
  ANSWER_TOO_LATE: 'انتهى وقت الإجابة.',
};

function LiveStatus({ state }: { state: LiveGameClientState }) {
  const connectionLabel =
    state.connection === 'connected'
      ? 'متصل بالجلسة اللحظية'
      : state.connection === 'reconnecting'
        ? 'نعيد الاتصال ونستعيد حالة الجولة…'
        : state.connection === 'disconnected'
          ? 'انقطع الاتصال؛ ستبدأ المحاولة تلقائيًا'
          : 'جارٍ الاتصال بالجلسة…';

  return (
    <Card>
      <View style={styles.statusRow} accessibilityRole="text">
        <View
          style={[
            styles.statusDot,
            state.connection === 'connected' ? styles.statusDotConnected : null,
          ]}
        />
        <Text style={styles.statusText}>{connectionLabel}</Text>
      </View>
      {state.hostConnected !== null ? (
        <Text style={styles.detailText} accessibilityLiveRegion="polite">
          {state.hostConnected ? 'المضيف متصل' : 'المضيف غير متصل حاليًا'}
        </Text>
      ) : null}
      {state.error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {state.error.message}
        </Text>
      ) : null}
    </Card>
  );
}

function SessionSummary({
  ticket,
  state,
}: {
  ticket: LiveConnectionTicket;
  state: LiveGameClientState;
}) {
  return (
    <Card accent>
      <View style={styles.sessionDetails} accessible accessibilityRole="text">
        <Text style={styles.sessionLabel}>معرّف الجلسة</Text>
        <Text style={styles.sessionId} selectable>
          {ticket.sessionId}
        </Text>
        {state.snapshot ? (
          <>
            <Text style={styles.roomCode}>الغرفة {state.snapshot.roomCode}</Text>
            <Text style={styles.detailText}>{phaseLabels[state.snapshot.phase]}</Text>
            <Text style={styles.detailText}>
              الحضور المتصل: {state.snapshot.participantCount.toLocaleString('ar-SA')}
            </Text>
          </>
        ) : null}
      </View>
    </Card>
  );
}

function QuestionCard({
  question,
  state,
  interactive,
  onAnswer,
}: {
  question: QuestionPayload;
  state: LiveGameClientState;
  interactive: boolean;
  onAnswer(questionId: string, optionId: string): void;
}) {
  const answeredOption =
    state.answer && 'optionId' in state.answer
      ? state.answer.optionId
      : state.snapshot?.playerAnswer?.optionId;
  const answerLocked = Boolean(state.answer) || Boolean(state.snapshot?.playerAnswer);

  return (
    <Card accent>
      <Text style={styles.questionProgress}>
        السؤال {question.questionNumber.toLocaleString('ar-SA')} من{' '}
        {question.totalQuestions.toLocaleString('ar-SA')}
      </Text>
      <Text style={styles.questionPrompt}>{question.prompt}</Text>
      <View style={styles.options}>
        {question.options.map((option) => {
          const selected = answeredOption === option.id;
          if (!interactive) {
            return (
              <View key={option.id} style={styles.readOnlyOption}>
                <Text style={styles.optionText}>{option.text}</Text>
              </View>
            );
          }
          return (
            <Pressable
              key={option.id}
              onPress={() => onAnswer(question.questionId, option.id)}
              disabled={answerLocked || state.connection !== 'connected'}
              accessibilityRole="button"
              accessibilityLabel={`إجابة: ${option.text}`}
              accessibilityState={{ disabled: answerLocked, selected }}
              style={({ pressed }) => [
                styles.answerOption,
                selected ? styles.answerOptionSelected : null,
                pressed && !answerLocked ? styles.pressed : null,
                answerLocked && !selected ? styles.disabled : null,
              ]}
            >
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {state.answer?.status === 'submitting' ? (
        <Text style={styles.detailText} accessibilityLiveRegion="polite">
          جارٍ إرسال الإجابة…
        </Text>
      ) : state.answer?.status === 'accepted' ? (
        <Text style={styles.successText} accessibilityLiveRegion="polite">
          تم استلام إجابتك.
        </Text>
      ) : state.answer?.status === 'rejected' ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {answerRejectionMessages[state.answer.reason] ?? 'تعذّر قبول الإجابة.'}
        </Text>
      ) : null}
    </Card>
  );
}

function RevealCard({ state }: { state: LiveGameClientState }) {
  const reveal = state.snapshot?.reveal;
  const question = state.snapshot?.question;
  if (!reveal || !question) return null;
  const correctOption = question.options.find((option) => option.id === reveal.correctOptionId);
  return (
    <Card>
      <Text style={styles.sectionTitle}>الإجابة الصحيحة</Text>
      <Text style={styles.revealAnswer}>{correctOption?.text ?? 'تم كشف الإجابة'}</Text>
      {reveal.explanation ? <Text style={styles.detailText}>{reveal.explanation}</Text> : null}
      {reveal.playerResult ? (
        <Text style={reveal.playerResult.correct ? styles.successText : styles.errorText}>
          {reveal.playerResult.correct ? 'إجابة صحيحة' : 'إجابة غير صحيحة'} ·{' '}
          {reveal.playerResult.earnedPoints.toLocaleString('ar-SA')} نقطة
        </Text>
      ) : null}
    </Card>
  );
}

function Leaderboard({ players, finished }: { players: PlayerInfo[]; finished: boolean }) {
  if (players.length === 0) return null;
  return (
    <Card>
      <Text style={styles.sectionTitle}>{finished ? 'النتائج النهائية' : 'الترتيب الحالي'}</Text>
      {players.map((player) => (
        <View key={player.id} style={styles.playerRow} accessibilityRole="text">
          <Text style={styles.playerRank}>{player.rank.toLocaleString('ar-SA')}</Text>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerScore}>{player.score.toLocaleString('ar-SA')} نقطة</Text>
        </View>
      ))}
    </Card>
  );
}

function HostControls({
  state,
  startQuestion,
  revealQuestion,
  nextQuestion,
  skipQuestion,
  finishGame,
}: {
  state: LiveGameClientState;
  startQuestion(): boolean;
  revealQuestion(questionId: string): boolean;
  nextQuestion(): boolean;
  skipQuestion(): boolean;
  finishGame(): boolean;
}) {
  const phase = state.snapshot?.phase;
  if (!phase || phase === 'FINISHED') return null;
  const disabled = state.connection !== 'connected';
  return (
    <Card>
      <Text style={styles.sectionTitle}>أوامر المضيف</Text>
      {phase === 'LOBBY' ? (
        <PrimaryButton label="ابدأ السؤال" onPress={startQuestion} disabled={disabled} />
      ) : null}
      {phase === 'QUESTION' && state.snapshot?.question ? (
        <>
          <PrimaryButton
            label="اكشف الإجابة"
            onPress={() => revealQuestion(state.snapshot!.question!.questionId)}
            disabled={disabled}
          />
          <SecondaryButton label="تخطَّ السؤال" onPress={skipQuestion} />
        </>
      ) : null}
      {phase === 'REVEAL' || phase === 'LEADERBOARD' ? (
        <PrimaryButton label="السؤال التالي" onPress={nextQuestion} disabled={disabled} />
      ) : null}
      <SecondaryButton label="إنهاء التحدّي" onPress={finishGame} />
    </Card>
  );
}

function GameExperience({
  ticket,
  expectedRole,
  onBack,
}: {
  ticket: LiveConnectionTicket;
  expectedRole: LiveRole;
  onBack(): void;
}) {
  const roleMatches = ticket.role === expectedRole;
  const live = useLiveGame(roleMatches ? ticket : null);
  const { state } = live;
  const question = state.snapshot?.question;
  const phase = state.snapshot?.phase;
  const leaderboard = state.snapshot?.leaderboard ?? [];

  return (
    <Screen>
      <ConnectionBanner />
      <PageHeading
        eyebrow={expectedRole === 'host' ? 'المضيف' : 'المتسابق'}
        title={expectedRole === 'host' ? 'إدارة التحدّي' : 'ساحة التحدّي'}
        description="حالة الجولة من خادم تحدّي مباشرة وتُستعاد تلقائيًا بعد انقطاع الشبكة."
      />
      {!roleMatches ? (
        <Card>
          <Text style={styles.errorText} accessibilityRole="alert">
            تذكرة الجلسة لا تطابق دور هذه الشاشة.
          </Text>
        </Card>
      ) : (
        <>
          <LiveStatus state={state} />
          <SessionSummary ticket={ticket} state={state} />
          {question && state.snapshot?.phase !== 'LOBBY' && state.snapshot?.phase !== 'FINISHED' ? (
            <QuestionCard
              question={question}
              state={state}
              interactive={expectedRole === 'player' && phase === 'QUESTION'}
              onAnswer={live.submitAnswer}
            />
          ) : null}
          <RevealCard state={state} />
          {expectedRole === 'host' && state.questionStats ? (
            <Card>
              <Text style={styles.sectionTitle}>الإجابات المستلمة</Text>
              <Text style={styles.detailText}>
                {state.questionStats.answeredCount.toLocaleString('ar-SA')} من{' '}
                {state.questionStats.participantCount.toLocaleString('ar-SA')}
              </Text>
            </Card>
          ) : null}
          <Leaderboard players={leaderboard} finished={state.snapshot?.phase === 'FINISHED'} />
          {expectedRole === 'host' ? (
            <HostControls
              state={state}
              startQuestion={live.startQuestion}
              revealQuestion={live.revealQuestion}
              nextQuestion={live.nextQuestion}
              skipQuestion={live.skipQuestion}
              finishGame={live.finishGame}
            />
          ) : null}
        </>
      )}
      <SecondaryButton label="العودة إلى اللوبي" onPress={onBack} />
    </Screen>
  );
}

export function HostGameScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'HostGame'>) {
  return (
    <GameExperience
      ticket={route.params.ticket}
      expectedRole="host"
      onBack={() => navigation.goBack()}
    />
  );
}

export function PlayerGameScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PlayerGame'>) {
  return (
    <GameExperience
      ticket={route.params.ticket}
      expectedRole="player"
      onBack={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: theme.spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.warning },
  statusDotConnected: { backgroundColor: theme.colors.success },
  statusText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sessionDetails: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  sessionLabel: {
    color: theme.colors.muted,
    fontFamily: theme.typography.semibold,
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sessionId: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  roomCode: {
    color: theme.colors.gold,
    fontFamily: theme.typography.bold,
    fontSize: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailText: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorText: {
    color: theme.colors.danger,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successText: {
    color: theme.colors.success,
    fontFamily: theme.typography.semibold,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  questionProgress: {
    color: theme.colors.gold,
    fontFamily: theme.typography.semibold,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  questionPrompt: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    fontSize: 22,
    lineHeight: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  options: { gap: theme.spacing.sm },
  answerOption: {
    minHeight: theme.touch.minimum,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  answerOptionSelected: {
    borderColor: theme.colors.gold,
    backgroundColor: theme.colors.surfaceStrong,
  },
  readOnlyOption: {
    minHeight: theme.touch.minimum,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  optionText: {
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.48 },
  revealAnswer: {
    color: theme.colors.goldLight,
    fontFamily: theme.typography.bold,
    fontSize: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  playerRow: {
    minHeight: theme.touch.minimum,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  playerRank: {
    width: 28,
    color: theme.colors.gold,
    fontFamily: theme.typography.bold,
    fontSize: 16,
    textAlign: 'center',
  },
  playerName: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.typography.semibold,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  playerScore: {
    color: theme.colors.muted,
    fontFamily: theme.typography.regular,
    fontSize: 13,
    writingDirection: 'rtl',
  },
});
