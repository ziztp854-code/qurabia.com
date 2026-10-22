import type {
  GameSnapshot,
  PlayerInfo,
  QuestionPayload,
  QuestionRevealPayload,
} from '@tahaddi/contracts';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  arabicNumber,
  findPlayer,
  OPTION_LABELS,
  questionCountdown,
  type PlayerIdentity,
} from '../live-room';
import { theme } from '../theme';
import { AppText, Button, Card, Screen, uiStyles } from '../ui';
import { useLiveRoom, type ConnectionStatus } from '../use-live-room';

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; color: string }> = {
  connecting: { label: 'جارٍ الاتصال…', color: theme.colors.gold },
  online: { label: 'متصل', color: theme.colors.success },
  offline: { label: 'انقطع الاتصال — نعيد المحاولة', color: theme.colors.danger },
};

export function RoomScreen({
  identity,
  onLeave,
}: {
  identity: PlayerIdentity;
  onLeave: () => void;
}) {
  const live = useLiveRoom(identity);
  const snapshot = live.room?.snapshot ?? null;
  const me = snapshot ? findPlayer(snapshot.leaderboard, identity.participantId) : null;
  const connection = CONNECTION_COPY[live.connection];

  return (
    <Screen
      footer={
        snapshot?.phase === 'FINISHED' || live.fatalError ? (
          <Button label="العب جولة أخرى" onPress={onLeave} />
        ) : (
          <Button variant="ghost" label="مغادرة الغرفة" onPress={onLeave} />
        )
      }
    >
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <AppText weight="bold" style={styles.playerName} numberOfLines={1}>
            {identity.displayName}
          </AppText>
          <AppText style={uiStyles.small}>
            غرفة <AppText style={styles.roomCode}>{identity.roomCode}</AppText>
          </AppText>
        </View>
        <View style={styles.headerScore} accessibilityLabel={`نقاطك ${me?.score ?? 0}`}>
          <AppText weight="heading" style={styles.scoreValue}>
            {arabicNumber(me?.score ?? snapshot?.playerResult?.totalScore ?? 0)}
          </AppText>
          <AppText style={uiStyles.small}>نقطة</AppText>
        </View>
      </View>

      <View style={styles.connection} accessibilityLiveRegion="polite">
        <View style={[styles.connectionDot, { backgroundColor: connection.color }]} />
        <AppText weight="semibold" style={[styles.connectionText, { color: connection.color }]}>
          {connection.label}
        </AppText>
      </View>

      {live.fatalError ? (
        <Card>
          <AppText weight="heading" style={uiStyles.title}>
            انتهت الجلسة
          </AppText>
          <AppText style={uiStyles.body}>{live.fatalError}</AppText>
        </Card>
      ) : !snapshot ? (
        <Card style={styles.centered}>
          <ActivityIndicator color={theme.colors.gold} size="large" />
          <AppText style={[uiStyles.body, styles.centerText]}>ندخلك إلى الغرفة…</AppText>
        </Card>
      ) : (
        <PhaseView
          snapshot={snapshot}
          participantId={identity.participantId}
          clockOffset={live.clockOffset}
          pendingOptionId={live.pendingOptionId}
          answerError={live.answerError}
          onAnswer={live.submitAnswer}
        />
      )}
    </Screen>
  );
}

function PhaseView({
  snapshot,
  participantId,
  clockOffset,
  pendingOptionId,
  answerError,
  onAnswer,
}: {
  snapshot: GameSnapshot;
  participantId: string;
  clockOffset: number;
  pendingOptionId: string | null;
  answerError: string | null;
  onAnswer: (optionId: string) => void;
}) {
  if (snapshot.phase === 'LOBBY') {
    return (
      <Card style={styles.centered}>
        <AppText weight="semibold" style={[uiStyles.eyebrow, styles.centerText]}>
          أنت في الغرفة
        </AppText>
        <AppText weight="heading" style={[uiStyles.title, styles.centerText]}>
          بانتظار المضيف
        </AppText>
        <AppText style={[uiStyles.body, styles.centerText]}>
          ستظهر الأسئلة هنا فور بدء الجولة. عدد اللاعبين الآن{' '}
          {arabicNumber(snapshot.participantCount)}.
        </AppText>
        <ActivityIndicator color={theme.colors.cyan} style={styles.spinner} />
      </Card>
    );
  }

  if (snapshot.phase === 'QUESTION' && snapshot.question) {
    return (
      <QuestionView
        question={snapshot.question}
        clockOffset={clockOffset}
        selectedOptionId={snapshot.playerAnswer?.optionId ?? pendingOptionId}
        locked={Boolean(snapshot.playerAnswer || pendingOptionId)}
        answerError={answerError}
        onAnswer={onAnswer}
      />
    );
  }

  if (snapshot.phase === 'REVEAL' && snapshot.question && snapshot.reveal) {
    return (
      <RevealView
        question={snapshot.question}
        reveal={snapshot.reveal}
        playerOptionId={snapshot.playerAnswer?.optionId ?? null}
        earnedPoints={
          snapshot.reveal.playerResult?.earnedPoints ?? snapshot.playerResult?.earnedPoints ?? null
        }
      />
    );
  }

  if (snapshot.phase === 'FINISHED') {
    const me = findPlayer(snapshot.leaderboard, participantId);
    return (
      <>
        <Card style={styles.centered}>
          <AppText weight="semibold" style={[uiStyles.eyebrow, styles.centerText]}>
            انتهت الجولة
          </AppText>
          <AppText weight="heading" style={styles.finalRank}>
            {me ? `المركز ${arabicNumber(me.rank)}` : 'شكرًا للمشاركة'}
          </AppText>
          {me ? (
            <AppText style={[uiStyles.body, styles.centerText]}>
              {arabicNumber(me.score)} نقطة
              {me.correctAnswers !== undefined
                ? ` • ${arabicNumber(me.correctAnswers)} إجابات صحيحة`
                : ''}
            </AppText>
          ) : null}
        </Card>
        <Leaderboard
          players={snapshot.leaderboard}
          participantId={participantId}
          title="الترتيب النهائي"
        />
      </>
    );
  }

  return (
    <Leaderboard
      players={snapshot.leaderboard}
      participantId={participantId}
      title="لوحة الصدارة"
    />
  );
}

function QuestionView({
  question,
  clockOffset,
  selectedOptionId,
  locked,
  answerError,
  onAnswer,
}: {
  question: QuestionPayload;
  clockOffset: number;
  selectedOptionId: string | null;
  locked: boolean;
  answerError: string | null;
  onAnswer: (optionId: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const countdown = questionCountdown(question, now, clockOffset);
  const expired = countdown.secondsLeft === 0 && !countdown.notStarted;
  const image = question.media.find((item) => item.type === 'image');
  const options = [...question.options].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <View style={styles.questionMeta}>
        <AppText weight="semibold" style={uiStyles.eyebrow}>
          السؤال {arabicNumber(question.questionNumber)} من {arabicNumber(question.totalQuestions)}
        </AppText>
        <AppText
          weight="bold"
          style={[styles.timer, countdown.secondsLeft <= 5 ? styles.timerUrgent : null]}
          accessibilityLabel={`متبقٍ ${countdown.secondsLeft} ثانية`}
        >
          {countdown.notStarted ? 'استعد' : arabicNumber(countdown.secondsLeft)}
        </AppText>
      </View>
      <View style={styles.timerTrack} accessibilityElementsHidden>
        <View
          style={[
            styles.timerFill,
            { width: `${Math.round(countdown.fractionLeft * 100)}%` },
            countdown.secondsLeft <= 5 ? styles.timerFillUrgent : null,
          ]}
        />
      </View>

      {image ? (
        <Image
          source={{ uri: image.url }}
          style={styles.media}
          resizeMode="contain"
          accessibilityLabel={image.alt ?? 'صورة السؤال'}
        />
      ) : null}

      <AppText weight="heading" style={styles.prompt} accessibilityRole="header">
        {question.prompt}
      </AppText>

      <View style={styles.options}>
        {options.map((option, index) => {
          const selected = option.id === selectedOptionId;
          const disabled = locked || expired || countdown.notStarted;
          return (
            <Pressable
              key={option.id}
              onPress={() => onAnswer(option.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={option.text}
              accessibilityState={{ selected, disabled }}
              android_ripple={{ color: theme.colors.press }}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : null,
                disabled && !selected ? styles.optionMuted : null,
                pressed && !disabled ? styles.optionPressed : null,
              ]}
            >
              <View style={[styles.optionBadge, selected ? styles.optionBadgeSelected : null]}>
                <AppText
                  weight="bold"
                  style={[styles.optionBadgeText, selected ? styles.optionBadgeTextSelected : null]}
                >
                  {OPTION_LABELS[index] ?? arabicNumber(index + 1)}
                </AppText>
              </View>
              <AppText weight="semibold" style={styles.optionText}>
                {option.text}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText
        style={[answerError ? uiStyles.danger : uiStyles.small, styles.answerStatus]}
        accessibilityLiveRegion="polite"
      >
        {answerError ??
          (selectedOptionId
            ? 'تم استلام إجابتك. انتظر كشف الإجابة الصحيحة.'
            : expired
              ? 'انتهى الوقت.'
              : 'اختر إجابة واحدة قبل نفاد الوقت.')}
      </AppText>
    </Card>
  );
}

function RevealView({
  question,
  reveal,
  playerOptionId,
  earnedPoints,
}: {
  question: QuestionPayload;
  reveal: QuestionRevealPayload;
  playerOptionId: string | null;
  earnedPoints: number | null;
}) {
  const correct = playerOptionId === reveal.correctOptionId;
  const options = [...question.options].sort((a, b) => a.position - b.position);
  const percentages = new Map(reveal.stats.options.map((item) => [item.optionId, item.percentage]));

  return (
    <Card>
      <AppText
        weight="heading"
        style={[
          styles.verdict,
          playerOptionId ? (correct ? styles.verdictCorrect : styles.verdictWrong) : null,
        ]}
        accessibilityRole="alert"
      >
        {!playerOptionId ? 'لم تُجب هذه المرة' : correct ? 'إجابة صحيحة!' : 'إجابة خاطئة'}
      </AppText>
      {correct && earnedPoints ? (
        <AppText weight="semibold" style={styles.points}>
          +{arabicNumber(earnedPoints)} نقطة
        </AppText>
      ) : null}
      <AppText style={[uiStyles.body, styles.revealPrompt]}>{question.prompt}</AppText>

      <View style={styles.options}>
        {options.map((option, index) => {
          const isCorrect = option.id === reveal.correctOptionId;
          const isMine = option.id === playerOptionId;
          return (
            <View
              key={option.id}
              style={[
                styles.option,
                isCorrect ? styles.optionCorrect : isMine ? styles.optionWrong : styles.optionMuted,
              ]}
              accessibilityLabel={`${option.text}${isCorrect ? '، الإجابة الصحيحة' : ''}${isMine ? '، إجابتك' : ''}`}
            >
              <View style={styles.optionBadge}>
                <AppText weight="bold" style={styles.optionBadgeText}>
                  {OPTION_LABELS[index] ?? arabicNumber(index + 1)}
                </AppText>
              </View>
              <AppText weight="semibold" style={styles.optionText}>
                {option.text}
              </AppText>
              <AppText style={uiStyles.small}>
                {arabicNumber(percentages.get(option.id) ?? 0)}٪
              </AppText>
            </View>
          );
        })}
      </View>

      {reveal.explanation ? (
        <AppText style={[uiStyles.body, styles.explanation]}>{reveal.explanation}</AppText>
      ) : null}
    </Card>
  );
}

function Leaderboard({
  players,
  participantId,
  title,
}: {
  players: PlayerInfo[];
  participantId: string;
  title: string;
}) {
  const ranked = [...players].sort((a, b) => a.rank - b.rank);
  const top = ranked.slice(0, 10);
  const me = ranked.find((player) => player.id === participantId);
  const rows = me && !top.includes(me) ? [...top, me] : top;

  return (
    <Card>
      <AppText weight="heading" style={uiStyles.title} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.leaderboard}>
        {rows.length === 0 ? (
          <AppText style={uiStyles.body}>لا توجد نتائج بعد.</AppText>
        ) : (
          rows.map((player) => {
            const mine = player.id === participantId;
            return (
              <View key={player.id} style={[styles.leaderRow, mine ? styles.leaderRowMine : null]}>
                <AppText
                  weight="bold"
                  style={[styles.leaderRank, player.rank <= 3 ? styles.leaderRankTop : null]}
                >
                  {arabicNumber(player.rank)}
                </AppText>
                <AppText
                  weight={mine ? 'bold' : 'semibold'}
                  style={styles.leaderName}
                  numberOfLines={1}
                >
                  {player.name}
                  {mine ? ' (أنت)' : ''}
                </AppText>
                <AppText weight="semibold" style={styles.leaderScore}>
                  {arabicNumber(player.score)}
                </AppText>
              </View>
            );
          })
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  headerIdentity: { flex: 1 },
  playerName: { fontSize: 20, color: theme.colors.gold },
  roomCode: { color: theme.colors.text, writingDirection: 'ltr', letterSpacing: 1.2 },
  headerScore: {
    alignItems: 'center',
    minWidth: 76,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderGold,
    backgroundColor: theme.colors.ghost,
  },
  scoreValue: { fontSize: 22, color: theme.colors.gold, textAlign: 'center' },
  connection: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 32,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: 12 },
  centered: { alignItems: 'center', gap: theme.spacing.xs },
  centerText: { textAlign: 'center' },
  spinner: { marginTop: theme.spacing.md },
  questionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { fontSize: 30, color: theme.colors.cyan, minWidth: 48, textAlign: 'center' },
  timerUrgent: { color: theme.colors.danger },
  timerTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surfaceStrong,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  timerFill: { height: '100%', borderRadius: 3, backgroundColor: theme.colors.cyan },
  timerFillUrgent: { backgroundColor: theme.colors.danger },
  media: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  prompt: { fontSize: 21, lineHeight: 34, marginTop: theme.spacing.md },
  options: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 58,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
  },
  optionSelected: { borderColor: theme.colors.gold, backgroundColor: theme.colors.goldTint },
  optionPressed: { opacity: 0.85 },
  optionMuted: { opacity: 0.6 },
  optionCorrect: { borderColor: theme.colors.success, backgroundColor: theme.colors.successTint },
  optionWrong: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerTint },
  optionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderGold,
  },
  optionBadgeSelected: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
  optionBadgeText: { fontSize: 15, color: theme.colors.gold, textAlign: 'center' },
  optionBadgeTextSelected: { color: theme.colors.onGold },
  optionText: { flex: 1, fontSize: 16, lineHeight: 25 },
  answerStatus: { marginTop: theme.spacing.md, minHeight: 40 },
  verdict: { fontSize: 28, lineHeight: 40, textAlign: 'center', color: theme.colors.text },
  verdictCorrect: { color: theme.colors.success },
  verdictWrong: { color: theme.colors.danger },
  points: {
    fontSize: 18,
    color: theme.colors.gold,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  revealPrompt: { textAlign: 'center' },
  explanation: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSoft,
  },
  finalRank: { fontSize: 36, lineHeight: 50, color: theme.colors.gold, textAlign: 'center' },
  leaderboard: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 48,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
  },
  leaderRowMine: {
    borderWidth: 1,
    borderColor: theme.colors.borderGold,
    backgroundColor: theme.colors.goldTint,
  },
  leaderRank: { width: 32, fontSize: 16, color: theme.colors.muted, textAlign: 'center' },
  leaderRankTop: { color: theme.colors.gold },
  leaderName: { flex: 1, fontSize: 15 },
  leaderScore: { fontSize: 15, color: theme.colors.gold },
});
