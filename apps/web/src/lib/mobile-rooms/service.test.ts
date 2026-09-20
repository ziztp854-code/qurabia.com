import { describe, expect, it, vi } from 'vitest';
import { MobileRoomsError, createMobileRoomsService, type MobileRoomsRepository } from './service';

function repository(overrides: Partial<MobileRoomsRepository> = {}): MobileRoomsRepository {
  return {
    listHostQuizzes: vi.fn().mockResolvedValue([]),
    findHostQuiz: vi.fn().mockResolvedValue(null),
    countOptionlessQuestions: vi.fn().mockResolvedValue(0),
    findOngoingSession: vi.fn().mockResolvedValue(null),
    createOrReuseSession: vi.fn(),
    readRoom: vi.fn().mockResolvedValue(null),
    joinRoomAtomically: vi.fn(),
    ...overrides,
  };
}

describe('mobile rooms service', () => {
  it('rejects malformed room codes before touching the repository', async () => {
    const repo = repository();
    const service = createMobileRoomsService({
      repository: repo,
      resolvePlan: vi.fn(),
      consumeRoomQuota: vi.fn(),
      refundRoomQuota: vi.fn(),
      createHostCredential: vi.fn(),
      createPlayerCredential: vi.fn(),
    });

    await expect(
      service.joinRoom({ roomCode: '../bad', displayName: 'لاعب' }),
    ).rejects.toMatchObject({
      code: 'INVALID_ROOM_CODE',
      status: 400,
    });
    expect(repo.readRoom).not.toHaveBeenCalled();
  });

  it('creates a room through the existing plan and quota rules and returns a host ticket', async () => {
    const repo = repository({
      findHostQuiz: vi.fn().mockResolvedValue({
        id: 'quiz-1',
        title: 'مسابقة التاريخ',
        roomCode: 'ABC234',
        gameMode: 'QUIZ',
        maxPlayers: 10,
        questionCount: 3,
      }),
      createOrReuseSession: vi.fn().mockResolvedValue({
        session: { id: 'session-1', roomCode: 'ABC234', status: 'WAITING' },
        created: true,
      }),
      readRoom: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        roomCode: 'ABC234',
        status: 'WAITING',
        title: 'مسابقة التاريخ',
        maxPlayers: 10,
        participants: [],
      }),
    });
    const consumeRoomQuota = vi.fn().mockResolvedValue({ ok: true, unlimited: false });
    const service = createMobileRoomsService({
      repository: repo,
      resolvePlan: vi
        .fn()
        .mockResolvedValue({ code: 'SPECTATOR', maxRoomPlayers: 10, bypassesLimits: false }),
      consumeRoomQuota,
      refundRoomQuota: vi.fn(),
      createHostCredential: vi.fn().mockReturnValue({
        accessToken: 'signed-host-token',
        expiresAt: 1_800_000_000_000,
        subjectVersion: 4,
      }),
      createPlayerCredential: vi.fn(),
    });

    await expect(
      service.createRoom({
        user: { id: 'user-1', role: 'USER', tokenVersion: 4 },
        quizId: 'quiz-1',
      }),
    ).resolves.toEqual({
      room: {
        sessionId: 'session-1',
        roomCode: 'ABC234',
        status: 'WAITING',
        title: 'مسابقة التاريخ',
        maxPlayers: 10,
        participants: [],
      },
      ticket: {
        sessionId: 'session-1',
        subjectId: 'user-1',
        role: 'host',
        accessToken: 'signed-host-token',
        expiresAt: 1_800_000_000_000,
        subjectVersion: 4,
      },
    });
    expect(consumeRoomQuota).toHaveBeenCalledWith('user-1', 'USER');
  });

  it('does not allow a room capacity above the current rank', async () => {
    const repo = repository({
      findHostQuiz: vi.fn().mockResolvedValue({
        id: 'quiz-1',
        title: 'مسابقة',
        roomCode: 'ABC234',
        gameMode: 'QUIZ',
        maxPlayers: 30,
        questionCount: 2,
      }),
    });
    const service = createMobileRoomsService({
      repository: repo,
      resolvePlan: vi
        .fn()
        .mockResolvedValue({ code: 'SPECTATOR', maxRoomPlayers: 10, bypassesLimits: false }),
      consumeRoomQuota: vi.fn(),
      refundRoomQuota: vi.fn(),
      createHostCredential: vi.fn(),
      createPlayerCredential: vi.fn(),
    });

    await expect(
      service.createRoom({
        user: { id: 'user-1', role: 'USER', tokenVersion: 0 },
        quizId: 'quiz-1',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MobileRoomsError>>({
        code: 'ROOM_LIMIT_EXCEEDED',
        status: 403,
      }),
    );
  });

  it('joins atomically and returns the participant identity in the live ticket', async () => {
    const repo = repository({
      readRoom: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        roomCode: 'ABC234',
        status: 'WAITING',
        title: 'مسابقة',
        maxPlayers: 10,
        participants: [],
      }),
      joinRoomAtomically: vi
        .fn()
        .mockResolvedValue({ status: 'joined', participantId: 'participant-1' }),
    });
    const service = createMobileRoomsService({
      repository: repo,
      resolvePlan: vi.fn(),
      consumeRoomQuota: vi.fn(),
      refundRoomQuota: vi.fn(),
      createHostCredential: vi.fn(),
      createPlayerCredential: vi.fn().mockReturnValue({
        accessToken: 'signed-player-token',
        expiresAt: 1_800_000_000_000,
      }),
    });

    const result = await service.joinRoom({ roomCode: 'abc234', displayName: '  لاعب   أول ' });
    expect(repo.joinRoomAtomically).toHaveBeenCalledWith('session-1', null, 'لاعب أول');
    expect(result.ticket).toEqual({
      sessionId: 'session-1',
      subjectId: 'participant-1',
      role: 'player',
      accessToken: 'signed-player-token',
      expiresAt: 1_800_000_000_000,
    });
  });
});
