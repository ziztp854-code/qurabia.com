import { describe, expect, it } from 'vitest';
import {
  BalootStateMachine,
  executeBotFallbackMove,
  mapRuntimePhaseToEngineState,
  validateCardMove,
} from './baloot-engine';
import type { Card } from './baloot';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('BalootStateMachine', () => {
  it('walks a complete round from lobby to scoring', () => {
    const machine = new BalootStateMachine();

    expect(machine.state).toBe('LOBBY_WAITING');
    expect(machine.transition('TABLE_FULL')).toBe('DEALING_PHASE_1');
    expect(machine.transition('FIRST_DEAL_COMPLETE')).toBe('BIDDING_PHASE');
    expect(machine.transition('CONTRACT_LOCKED')).toBe('DEALING_PHASE_2');
    expect(machine.transition('SECOND_DEAL_COMPLETE')).toBe('PROJECT_DECLARATION');
    expect(machine.transition('PROJECTS_RESOLVED')).toBe('TRICK_PLAYING');
    expect(machine.transition('ROUND_COMPLETE')).toBe('SCORING');
    expect(machine.transition('MATCH_CONTINUES')).toBe('DEALING_PHASE_1');
  });

  it('redeals after a void auction and ends the match from scoring', () => {
    const machine = new BalootStateMachine('BIDDING_PHASE');

    expect(machine.canTransition('AUCTION_VOID')).toBe(true);
    expect(machine.transition('AUCTION_VOID')).toBe('DEALING_PHASE_1');
    expect(() => machine.transition('ROUND_COMPLETE')).toThrow(/ROUND_COMPLETE/);

    const scoring = new BalootStateMachine('SCORING');
    expect(scoring.transition('MATCH_OVER')).toBe('LOBBY_WAITING');
  });

  it('maps the live runtime phases onto the seven-state engine', () => {
    expect(mapRuntimePhaseToEngineState('READY')).toBe('LOBBY_WAITING');
    expect(mapRuntimePhaseToEngineState('BIDDING')).toBe('BIDDING_PHASE');
    expect(mapRuntimePhaseToEngineState('DOUBLING')).toBe('BIDDING_PHASE');
    expect(mapRuntimePhaseToEngineState('PLAYING')).toBe('TRICK_PLAYING');
    expect(mapRuntimePhaseToEngineState('GAME_OVER')).toBe('SCORING');
  });
});

describe('validateCardMove', () => {
  it('rejects a card the player does not hold', () => {
    expect(
      validateCardMove([], [card('hearts', '7')], card('spades', 'A'), 'sun'),
    ).toEqual({ ok: false, code: 'ILLEGAL_MOVE' });
  });

  it('rejects a follow that ignores the led suit', () => {
    expect(
      validateCardMove(
        [card('hearts', 'A')],
        [card('hearts', '7'), card('spades', 'A')],
        card('spades', 'A'),
        'hokum',
        'spades',
      ),
    ).toEqual({ ok: false, code: 'ILLEGAL_MOVE' });
  });

  it('rejects undertrumping when a higher trump is available', () => {
    expect(
      validateCardMove(
        [card('hearts', 'A'), card('spades', '9')],
        [card('spades', 'A'), card('spades', 'J'), card('clubs', '7')],
        card('spades', 'A'),
        'hokum',
        'spades',
      ),
    ).toEqual({ ok: false, code: 'ILLEGAL_MOVE' });
  });

  it('accepts the required overtrump', () => {
    expect(
      validateCardMove(
        [card('hearts', 'A'), card('spades', '9')],
        [card('spades', 'A'), card('spades', 'J'), card('clubs', '7')],
        card('spades', 'J'),
        { mode: 'hokum', trump: 'spades' },
      ),
    ).toEqual({ ok: true, card: card('spades', 'J') });
  });

  it('rejects a malformed Hokum contract instead of treating it as a play fault', () => {
    expect(() =>
      validateCardMove([], [card('hearts', '7')], card('hearts', '7'), 'hokum'),
    ).toThrow(/trumpSuit/);
  });
});

describe('executeBotFallbackMove', () => {
  it('passes a weak opening hand and buys a Jack-heavy trump suit', () => {
    expect(
      executeBotFallbackMove(
        { phase: 'BIDDING_PHASE', currentTrick: [], botSeat: 0, contract: null },
        [card('clubs', '7'), card('diamonds', '8'), card('hearts', '7'), card('spades', '8'), card('clubs', '8')],
      ),
    ).toEqual({ kind: 'pass' });

    expect(
      executeBotFallbackMove(
        {
          phase: 'BIDDING_PHASE',
          currentTrick: [],
          botSeat: 0,
          contract: null,
          floorCard: card('spades', '9'),
        },
        [card('spades', 'J'), card('spades', 'A'), card('hearts', '7'), card('clubs', '8'), card('diamonds', '7')],
      ),
    ).toEqual({ kind: 'bid', contract: { mode: 'hokum', trump: 'spades' } });

    expect(
      executeBotFallbackMove(
        {
          phase: 'BIDDING_PHASE',
          currentTrick: [],
          botSeat: 0,
          contract: null,
          auctionRound: 2,
        },
        [
          card('hearts', 'A'),
          card('diamonds', 'A'),
          card('clubs', 'A'),
          card('spades', 'A'),
          card('clubs', 'K'),
        ],
      ),
    ).toEqual({ kind: 'pass' });
  });

  it('declares the strongest project automatically', () => {
    const move = executeBotFallbackMove(
      {
        phase: 'PROJECT_DECLARATION',
        currentTrick: [],
        botSeat: 0,
        contract: { mode: 'hokum', trump: 'hearts' },
      },
      [card('hearts', '7'), card('hearts', '8'), card('hearts', '9'), card('clubs', 'A')],
    );

    expect(move).toMatchObject({
      kind: 'declare',
      projects: [{ kind: 'run', cards: [card('hearts', '7'), card('hearts', '8'), card('hearts', '9')] }],
    });
  });

  it('dumps the cheapest legal card when the opponent is winning', () => {
    expect(
      executeBotFallbackMove(
        {
          phase: 'TRICK_PLAYING',
          botSeat: 1,
          contract: { mode: 'hokum', trump: 'spades' },
          currentTrick: [{ seat: 0, card: card('hearts', 'A') }],
        },
        [card('hearts', '10'), card('hearts', '7'), card('spades', 'J')],
      ),
    ).toEqual({ kind: 'play', card: card('hearts', '7') });
  });

  it('feeds the partner small points without overtaking the trick', () => {
    expect(
      executeBotFallbackMove(
        {
          phase: 'TRICK_PLAYING',
          botSeat: 2,
          contract: { mode: 'sun' },
          currentTrick: [
            { seat: 0, card: card('hearts', 'A') },
            { seat: 1, card: card('hearts', '7') },
          ],
        },
        [card('hearts', 'K'), card('hearts', '8')],
      ),
    ).toEqual({ kind: 'play', card: card('hearts', '8') });
  });
});
