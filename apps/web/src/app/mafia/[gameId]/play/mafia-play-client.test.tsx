import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MafiaPlayClient } from './mafia-play-client';

const mocks = vi.hoisted(() => ({
  submitMafiaAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/mafia/actions', () => ({
  submitMafiaAction: mocks.submitMafiaAction,
  submitMafiaVote: vi.fn(),
  sendMafiaMessage: vi.fn(),
}));

vi.mock('@/components/live', () => ({
  RoomPoller: () => null,
}));

vi.mock('@/components/mafia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/mafia')>();
  return {
    ...actual,
    MafiaPhaseHeader: () => null,
    MafiaPrimaryTask: ({ children }: { children: React.ReactNode }) => (
      <section>{children}</section>
    ),
    MafiaSecretPanel: () => null,
    MafiaInvestigationDossier: () => null,
    MafiaVotePanel: () => null,
  };
});

describe('MafiaPlayClient — قرار المحقق', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitMafiaAction.mockResolvedValue(true);
  });

  it('لا يرسل التحقيق عند اختيار اللاعب بل ينتظر زر التأكيد', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MafiaPlayClient
        game={{
          id: 'game-1',
          currentRound: 2,
          phaseEndsAt: null,
          autoMode: false,
          chatEnabled: true,
          messages: [],
          participants: [],
        }}
        player={{
          id: 'detective-1',
          displayName: 'المحقق',
          role: 'DETECTIVE',
          status: 'ALIVE',
          isMuted: false,
          privateNote: null,
        }}
        phase="NIGHT"
        role="DETECTIVE"
        phaseDuration={45}
        nightTargets={[{ id: 'suspect-1', displayName: 'سالم' }]}
        voteTargets={[]}
        investigations={[]}
      />,
    );

    const confirmButton = screen.getByRole('button', {
      name: 'تثبيت التحقيق وكشف النتيجة',
    });
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /سالم/ }));
    expect(mocks.submitMafiaAction).not.toHaveBeenCalled();
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    await waitFor(() => expect(mocks.submitMafiaAction).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/أُغلق ملف هذه الليلة/)).toBeInTheDocument();

    rerender(
      <MafiaPlayClient
        game={{
          id: 'game-1',
          currentRound: 3,
          phaseEndsAt: null,
          autoMode: false,
          chatEnabled: true,
          messages: [],
          participants: [],
        }}
        player={{
          id: 'detective-1',
          displayName: 'المحقق',
          role: 'DETECTIVE',
          status: 'ALIVE',
          isMuted: false,
          privateNote: null,
        }}
        phase="NIGHT"
        role="DETECTIVE"
        phaseDuration={45}
        nightTargets={[{ id: 'suspect-2', displayName: 'ناصر' }]}
        voteTargets={[]}
        investigations={[
          {
            id: 'investigation-2',
            round: 2,
            targetId: 'suspect-1',
            targetName: 'سالم',
            resultIsKiller: true,
            createdAt: '2026-08-10T20:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByRole('radio', { name: /ناصر/ })).toBeInTheDocument();
    expect(screen.queryByText(/أُغلق ملف هذه الليلة/)).not.toBeInTheDocument();
  });
});
