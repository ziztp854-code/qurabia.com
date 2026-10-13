import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MafiaPlayClient } from './mafia-play-client';

const mocks = vi.hoisted(() => ({
  submitMafiaAction: vi.fn(),
  submitMafiaVote: vi.fn(),
  sendMafiaMessage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/mafia/actions', () => ({
  submitMafiaAction: mocks.submitMafiaAction,
  submitMafiaVote: mocks.submitMafiaVote,
  sendMafiaMessage: mocks.sendMafiaMessage,
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
  };
});

describe('MafiaPlayClient — قرار المحقق', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitMafiaAction.mockResolvedValue(true);
    mocks.submitMafiaVote.mockResolvedValue(true);
    mocks.sendMafiaMessage.mockResolvedValue(true);
  });

  const props = {
    game: {
      id: 'game-1',
      currentRound: 2,
      phaseEndsAt: null,
      autoMode: false,
      chatEnabled: true,
      messages: [],
      participants: [],
    },
    player: {
      id: 'detective-1',
      displayName: 'المحقق',
      role: 'DETECTIVE',
      status: 'ALIVE',
      isMuted: false,
      privateNote: null,
    },
    phase: 'NIGHT' as const,
    role: 'DETECTIVE' as const,
    phaseDuration: 45,
    nightTargets: [{ id: 'suspect-1', displayName: 'سالم' }],
    voteTargets: [{ id: 'suspect-1', displayName: 'سالم' }],
    investigations: [],
  };

  it('lets a player vote again in the next voting round', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MafiaPlayClient {...props} phase="VOTING" />);
    await user.click(screen.getByRole('radio', { name: /سالم/ }));
    await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
    await screen.findByText('تم تسجيل صوتك');
    rerender(
      <MafiaPlayClient {...props} phase="VOTING" game={{ ...props.game, currentRound: 3 }} />,
    );
    expect(screen.queryByText('تم تسجيل صوتك')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /سالم/ }));
    await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
    await screen.findByText('تم تسجيل صوتك');
    expect(mocks.submitMafiaVote).toHaveBeenCalledTimes(2);
    expect(mocks.submitMafiaVote.mock.calls[1][0].get('round')).toBe('3');
  });

  it('hides night controls from eliminated players', () => {
    render(<MafiaPlayClient {...props} player={{ ...props.player, status: 'ELIMINATED' }} />);
    expect(screen.queryByRole('radio', { name: /سالم/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تثبيت التحقيق/ })).not.toBeInTheDocument();
  });

  it('shows the winning side to eliminated players when the game finishes', () => {
    render(
      <MafiaPlayClient
        {...props}
        phase="FINISHED"
        game={{ ...props.game, winner: 'CITIZENS' }}
        player={{ ...props.player, status: 'ELIMINATED' }}
      />,
    );
    expect(screen.getByText('الفائز: المواطنون')).toBeInTheDocument();
    expect(screen.queryByText(/اللعبة مستمرة/)).not.toBeInTheDocument();
  });

  it('preserves a chat message rejected by the server', async () => {
    const user = userEvent.setup();
    mocks.sendMafiaMessage.mockResolvedValue(false);
    render(<MafiaPlayClient {...props} phase="DAY" />);
    await user.type(screen.getByRole('textbox', { name: 'اكتب رسالة' }), 'رسالة الاختبار');
    await user.click(screen.getByRole('button', { name: 'إرسال الرسالة' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: 'اكتب رسالة' })).toHaveValue('رسالة الاختبار');
  });

  it('keeps the night target selected after a network failure', async () => {
    const user = userEvent.setup();
    mocks.submitMafiaAction.mockRejectedValueOnce(new Error('offline'));
    render(<MafiaPlayClient {...props} />);
    await user.click(screen.getByRole('radio', { name: /سالم/ }));
    await user.click(screen.getByRole('button', { name: 'تثبيت التحقيق وكشف النتيجة' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('radio', { name: /سالم/ })).toBeChecked();
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
