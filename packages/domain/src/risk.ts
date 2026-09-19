export type RiskCardKind = 'points' | 'bomb' | 'double' | 'shield' | 'treasure';
export type RiskDifficulty = 'calm' | 'balanced' | 'risky';

export type RiskCard = {
  id: string;
  kind: RiskCardKind;
  value: number;
};

export const RISK_PRESETS: Record<RiskDifficulty, { label: string; cards: number; bombs: number }> =
  {
    calm: { label: 'هادئ', cards: 20, bombs: 1 },
    balanced: { label: 'متوازن', cards: 24, bombs: 3 },
    risky: { label: 'مجازف', cards: 24, bombs: 5 },
  };

export function buildRiskDeck(
  difficulty: RiskDifficulty,
  random: () => number = Math.random,
): RiskCard[] {
  const { cards, bombs } = RISK_PRESETS[difficulty];
  const fixedKinds: RiskCardKind[] = [
    ...Array.from({ length: bombs }, () => 'bomb' as const),
    'shield',
    'shield',
    'double',
    'double',
    'treasure',
    'treasure',
  ];
  const pointValues = [5, 10, 15, 20, 25, 30];
  const deck = Array.from({ length: cards }, (_, index): RiskCard => {
    const kind = fixedKinds[index] ?? 'points';
    return {
      id: `risk-card-${index + 1}`,
      kind,
      value:
        kind === 'points'
          ? pointValues[(index - fixedKinds.length) % pointValues.length]!
          : kind === 'treasure'
            ? 30
            : 0,
    };
  });
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck.map((card, index) => ({ ...card, id: `risk-card-${index + 1}` }));
}
