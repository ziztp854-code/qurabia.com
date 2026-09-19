import { NextResponse } from 'next/server';
import type { LiveRole } from '@tahaddi/contracts';
import {
  finishHttpLiveGame,
  getHttpLiveState,
  nextHttpLiveQuestion,
  startHttpLiveQuestion,
  submitHttpLiveAnswer,
  type HttpLiveIdentity,
} from '@/lib/live/http-engine';
import { verifyHostLiveAccessToken, verifyPlayerLiveAccessToken } from '@/lib/live/access-token';

type RoomOperation = 'snapshot' | 'start' | 'next' | 'finish' | 'answer';

function isRole(value: unknown): value is LiveRole {
  return value === 'host' || value === 'player';
}

function isOperation(value: unknown): value is RoomOperation {
  return ['snapshot', 'start', 'next', 'finish', 'answer'].includes(String(value));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestReceivedAt = new Date();
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as {
    operation?: unknown;
    subjectId?: unknown;
    accessToken?: unknown;
    role?: unknown;
    questionId?: unknown;
    optionId?: unknown;
  } | null;

  if (
    !body ||
    !isOperation(body.operation) ||
    !isRole(body.role) ||
    typeof body.subjectId !== 'string' ||
    typeof body.accessToken !== 'string'
  ) {
    return NextResponse.json({ ok: false, error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const tokenValid =
    body.role === 'host'
      ? verifyHostLiveAccessToken(sessionId, body.subjectId, body.accessToken)
      : verifyPlayerLiveAccessToken(sessionId, body.subjectId, body.accessToken);
  if (!tokenValid) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const identity: HttpLiveIdentity = {
    sessionId,
    subjectId: body.subjectId,
    role: body.role,
  };

  if (body.operation === 'answer') {
    if (typeof body.questionId !== 'string' || typeof body.optionId !== 'string') {
      return NextResponse.json({ ok: false, error: 'INVALID_ANSWER' }, { status: 400 });
    }
    const result = await submitHttpLiveAnswer(identity, {
      questionId: body.questionId,
      optionId: body.optionId,
      receivedAt: requestReceivedAt,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 409 });
    }
  } else if (body.operation === 'start') {
    if (!(await startHttpLiveQuestion(identity))) {
      return NextResponse.json({ ok: false, error: 'COMMAND_REJECTED' }, { status: 409 });
    }
  } else if (body.operation === 'next') {
    if (!(await nextHttpLiveQuestion(identity))) {
      return NextResponse.json({ ok: false, error: 'COMMAND_REJECTED' }, { status: 409 });
    }
  } else if (body.operation === 'finish') {
    if (!(await finishHttpLiveGame(identity))) {
      return NextResponse.json({ ok: false, error: 'COMMAND_REJECTED' }, { status: 409 });
    }
  }

  const state = await getHttpLiveState(identity);
  if (!state) {
    return NextResponse.json({ ok: false, error: 'SESSION_NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...state });
}
