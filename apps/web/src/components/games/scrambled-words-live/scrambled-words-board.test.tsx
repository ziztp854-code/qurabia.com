import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ScrambledWordsBoard,
  buildAttemptWord,
  remainingWordLengths,
} from './scrambled-words-board';

const puzzle = {
  id: 'pz1',
  imageUrl: '/games/scrambled-words-live/beach.jpg',
  fragments: ['بح', 'ر', 'ام', 'واج', 'شا', 'طئ'],
  wordLengths: [3, 5, 4],
  roundNumber: 1,
};

describe('buildAttemptWord', () => {
  it('joins fragments in selected order', () => {
    expect(buildAttemptWord(['بح', 'ر', 'شا'], [2, 0, 1])).toBe('شابحر');
  });
});

describe('remainingWordLengths', () => {
  it('consumes solved lengths as a multiset', () => {
    expect(remainingWordLengths([3, 5, 4], ['بحر'])).toEqual([5, 4]);
    expect(remainingWordLengths([4, 4], ['كتاب'])).toEqual([4]);
    expect(remainingWordLengths([3, 4], [])).toEqual([3, 4]);
  });
});

describe('ScrambledWordsBoard', () => {
  it('submits the assembled word when it reaches a target length', async () => {
    const user = userEvent.setup();
    const onSubmitWord = vi.fn();
    render(
      <ScrambledWordsBoard
        puzzle={puzzle}
        solvedWords={[]}
        disabled={false}
        rejectedTick={0}
        roundLabel="الجولة 1 من 5"
        timeLabel="1:00"
        onSubmitWord={onSubmitWord}
      />,
    );

    const slots = screen.getAllByText('ـــ');
    expect(slots.length).toBe(1);

    await user.click(screen.getByRole('button', { name: 'بح' }));
    await user.click(screen.getByRole('button', { name: 'ر' }));

    expect(onSubmitWord).toHaveBeenCalledWith('بحر');
    expect(
      screen.getByRole('button', { name: 'إزالة المقطع بح' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إزالة المقطع ر' })).toBeInTheDocument();
  });

  it('does not submit an attempt whose length matches no remaining word', async () => {
    const user = userEvent.setup();
    const onSubmitWord = vi.fn();
    render(
      <ScrambledWordsBoard
        puzzle={puzzle}
        solvedWords={['بحر']}
        disabled={false}
        rejectedTick={0}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:40"
        onSubmitWord={onSubmitWord}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'بح' }));
    expect(onSubmitWord).not.toHaveBeenCalled();
  });

  it('ignores clicks on used fragments while disabled', async () => {
    const user = userEvent.setup();
    const onSubmitWord = vi.fn();
    render(
      <ScrambledWordsBoard
        puzzle={puzzle}
        solvedWords={[]}
        disabled
        rejectedTick={0}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:10"
        onSubmitWord={onSubmitWord}
      />,
    );

    const first = screen.getByRole('button', { name: 'بح' });
    expect(first).toBeDisabled();
    await user.click(first);
    expect(onSubmitWord).not.toHaveBeenCalled();
  });
});
