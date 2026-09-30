import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  estimateClockOffset,
  parseRoomResponse,
  pollIntervalFor,
  roomEndpoint,
  roomRequestBody,
  type PlayerIdentity,
  type RoomOperation,
  type RoomState,
} from './live-room';

const REQUEST_TIMEOUT_MS = 8_000;
const OFFLINE_RETRY_MS = 3_000;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

async function postRoom(
  identity: PlayerIdentity,
  operation: RoomOperation,
  answer?: { questionId: string; optionId: string },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const sentAt = Date.now();
  try {
    const response = await fetch(roomEndpoint(identity.sessionId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(roomRequestBody(identity, operation, answer)),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return { result: parseRoomResponse(response.status, body), sentAt, receivedAt: Date.now() };
  } catch {
    return { result: null, sentAt, receivedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
  }
}

export function useLiveRoom(identity: PlayerIdentity) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const phaseRef = useRef<RoomState['snapshot']['phase'] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
  const inFlightRef = useRef(false);
  const pollRef = useRef<() => Promise<void>>(async () => undefined);

  const applyState = useCallback((state: RoomState, sentAt: number, receivedAt: number) => {
    phaseRef.current = state.snapshot.phase;
    setClockOffset(estimateClockOffset(state.snapshot.serverTime, sentAt, receivedAt));
    setRoom(state);
    setConnection('online');
  }, []);

  const schedule = useCallback((delay: number | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (delay === null || !activeRef.current) return;
    timerRef.current = setTimeout(() => void pollRef.current(), delay);
  }, []);

  const poll = useCallback(async () => {
    if (!activeRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    const { result, sentAt, receivedAt } = await postRoom(identity, 'snapshot');
    inFlightRef.current = false;
    if (!activeRef.current) return;

    if (result?.ok) {
      applyState(result.state, sentAt, receivedAt);
      schedule(pollIntervalFor(result.state.snapshot.phase));
      return;
    }
    if (result?.fatal) {
      setFatalError(result.message);
      schedule(null);
      return;
    }
    setConnection('offline');
    schedule(OFFLINE_RETRY_MS);
  }, [applyState, identity, schedule]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const questionId = room?.snapshot.question?.questionId ?? null;
  useEffect(() => {
    setAnswerError(null);
  }, [questionId]);

  useEffect(() => {
    activeRef.current = true;
    void poll();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        activeRef.current = true;
        void poll();
      } else {
        activeRef.current = false;
        schedule(null);
      }
    });
    return () => {
      activeRef.current = false;
      schedule(null);
      subscription.remove();
    };
  }, [poll, schedule]);

  const submitAnswer = useCallback(
    async (optionId: string) => {
      const question = room?.snapshot.question;
      if (!question || room.snapshot.playerAnswer || pendingOptionId) return;
      setAnswerError(null);
      setPendingOptionId(optionId);
      const { result, sentAt, receivedAt } = await postRoom(identity, 'answer', {
        questionId: question.questionId,
        optionId,
      });
      setPendingOptionId(null);
      if (result?.ok) {
        applyState(result.state, sentAt, receivedAt);
        return;
      }
      setAnswerError(result?.message ?? 'تعذّر إرسال الإجابة. تحقق من الإنترنت.');
      void poll();
    },
    [applyState, identity, pendingOptionId, poll, room],
  );

  return {
    room,
    connection,
    fatalError,
    answerError,
    pendingOptionId,
    clockOffset,
    submitAnswer,
    retry: poll,
  };
}
