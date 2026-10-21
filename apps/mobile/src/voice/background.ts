import { AppRegistry, NativeEventEmitter, NativeModules, Platform } from 'react-native';

type VoiceServiceModule = {
  start(microphone: boolean): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeService = NativeModules.TahaddiVoiceService as VoiceServiceModule | undefined;
const emitter = nativeService ? new NativeEventEmitter(nativeService) : null;
let registered = false;
const finishTasks = new Set<() => void>();

/** A live HeadlessJS task permits RN timers to run while the room service is active. */
export function registerVoiceBackgroundTask() {
  if (registered || Platform.OS !== 'android') return;
  if (!nativeService) throw new Error('Android voice bridge is missing; install the complete native build.');
  registered = true;
  AppRegistry.registerHeadlessTask('TahaddiVoiceKeepAlive', () => async () => {
    await new Promise<void>((resolve) => {
      const finish = () => {
        finishTasks.delete(finish);
        subscription?.remove();
        resolve();
      };
      const subscription = emitter?.addListener('TahaddiVoiceServiceStopped', finish);
      finishTasks.add(finish);
      if (!nativeService) finish();
    });
  });
}

export const voiceBackground = {
  available: Platform.OS === 'android' && Boolean(nativeService),
  async start(microphone = false) {
    if (Platform.OS !== 'android') return;
    if (!nativeService) throw new Error('خدمة الصوت الأصلية غير موجودة. ثبّت بناء Android الكامل.');
    await nativeService.start(microphone);
  },
  async stop() {
    try {
      await nativeService?.stop();
    } finally {
      for (const finish of [...finishTasks]) finish();
    }
  },
  onStopped(listener: () => void) {
    const subscription = emitter?.addListener('TahaddiVoiceServiceStopped', listener);
    return () => subscription?.remove();
  },
  onDevicesChanged(listener: () => void) {
    const subscription = emitter?.addListener('TahaddiVoiceDevicesChanged', listener);
    return () => subscription?.remove();
  },
  onMicrophoneInterrupted(listener: () => void) {
    const subscription = emitter?.addListener('TahaddiVoiceMicrophoneInterrupted', listener);
    return () => subscription?.remove();
  },
};
