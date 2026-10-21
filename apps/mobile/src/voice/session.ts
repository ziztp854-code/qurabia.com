import { useSyncExternalStore } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import {
  ConnectionState, DisconnectReason, Room, RoomEvent, Track,
} from 'livekit-client';
import { voiceBackground } from './background';
import { mayPublishVoice, readVoiceGrant, retryDelay, terminalVoiceError, type VoiceMember } from './policy';

export type VoiceApiRequest = <T>(path: string, options?: {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}) => Promise<T>;
export type VoiceAudioSnapshot = {
  roomId: string | null;
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error: string;
  muted: boolean;
  canPublish: boolean;
  speakers: string[];
  audioOutputs: string[];
  selectedOutput: string;
  backgroundSupported: boolean;
};
type DataListener = (payload: Uint8Array, topic: string, senderIdentity?: string) => void;

/** One instance belongs above navigation. Membership and chat remain server-authoritative. */
export class NativeVoiceSession {
  private room: Room | null = null;
  private member: VoiceMember | null = null;
  private desiredMuted = true;
  private generation = 0;
  private micRevision = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private tokenAbort: AbortController | null = null;
  private connecting: Promise<void> | null = null;
  private micQueue: Promise<void> = Promise.resolve();
  private cleanupQueue: Promise<void> = Promise.resolve();
  private nativeQueue: Promise<void> = Promise.resolve();
  private closing = false;
  private notificationAsked = false;
  private listeners = new Set<() => void>();
  private dataListeners = new Set<DataListener>();
  private reconnectListeners = new Set<() => void>();
  private subscriptions: Array<() => void> = [];
  private snapshot: VoiceAudioSnapshot = {
    roomId: null, state: 'disconnected', error: '', muted: true, canPublish: false,
    speakers: [], audioOutputs: [], selectedOutput: '', backgroundSupported: voiceBackground.available,
  };

  constructor(private readonly request: VoiceApiRequest) {
    this.attachSubscriptions();
  }

  private attachSubscriptions() {
    if (this.subscriptions.length) return;
    this.subscriptions.push(voiceBackground.onStopped(() => {
      if (!this.closing && this.snapshot.roomId) {
        void this.fail('توقفت خدمة الصوت في الخلفية. افتح الغرفة وأعد الاتصال.');
      }
    }));
    this.subscriptions.push(voiceBackground.onDevicesChanged(() => {
      void this.refreshAudioOutputs().catch(() => {});
    }));
    this.subscriptions.push(voiceBackground.onMicrophoneInterrupted(() => {
      this.desiredMuted = true;
      this.cutMicrophone();
      this.patch({ error: 'أوقف Android الميكروفون مؤقتًا. أعد تفعيله بعد انتهاء المقاطعة.' });
      void this.synchronizeMicrophone();
    }));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && this.room) {
        void this.refreshAudioOutputs().catch(() => {});
        if (this.room.state === ConnectionState.Disconnected) this.scheduleRetry(this.generation);
      }
    });
    this.subscriptions.push(() => appState.remove());
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  subscribeData = (listener: DataListener) => {
    this.dataListeners.add(listener);
    return () => { this.dataListeners.delete(listener); };
  };
  subscribeReconnected = (listener: () => void) => {
    this.reconnectListeners.add(listener);
    return () => { this.reconnectListeners.delete(listener); };
  };

  private patch(value: Partial<VoiceAudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    for (const listener of this.listeners) listener();
  }

  updateParticipant(member: VoiceMember | null) {
    this.member = member;
    const canPublish = mayPublishVoice(member);
    this.patch({ canPublish });
    if (!member) {
      // Cut capture before waiting on a socket, server, or asynchronous SDK teardown.
      void this.leave();
      return;
    }
    if (!canPublish || member.muted) {
      this.desiredMuted = true;
      this.cutMicrophone();
    }
    void this.synchronizeMicrophone();
  }

  connect(roomId: string, member?: VoiceMember | null): Promise<void> {
    if (this.snapshot.roomId === roomId && (this.connecting || this.room)) {
      if (member !== undefined) this.updateParticipant(member);
      return this.connecting ?? Promise.resolve();
    }
    if (this.snapshot.roomId && this.snapshot.roomId !== roomId)
      return Promise.reject(new Error('غادر الغرفة الصوتية الحالية قبل فتح غرفة أخرى.'));
    if (Platform.OS === 'android' && AppState.currentState !== 'active')
      return Promise.reject(new Error('افتح التطبيق لبدء جلسة الصوت.'));
    if (member !== undefined) this.member = member;
    if (!this.member) return Promise.reject(new Error('انضم إلى الغرفة قبل تشغيل الصوت.'));
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.closing = false;
    this.desiredMuted = true;
    this.attempt = 0;
    const generation = ++this.generation;
    this.patch({ roomId, state: 'connecting', error: '', muted: true, canPublish: mayPublishVoice(this.member) });
    this.connecting = this.establish(generation).finally(() => {
      if (generation === this.generation) this.connecting = null;
    });
    return this.connecting;
  }

  private async token(roomId: string, signal: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await this.request<unknown>(
          '/api/voice/rooms/' + encodeURIComponent(roomId) + '/token',
          { method: 'POST', body: {}, signal, timeoutMs: 45_000 },
        );
        return readVoiceGrant(value);
      } catch (error) {
        if (signal.aborted) throw error;
        const mediaRetry = error && typeof error === 'object' && 'code' in error &&
          error.code === 'MEDIA_RETRY';
        if (!mediaRetry || attempt >= 4) throw error;
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new Error('أُلغي اتصال الصوت.')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    }
  }

  private audioOperation(operation: () => Promise<void>) {
    const pending = this.nativeQueue.catch(() => {}).then(operation);
    this.nativeQueue = pending.catch(() => {});
    return pending;
  }

  private async establish(generation: number) {
    const roomId = this.snapshot.roomId;
    if (!roomId || generation !== this.generation) return;
    const oldRoom = this.room;
    this.room = null;
    oldRoom?.removeAllListeners();
    await oldRoom?.disconnect(true).catch(() => {});
    await this.cleanupQueue;
    if (generation !== this.generation) return;
    this.attachSubscriptions();
    this.tokenAbort?.abort();
    const abort = new AbortController();
    this.tokenAbort = abort;
    let room: Room | null = null;
    try {
      // Must start while visible; retries reuse the already-running service.
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33 &&
          AppState.currentState === 'active' && !this.notificationAsked) {
        this.notificationAsked = true;
        // Denial does not prevent an FGS; Android still shows it in active apps.
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await this.audioOperation(async () => {
        if (generation !== this.generation) return;
        await voiceBackground.start(!this.desiredMuted && mayPublishVoice(this.member));
        if (generation !== this.generation) return;
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: 'speaker' },
        });
        if (generation !== this.generation) return;
        await AudioSession.startAudioSession();
      });
      if (generation !== this.generation) return;
      const grant = await this.token(roomId, abort.signal);
      if (generation !== this.generation) return;
      room = new Room({
        adaptiveStream: true, dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { dtx: true, red: true, stopMicTrackOnMute: true },
      });
      const activeRoom = room;
      this.room = room;
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (this.room === activeRoom) this.patch({ speakers: speakers.map((speaker) => speaker.identity) });
      });
      room.on(RoomEvent.DataReceived, (payload, sender, _kind, topic) => {
        if (this.room !== activeRoom) return;
        for (const listener of this.dataListeners) listener(payload, topic ?? '', sender?.identity);
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (this.room === activeRoom) this.patch({ state: 'reconnecting', speakers: [] });
      });
      room.on(RoomEvent.Reconnected, () => {
        if (this.room !== activeRoom) return;
        this.patch({ state: 'connected', error: '' });
        void this.synchronizeMicrophone();
        for (const listener of this.reconnectListeners) listener();
      });
      room.on(RoomEvent.ParticipantPermissionsChanged, () => {
        if (this.room === activeRoom) void this.synchronizeMicrophone();
      });
      room.on(RoomEvent.MediaDevicesError, () => {
        this.desiredMuted = true;
        this.cutMicrophone();
        this.patch({ error: 'تعذر الوصول للميكروفون. تحقق من إذنه ثم أعد تفعيله.' });
      });
      room.on(RoomEvent.Disconnected, (reason) => {
        if (this.room !== activeRoom || generation !== this.generation || this.closing) return;
        this.cutMicrophone();
        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          void this.fail('جلسة الصوت مفتوحة بحسابك على جهاز آخر.');
        } else this.scheduleRetry(generation);
      });
      await room.connect(grant.url, grant.token, { autoSubscribe: true });
      if (generation !== this.generation) {
        room.removeAllListeners();
        await room.disconnect(true);
        return;
      }
      this.attempt = 0;
      this.patch({ state: 'connected', error: '' });
      await this.refreshAudioOutputs();
      if (this.snapshot.audioOutputs.includes(this.snapshot.selectedOutput))
        await AudioSession.selectAudioOutput(this.snapshot.selectedOutput);
      await this.synchronizeMicrophone();
      for (const listener of this.reconnectListeners) listener();
    } catch (error) {
      room?.removeAllListeners();
      await room?.disconnect(true);
      if (this.room === room) this.room = null;
      if (generation !== this.generation || abort.signal.aborted) return;
      if (terminalVoiceError(error) || !voiceBackground.available && Platform.OS === 'android')
        await this.fail(error instanceof Error ? error.message : 'تعذر تشغيل خدمة الصوت.');
      else {
        this.patch({ error: error instanceof Error ? error.message : 'تعذر الاتصال بالصوت.' });
        this.scheduleRetry(generation);
      }
    }
  }

  private scheduleRetry(generation: number) {
    if (generation !== this.generation || this.closing || this.retryTimer || !this.member) return;
    const delay = retryDelay(this.attempt++);
    if (delay === null) {
      void this.fail('تعذر استعادة الصوت. افتح الغرفة واضغط إعادة الاتصال.');
      return;
    }
    this.patch({ state: 'reconnecting', speakers: [] });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (generation === this.generation) void this.establish(generation);
    }, delay);
  }

  private cutMicrophone() {
    this.micRevision++;
    const track = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (track?.mediaStreamTrack) track.mediaStreamTrack.enabled = false;
    this.patch({ muted: true });
  }

  async setMuted(muted: boolean) {
    if (muted) {
      this.desiredMuted = true;
      this.cutMicrophone();
      await this.synchronizeMicrophone();
      return;
    }
    if (AppState.currentState !== 'active')
      throw new Error('افتح التطبيق لتفعيل الميكروفون.');
    if (!mayPublishVoice(this.member) || this.member?.muted)
      throw new Error('تحقق من مقعدك وصلاحية الميكروفون في الغرفة.');
    const generation = this.generation;
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result !== PermissionsAndroid.RESULTS.GRANTED)
        throw new Error('لم تسمح باستخدام الميكروفون. فعّل الإذن من إعدادات Android.');
    }
    if (generation !== this.generation || !mayPublishVoice(this.member)) return;
    this.desiredMuted = false;
    this.micRevision++;
    await this.synchronizeMicrophone();
  }

  private synchronizeMicrophone(): Promise<void> {
    const room = this.room;
    const generation = this.generation;
    const revision = this.micRevision;
    this.micQueue = this.micQueue.catch(() => {}).then(async () => {
      if (!room || room !== this.room || generation !== this.generation ||
          room.state !== ConnectionState.Connected) return;
      let enable = !this.desiredMuted && !this.member?.muted && mayPublishVoice(this.member) &&
        Boolean(room.localParticipant.permissions?.canPublish);
      if (enable && Platform.OS === 'android')
        enable = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (revision !== this.micRevision || generation !== this.generation) return;
      if (enable) await this.audioOperation(async () => {
        if (generation === this.generation && revision === this.micRevision) await voiceBackground.start(true);
      });
      if (revision !== this.micRevision || generation !== this.generation) return;
      await room.localParticipant.setMicrophoneEnabled(enable);
      if (revision !== this.micRevision || generation !== this.generation || this.desiredMuted) {
        await room.localParticipant.setMicrophoneEnabled(false);
        return;
      }
      this.patch({ muted: !enable });
      if (!enable) await this.audioOperation(async () => {
        if (generation === this.generation) await voiceBackground.start(false);
      });
    }).catch((error) => {
      if (generation !== this.generation) return;
      this.desiredMuted = true;
      this.cutMicrophone();
      this.patch({ error: error instanceof Error ? error.message : 'تعذر تشغيل الميكروفون.' });
    });
    return this.micQueue;
  }

  async refreshAudioOutputs() {
    if (!this.room) return;
    const generation = this.generation;
    const audioOutputs = await AudioSession.getAudioOutputs();
    if (generation === this.generation) this.patch({
      audioOutputs,
      selectedOutput: audioOutputs.includes(this.snapshot.selectedOutput) ? this.snapshot.selectedOutput : '',
    });
  }

  async setAudioOutput(deviceId: string) {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 31 && deviceId === 'bluetooth') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED)
        throw new Error('اسمح بالاتصال بسماعة Bluetooth من إعدادات Android.');
    }
    await this.refreshAudioOutputs();
    if (!this.snapshot.audioOutputs.includes(deviceId))
      throw new Error('جهاز الصوت غير متاح حاليًا.');
    await AudioSession.selectAudioOutput(deviceId);
    this.patch({ selectedOutput: deviceId, error: '' });
  }

  leave(): Promise<void> {
    if (this.closing && !this.snapshot.roomId && !this.room && !this.connecting)
      return this.cleanupQueue;
    this.closing = true;
    ++this.generation;
    this.desiredMuted = true;
    this.cutMicrophone();
    this.tokenAbort?.abort();
    this.tokenAbort = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const room = this.room;
    try { room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.stop(); }
    catch { /* The track may already have ended; disconnect still runs below. */ }
    this.room = null;
    this.connecting = null;
    room?.removeAllListeners();
    this.patch({ roomId: null, state: 'disconnected', speakers: [], canPublish: false, audioOutputs: [], selectedOutput: '' });
    this.cleanupQueue = this.cleanupQueue.catch(() => {}).then(async () => {
      let failed = false;
      try { await room?.disconnect(true); } catch { failed = true; }
      await this.audioOperation(async () => {
        try { await AudioSession.stopAudioSession(); } catch { failed = true; }
        try { await voiceBackground.stop(); } catch { failed = true; }
      }).catch(() => { failed = true; });
      if (failed && this.closing)
        this.patch({ error: 'توقّف الالتقاط محليًا؛ تعذّر تأكيد اكتمال تنظيف إحدى خدمات الصوت.' });
    });
    return this.cleanupQueue;
  }

  private async fail(error: string) {
    await this.leave().catch(() => {});
    this.patch({ state: 'error', error });
  }

  async dispose() {
    // Detach synchronously so a development effect remount can attach safely.
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.dataListeners.clear();
    this.reconnectListeners.clear();
    this.listeners.clear();
    await this.leave();
  }
}

export function useNativeVoiceSession(controller: NativeVoiceSession) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
