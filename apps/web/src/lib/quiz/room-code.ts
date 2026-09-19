import { randomInt } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_DEFAULT_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  normalizeRoomCode,
  isRoomCode,
} from '@tahaddi/domain';

const DEFAULT_MAX_ATTEMPTS = 10;

export { ROOM_CODE_ALPHABET, normalizeRoomCode, isRoomCode };

interface QuizLookupClient {
  quiz: {
    findUnique(args: {
      where: { roomCode: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

interface ActivityLookupClient extends QuizLookupClient {
  mafiaGame: {
    findUnique(args: {
      where: { roomCode: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

interface GenerateUniqueRoomCodeOptions {
  length?: number;
  maxAttempts?: number;
}

export function generateRoomCode(length = ROOM_CODE_DEFAULT_LENGTH) {
  if (!Number.isInteger(length) || length < ROOM_CODE_MIN_LENGTH || length > ROOM_CODE_MAX_LENGTH) {
    throw new RangeError('Room code length must be an integer between 6 and 8.');
  }

  return Array.from(
    { length },
    () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
  ).join('');
}

export async function generateUniqueRoomCode(
  prisma: QuizLookupClient,
  {
    length = ROOM_CODE_DEFAULT_LENGTH,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  }: GenerateUniqueRoomCodeOptions = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('Maximum attempts must be a positive integer.');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const roomCode = generateRoomCode(length);
    const existingQuiz = await prisma.quiz.findUnique({
      where: { roomCode },
      select: { id: true },
    });

    if (!existingQuiz) {
      return roomCode;
    }
  }

  throw new Error(`Unable to allocate a unique room code after ${maxAttempts} attempts.`);
}

export async function generateUniqueActivityRoomCode(
  prisma: ActivityLookupClient,
  {
    length = ROOM_CODE_DEFAULT_LENGTH,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  }: GenerateUniqueRoomCodeOptions = {},
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('Maximum attempts must be a positive integer.');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const roomCode = generateRoomCode(length);
    const [existingQuiz, existingMafiaGame] = await Promise.all([
      prisma.quiz.findUnique({ where: { roomCode }, select: { id: true } }),
      prisma.mafiaGame.findUnique({ where: { roomCode }, select: { id: true } }),
    ]);

    if (!existingQuiz && !existingMafiaGame) {
      return roomCode;
    }
  }

  throw new Error(`Unable to allocate a unique room code after ${maxAttempts} attempts.`);
}
