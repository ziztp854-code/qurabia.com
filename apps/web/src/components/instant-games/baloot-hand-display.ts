import { RANK_STRENGTH, type Contract, type Rank, type Suit } from '@tahaddi/domain';

/** Physical left-to-right suit order used by Gulf Baloot tables. */
const SUIT_ORDER: readonly Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

export type DisplayCard = Readonly<{ suit: Suit; rank: Rank }>;
type EscalationBid =
  | { mode: 'accept' }
  | { mode: 'double'; play: 'open' | 'locked' }
  | { mode: 'triple' }
  | { mode: 'quadruple'; play: 'open' | 'locked' }
  | { mode: 'gahwa' };

export function balootBidLabel(bid: EscalationBid) {
  if (bid.mode === 'accept') return 'قبول';
  if (bid.mode === 'double') return `دبل ${bid.play === 'open' ? 'مكشوف' : 'مقفل'} (×2)`;
  if (bid.mode === 'triple') return 'تريبل (×3)';
  if (bid.mode === 'quadruple') {
    return `فور ${bid.play === 'open' ? 'مكشوف' : 'مقفل'} (×4)`;
  }
  return 'قهوة';
}

export function handFanDegrees(index: number, count: number, arc = 26): number {
  if (count <= 1) return 0;
  return Number((((index - (count - 1) / 2) * arc) / (count - 1)).toFixed(2));
}

/**
 * Display-only ordering: trump (if any) first, then suits, high cards to the left.
 * Does not change deal order on the server or legal-play checks.
 */
export function sortHandForDisplay<T extends DisplayCard>(
  cards: readonly T[],
  contract: Contract | null,
): T[] {
  const trump = contract?.mode === 'hokum' ? contract.trump : null;
  const suitRank = (suit: Suit) => (trump && suit === trump ? -1 : SUIT_ORDER.indexOf(suit));
  const rankValue = (card: T) => {
    const mode = trump && card.suit === trump ? 'hokum' : 'sun';
    return RANK_STRENGTH[mode].indexOf(card.rank);
  };

  return [...cards].sort((left, right) => {
    const bySuit = suitRank(left.suit) - suitRank(right.suit);
    if (bySuit !== 0) return bySuit;
    return rankValue(right) - rankValue(left);
  });
}
