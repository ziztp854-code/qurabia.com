'use client';

import Image from 'next/image';
import type { BalootCard, BalootSuit } from './use-baloot-socket';
import styles from './playing-card-face.module.css';

const SUIT_NAME: Record<BalootSuit, string> = {
  spades: 'السبيت',
  hearts: 'الشيريا',
  clubs: 'الهاص',
  diamonds: 'الديمن',
};
const SUIT_ASSET: Record<BalootSuit, string> = {
  spades: 'S',
  hearts: 'H',
  clubs: 'C',
  diamonds: 'D',
};

export function isRedSuit(suit: BalootSuit) {
  return suit === 'hearts' || suit === 'diamonds';
}

export function suitName(suit: BalootSuit) {
  return SUIT_NAME[suit];
}

export function playingCardAsset(card: Pick<BalootCard, 'rank' | 'suit'>) {
  return `/game-art/baloot-cards/${SUIT_ASSET[card.suit]}-${card.rank}.svg`;
}

/** Local CC0 print artwork stays sharp at every size, with isolated LTR indices.
 * The surrounding play button supplies the accessible rank, suit and action.
 */
export function PlayingCardFace({ card }: { card: Pick<BalootCard, 'rank' | 'suit'> }) {
  return (
    <span
      className={styles.faceHost}
      dir="ltr"
      data-rank={card.rank}
      data-suit={card.suit}
      data-red={isRedSuit(card.suit) || undefined}
    >
      <Image
        className={styles.face}
        src={playingCardAsset(card)}
        alt=""
        width={250}
        height={350}
        unoptimized
        loading="eager"
        draggable={false}
      />
    </span>
  );
}
