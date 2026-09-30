import { collectAllGames, type EnhancedGameMeta, type GameKind } from '@tahaddi/domain';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { arabicNumber } from '../live-room';
import { siteUrl } from '../join-flow';
import { theme } from '../theme';
import { AppText, Button, Screen, uiStyles } from '../ui';

const FILTERS: { kind: GameKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'الكل' },
  { kind: 'room', label: 'ألعاب الغرف' },
  { kind: 'instant', label: 'ألعاب فورية' },
  { kind: 'upcoming', label: 'قريبًا' },
];

const KIND_LABELS: Record<GameKind, string> = {
  room: 'غرفة مع مضيف',
  instant: 'لعب فوري',
  upcoming: 'قريبًا',
};

function playersLabel(game: EnhancedGameMeta) {
  if (game.minimumPlayers === game.maximumPlayers)
    return `${arabicNumber(game.minimumPlayers)} لاعب`;
  return `${arabicNumber(game.minimumPlayers)}–${arabicNumber(game.maximumPlayers)} لاعب`;
}

export function GamesScreen({ onBack }: { onBack: () => void }) {
  const games = useMemo(() => collectAllGames(), []);
  const [filter, setFilter] = useState<GameKind | 'all'>('all');
  const visible = filter === 'all' ? games : games.filter((game) => game.kind === filter);

  return (
    <Screen footer={<Button variant="ghost" label="رجوع إلى الانضمام" onPress={onBack} />}>
      <View>
        <AppText weight="semibold" style={uiStyles.eyebrow}>
          مكتبة الألعاب
        </AppText>
        <AppText weight="heading" style={uiStyles.title} accessibilityRole="header">
          ألعاب تحدّي
        </AppText>
        <AppText style={uiStyles.body}>
          ألعاب الغرف يقودها مضيف على الشاشة الكبيرة وتنضم إليها من هنا برمز الغرفة. الألعاب الفورية
          تفتح على الموقع.
        </AppText>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((item) => {
          const selected = item.kind === filter;
          return (
            <Pressable
              key={item.kind}
              onPress={() => setFilter(item.kind)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.filter, selected ? styles.filterSelected : null]}
            >
              <AppText
                weight="semibold"
                style={[styles.filterText, selected ? styles.filterTextSelected : null]}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {visible.map((game) => {
        const href = game.kind === 'upcoming' ? undefined : game.href;
        return (
          <Pressable
            key={game.id}
            disabled={!href}
            onPress={href ? () => void Linking.openURL(siteUrl(href)) : undefined}
            accessibilityRole={href ? 'link' : undefined}
            accessibilityHint={href ? 'يفتح اللعبة على موقع تحدّي' : undefined}
            style={({ pressed }) => [
              styles.game,
              { borderRightColor: game.accent },
              pressed ? styles.gamePressed : null,
            ]}
          >
            <View style={styles.gameHeader}>
              <AppText weight="heading" style={styles.gameTitle}>
                {game.title}
              </AppText>
              <AppText weight="semibold" style={[styles.kind, { color: game.accent }]}>
                {KIND_LABELS[game.kind]}
              </AppText>
            </View>
            <AppText style={styles.gameDescription} numberOfLines={3}>
              {game.description}
            </AppText>
            <View style={styles.tags}>
              <AppText style={styles.tag}>{playersLabel(game)}</AppText>
              {game.categories.slice(0, 3).map((category) => (
                <AppText key={category} style={styles.tag}>
                  {category}
                </AppText>
              ))}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  filter: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.ghost,
  },
  filterSelected: { borderColor: theme.colors.gold, backgroundColor: theme.colors.goldTint },
  filterText: { fontSize: 13, color: theme.colors.muted },
  filterTextSelected: { color: theme.colors.goldHover },
  game: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRightWidth: 3,
    backgroundColor: theme.colors.surface,
    experimental_backgroundImage: theme.gradients.card,
    boxShadow: '0 24px 70px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    gap: theme.spacing.xs,
  },
  gamePressed: { opacity: 0.85 },
  gameHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  gameTitle: { flex: 1, fontSize: 18 },
  kind: { fontSize: 12 },
  gameDescription: { color: theme.colors.textSoft, fontSize: 14, lineHeight: 23 },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  tag: {
    fontSize: 11,
    color: theme.colors.muted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceStrong,
    overflow: 'hidden',
  },
});
