import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayingCardFace, playingCardAsset } from './playing-card-face';

const suits = ['spades', 'hearts', 'clubs', 'diamonds'] as const;
const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

describe('PlayingCardFace', () => {
  it('isolates the printed 10 from page RTL and loads the exact local face', () => {
    const { container } = render(<div dir="rtl"><PlayingCardFace card={{ rank: '10', suit: 'hearts' }} /></div>);
    const host = container.querySelector('span[dir="ltr"]');
    expect(host).toHaveAttribute('data-rank', '10');
    expect(host).toHaveAttribute('data-suit', 'hearts');
    expect(host).toHaveAttribute('data-red');
    expect(host?.querySelector('img')).toHaveAttribute('src', '/game-art/baloot-cards/H-10.svg');
    expect(host?.querySelector('img')).toHaveAttribute('alt', '');
    expect(host?.querySelector('img')).toHaveAttribute('draggable', 'false');
  });

  it.each(suits)('ships all eight %s faces with matching printed identities and no external resources', (suit) => {
    for (const rank of ranks) {
      const asset = playingCardAsset({ suit, rank });
      const source = readFileSync(path.join(process.cwd(), 'public', asset), 'utf8');
      const document = new DOMParser().parseFromString(source, 'image/svg+xml');
      const face = document.documentElement;
      const suitCode = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[suit];
      expect(face.tagName).toBe('svg');
      expect(face.getAttribute('face')).toBe(`${rank === '10' ? 'T' : rank}${suitCode}`);
      expect(face.getAttribute('viewBox')).toBe('-120 -168 240 336');
      expect(document.querySelector('script, foreignObject, image')).toBeNull();
      for (const node of [...document.querySelectorAll('*')]) {
        for (const attribute of [...node.attributes]) {
          expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
          if (attribute.localName === 'href') expect(attribute.value.startsWith('#')).toBe(true);
        }
      }
    }
  });
});
