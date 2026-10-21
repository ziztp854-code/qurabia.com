package PACKAGE_NAME.voice;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.AudioRecordingConfiguration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.facebook.react.bridge.*;
import com.facebook.react.common.LifecycleState;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.lang.ref.WeakReference;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class TahaddiVoiceModule extends ReactContextBaseJavaModule {
  private static WeakReference<ReactApplicationContext> context = new WeakReference<>(null);
  private static final ConcurrentHashMap<String, Promise> pending = new ConcurrentHashMap<>();
  private static final java.util.concurrent.CopyOnWriteArrayList<Promise> stops = new java.util.concurrent.CopyOnWriteArrayList<>();
  private final AudioManager audio;
  private final AudioDeviceCallback devices = new AudioDeviceCallback() {
    @Override public void onAudioDevicesAdded(AudioDeviceInfo[] values) { emit("TahaddiVoiceDevicesChanged"); }
    @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] values) { emit("TahaddiVoiceDevicesChanged"); }
  };
  private final AudioManager.AudioRecordingCallback recordings = new AudioManager.AudioRecordingCallback() {
    @Override public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
      if (Build.VERSION.SDK_INT >= 29) for (AudioRecordingConfiguration value : configs) {
        if (value.isClientSilenced()) { emit("TahaddiVoiceMicrophoneInterrupted"); break; }
      }
    }
  };

  TahaddiVoiceModule(ReactApplicationContext reactContext) {
    super(reactContext);
    context = new WeakReference<>(reactContext);
    audio = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
    audio.registerAudioDeviceCallback(devices, new Handler(Looper.getMainLooper()));
    if (Build.VERSION.SDK_INT >= 29)
      audio.registerAudioRecordingCallback(recordings, new Handler(Looper.getMainLooper()));
  }

  @Override public String getName() { return "TahaddiVoiceService"; }

  @ReactMethod public void start(boolean microphone, Promise promise) {
    ReactApplicationContext reactContext = getReactApplicationContext();
    boolean upgrade = microphone && !TahaddiVoiceService.microphone;
    if ((!TahaddiVoiceService.running || upgrade) &&
        reactContext.getLifecycleState() != LifecycleState.RESUMED) {
      promise.reject("VOICE_FOREGROUND_REQUIRED", "افتح التطبيق لبدء الصوت أو تفعيل الميكروفون.");
      return;
    }
    if (microphone && ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {
      promise.reject("VOICE_MIC_PERMISSION", "إذن الميكروفون مطلوب.");
      return;
    }
    String requestId = UUID.randomUUID().toString();
    pending.put(requestId, promise);
    Intent intent = new Intent(reactContext, TahaddiVoiceService.class)
        .putExtra("microphone", microphone).putExtra("requestId", requestId);
    try {
      if (TahaddiVoiceService.running) reactContext.startService(intent);
      else {
        ContextCompat.startForegroundService(reactContext, intent);
      }
    } catch (Exception error) {
      complete(requestId, error);
    }
  }

  @ReactMethod public void stop(Promise promise) {
    if (!TahaddiVoiceService.running) { promise.resolve(null); return; }
    stops.add(promise);
    boolean requested = getReactApplicationContext().stopService(
        new Intent(getReactApplicationContext(), TahaddiVoiceService.class));
    if (!requested) completeStops();
  }
  @ReactMethod public void addListener(String eventName) {}
  @ReactMethod public void removeListeners(double count) {}

  static void complete(String requestId, Exception error) {
    if (requestId == null) return;
    Promise promise = pending.remove(requestId);
    if (promise == null) return;
    if (error == null) promise.resolve(null);
    else promise.reject("VOICE_SERVICE_START", "تعذر تشغيل خدمة الصوت في Android.", error);
  }

  static void completeStops() {
    for (Promise promise : stops) { stops.remove(promise); promise.resolve(null); }
  }

  static void emit(String name) {
    ReactApplicationContext current = context.get();
    if (current != null && current.hasActiveReactInstance())
      current.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(name, null);
  }

  @Override public void invalidate() {
    audio.unregisterAudioDeviceCallback(devices);
    if (Build.VERSION.SDK_INT >= 29) audio.unregisterAudioRecordingCallback(recordings);
    getReactApplicationContext().stopService(new Intent(getReactApplicationContext(), TahaddiVoiceService.class));
    super.invalidate();
  }
}
