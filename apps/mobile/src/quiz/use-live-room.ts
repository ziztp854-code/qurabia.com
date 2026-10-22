import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { postRoom } from './requests';
import { estimateClockOffset, pollIntervalFor, type PlayerIdentity, type RoomState } from './live-room';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export function useLiveRoom(identity: PlayerIdentity) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const roomRef = useRef(room);
  roomRef.current = room;
  const active = useRef(true);
  const answerBusy = useRef(false);
  const version = useRef(0);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((delay: number | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (delay !== null && active.current) timer.current = setTimeout(() => void pollRef.current(), delay);
  }, []);
  const apply = useCallback((state: RoomState, sentAt: number, receivedAt: number) => {
    setClockOffset(estimateClockOffset(state.snapshot.serverTime, sentAt, receivedAt));
    roomRef.current = state;
    setRoom(state);
    setConnection('online');
  }, []);
  const poll = useCallback(async () => {
    if (!active.current || answerBusy.current || request.current) return;
    const id = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    const { result, sentAt, receivedAt } = await postRoom(identity, 'snapshot', undefined, controller.signal);
    if (id !== version.current) return;
    request.current = null;
    if (!active.current) return;
    if (result.ok) {
      apply(result.state, sentAt, receivedAt);
      schedule(pollIntervalFor(result.state.snapshot.phase));
    } else if (result.fatal) {
      setFatalError(result.message);
      schedule(null);
    } else {
      setConnection('offline');
      schedule(3_000);
    }
  }, [identity, apply, schedule]);
  useEffect(() => { pollRef.current = poll; }, [poll]);
  useEffect(() => {
    active.current = true;
    void poll();
    const listener = AppState.addEventListener('change', status => {
      active.current = status === 'active';
      if (active.current) void poll();
      else {
        ++version.current;
        request.current?.abort();
        request.current = null;
        answerBusy.current = false;
        setPendingOptionId(null);
        schedule(null);
      }
    });
    return () => {
      active.current = false;
      ++version.current;
      request.current?.abort();
      request.current = null;
      schedule(null);
      listener.remove();
    };
  }, [poll, schedule]);
  const questionId = room?.snapshot.question?.questionId;
  useEffect(() => { setAnswerError(null); }, [questionId]);

  const submitAnswer = useCallback(async (optionId: string) => {
    const snapshot = roomRef.current?.snapshot;
    const question = snapshot?.question;
    if (!active.current || answerBusy.current || !question || snapshot?.phase !== 'QUESTION' || snapshot.playerAnswer) return;
    answerBusy.current = true;
    schedule(null);
    request.current?.abort();
    const id = ++version.current;
    const controller = new AbortController();
    request.current = controller;
    setAnswerError(null);
    setPendingOptionId(optionId);
    const { result, sentAt, receivedAt } = await postRoom(identity, 'answer', {
      questionId: question.questionId, optionId,
    }, controller.signal);
    if (!active.current || id !== version.current) return;
    request.current = null;
    answerBusy.current = false;
    setPendingOptionId(null);
    if (result.ok) apply(result.state, sentAt, receivedAt);
    else if (result.fatal) setFatalError(result.message);
    else setAnswerError(result.message);
    schedule(result.ok ? pollIntervalFor(result.state.snapshot.phase) : result.fatal ? null : 0);
  }, [identity, apply, schedule]);
  return { room, connection, fatalError, answerError, pendingOptionId, clockOffset, submitAnswer, retry: poll };
}
