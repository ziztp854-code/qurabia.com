'use client';

import type { BalootCard, BalootSuit } from './use-baloot-socket';
import styles from './playing-card-face.module.css';

const SUIT_NAME: Record<BalootSuit, string> = {
  spades: 'السبيت',
  hearts: 'الشيريا',
  clubs: 'الهاص',
  diamonds: 'الديمن',
};

export function isRedSuit(suit: BalootSuit) {
  return suit === 'hearts' || suit === 'diamonds';
}

export function suitName(suit: BalootSuit) {
  return SUIT_NAME[suit];
}

/** Every glyph is drawn inside the same 100×100 box so pips can be placed by centre point. */
function SuitGlyph({ suit }: { suit: BalootSuit }) {
  if (suit === 'hearts') {
    return (
      <path d="M50 90C30 74 8 56 8 34 8 19 19 9 31 9c9 0 16 6 19 13 3-7 10-13 19-13 12 0 23 10 23 25 0 22-22 40-42 56Z" />
    );
  }
  if (suit === 'diamonds') {
    return <path d="M50 5 90 50 50 95 10 50Z" />;
  }
  if (suit === 'spades') {
    // Fix #4: the stem (sag) is now a pointed triangle that tapers to the
    // baseline, instead of a flat-bottomed trapezoid that read as a
    // "shoe" rather than a card suit.
    return (
      <path d="M50 7c0 0 42 32 42 55 0 14-10 23-21 23-8 0-15-4-18-11 1 10 5 18 13 22L50 96 34 73c8-4 12-12 13-22-3 7-10 11-18 11-11 0-21-9-21-23C8 39 50 7 50 7Z" />
    );
  }
  return (
    <g>
      <circle cx="50" cy="29" r="21" />
      <circle cx="26" cy="60" r="21" />
      <circle cx="74" cy="60" r="21" />
      {/* Fix #5: tapered, pointed stem that mirrors the spade's geometry
          instead of the previous flat-bottomed trapezoid. */}
      <path d="M50 65c-2 12-6 22-14 28L50 96l14-3c-8-6-12-16-14-28Z" />
    </g>
  );
}

const CARD_WIDTH = 250;
const CARD_HEIGHT = 350;
const CENTRE_X = CARD_WIDTH / 2;
const CENTRE_Y = CARD_HEIGHT / 2;
const PIP_COLUMN = { left: 88, centre: CENTRE_X, right: 162 } as const;
const PIP_TOP = 74;
const PIP_SPAN = 202;

type Column = keyof typeof PIP_COLUMN;
type Pip = [Column, number];

/** Standard pip arrangements; the fraction is the row position between the top and bottom pip. */
const PIP_LAYOUTS: Record<string, Pip[]> = {
  '7': [
    ['left', 0],
    ['right', 0],
    ['centre', 0.25],
    ['left', 0.5],
    ['right', 0.5],
    ['left', 1],
    ['right', 1],
  ],
  '8': [
    ['left', 0],
    ['right', 0],
    ['centre', 0.25],
    ['left', 0.5],
    ['right', 0.5],
    ['centre', 0.75],
    ['left', 1],
    ['right', 1],
  ],
  '9': [
    ['left', 0],
    ['right', 0],
    ['left', 1 / 3],
    ['right', 1 / 3],
    ['centre', 0.5],
    ['left', 2 / 3],
    ['right', 2 / 3],
    ['left', 1],
    ['right', 1],
  ],
  '10': [
    ['left', 0],
    ['right', 0],
    ['centre', 1 / 6],
    ['left', 1 / 3],
    ['right', 1 / 3],
    ['left', 2 / 3],
    ['right', 2 / 3],
    ['centre', 5 / 6],
    ['left', 1],
    ['right', 1],
  ],
};

function Glyph({ suit, x, y, size, flip }: { suit: BalootSuit; x: number; y: number; size: number; flip?: boolean }) {
  const scale = size / 100;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform={flip ? 'rotate(180)' : undefined} data-pip-flip={flip || undefined}>
        <g transform={`scale(${scale}) translate(-50 -50)`}>
          <SuitGlyph suit={suit} />
        </g>
      </g>
    </g>
  );
}

function CornerIndex({ rank, suit }: { rank: string; suit: BalootSuit }) {
  return (
    <g>
      <text className={styles.index} x="30" y="56" textAnchor="middle" direction="ltr">
        {rank}
      </text>
      <Glyph suit={suit} x={30} y={92} size={34} />
    </g>
  );
}

/**
 * Court cards are mirrored around the middle like a real deck, so the card reads
 * the same whichever way the player holds it.
 */
function CourtHalf({ suit }: { suit: BalootSuit }) {
  return (
    <g>
      <path
        className={styles.courtInk}
        d="M92 98V74l12 11 11-20 10 15 10-15 11 20 12-11v24Z"
      />
      <circle className={styles.courtInk} cx="125" cy="118" r="13" />
      <path
        className={styles.courtInk}
        d="M99 134c8 7 17 11 26 11s18-4 26-11c14 8 22 24 22 41H77c0-17 8-33 22-41Z"
      />
      <path className={styles.courtHighlight} d="M125 145l9 15-9 15-9-15Z" />
      <Glyph suit={suit} x={94} y={158} size={22} />
    </g>
  );
}

function CardBody({ rank, suit }: { rank: string; suit: BalootSuit }) {
  if (rank === 'A') {
    return <Glyph suit={suit} x={CENTRE_X} y={CENTRE_Y} size={122} />;
  }

  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return (
      <g data-court="">
        <rect className={styles.courtPanel} x="54" y="54" width="142" height="242" rx="12" />
        <CourtHalf suit={suit} />
        <g transform={`rotate(180 ${CENTRE_X} ${CENTRE_Y})`}>
          <CourtHalf suit={suit} />
        </g>
        <line className={styles.courtDivider} x1="54" y1={CENTRE_Y} x2="196" y2={CENTRE_Y} />
      </g>
    );
  }

  const layout = PIP_LAYOUTS[rank];
  if (!layout) return null;

  return (
    <g>
      {layout.map(([column, fraction], index) => (
        <Glyph
          key={`${column}-${index}`}
          suit={suit}
          x={PIP_COLUMN[column]}
          y={PIP_TOP + fraction * PIP_SPAN}
          size={44}
          flip={fraction > 0.5}
        />
      ))}
    </g>
  );
}

export function PlayingCardFace({ card }: { card: Pick<BalootCard, 'rank' | 'suit'> }) {
  return (
    <span className={styles.faceHost} dir="ltr">
      <svg
        className={styles.face}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        direction="ltr"
        data-rank={card.rank}
        data-suit={card.suit}
        data-red={isRedSuit(card.suit) || undefined}
        role="presentation"
        focusable="false"
      >
        <rect className={styles.paper} x="0" y="0" width={CARD_WIDTH} height={CARD_HEIGHT} rx="18" />
        <CornerIndex rank={card.rank} suit={card.suit} />
        <g transform={`rotate(180 ${CENTRE_X} ${CENTRE_Y})`}>
          <CornerIndex rank={card.rank} suit={card.suit} />
        </g>
        <CardBody rank={card.rank} suit={card.suit} />
      </svg>
    </span>
  );
}
