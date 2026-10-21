const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication,
} = require('expo/config-plugins');

const SOURCES = {
  "TahaddiVoiceModule.java": "package PACKAGE_NAME.voice;\n\nimport android.Manifest;\nimport android.content.Context;\nimport android.content.Intent;\nimport android.content.pm.PackageManager;\nimport android.media.AudioDeviceCallback;\nimport android.media.AudioDeviceInfo;\nimport android.media.AudioManager;\nimport android.media.AudioRecordingConfiguration;\nimport android.os.Build;\nimport android.os.Handler;\nimport android.os.Looper;\nimport androidx.core.content.ContextCompat;\nimport com.facebook.react.bridge.*;\nimport com.facebook.react.common.LifecycleState;\nimport com.facebook.react.modules.core.DeviceEventManagerModule;\nimport java.lang.ref.WeakReference;\nimport java.util.List;\nimport java.util.UUID;\nimport java.util.concurrent.ConcurrentHashMap;\n\npublic final class TahaddiVoiceModule extends ReactContextBaseJavaModule {\n  private static WeakReference<ReactApplicationContext> context = new WeakReference<>(null);\n  private static final ConcurrentHashMap<String, Promise> pending = new ConcurrentHashMap<>();\n  private static final java.util.concurrent.CopyOnWriteArrayList<Promise> stops = new java.util.concurrent.CopyOnWriteArrayList<>();\n  private final AudioManager audio;\n  private final AudioDeviceCallback devices = new AudioDeviceCallback() {\n    @Override public void onAudioDevicesAdded(AudioDeviceInfo[] values) { emit(\"TahaddiVoiceDevicesChanged\"); }\n    @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] values) { emit(\"TahaddiVoiceDevicesChanged\"); }\n  };\n  private final AudioManager.AudioRecordingCallback recordings = new AudioManager.AudioRecordingCallback() {\n    @Override public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {\n      if (Build.VERSION.SDK_INT >= 29) for (AudioRecordingConfiguration value : configs) {\n        if (value.isClientSilenced()) { emit(\"TahaddiVoiceMicrophoneInterrupted\"); break; }\n      }\n    }\n  };\n\n  TahaddiVoiceModule(ReactApplicationContext reactContext) {\n    super(reactContext);\n    context = new WeakReference<>(reactContext);\n    audio = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);\n    audio.registerAudioDeviceCallback(devices, new Handler(Looper.getMainLooper()));\n    if (Build.VERSION.SDK_INT >= 29)\n      audio.registerAudioRecordingCallback(recordings, new Handler(Looper.getMainLooper()));\n  }\n\n  @Override public String getName() { return \"TahaddiVoiceService\"; }\n\n  @ReactMethod public void start(boolean microphone, Promise promise) {\n    ReactApplicationContext reactContext = getReactApplicationContext();\n    boolean upgrade = microphone && !TahaddiVoiceService.microphone;\n    if ((!TahaddiVoiceService.running || upgrade) &&\n        reactContext.getLifecycleState() != LifecycleState.RESUMED) {\n      promise.reject(\"VOICE_FOREGROUND_REQUIRED\", \"افتح التطبيق لبدء الصوت أو تفعيل الميكروفون.\");\n      return;\n    }\n    if (microphone && ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)\n        != PackageManager.PERMISSION_GRANTED) {\n      promise.reject(\"VOICE_MIC_PERMISSION\", \"إذن الميكروفون مطلوب.\");\n      return;\n    }\n    String requestId = UUID.randomUUID().toString();\n    pending.put(requestId, promise);\n    Intent intent = new Intent(reactContext, TahaddiVoiceService.class)\n        .putExtra(\"microphone\", microphone).putExtra(\"requestId\", requestId);\n    try {\n      if (TahaddiVoiceService.running) reactContext.startService(intent);\n      else {\n        ContextCompat.startForegroundService(reactContext, intent);\n      }\n    } catch (Exception error) {\n      complete(requestId, error);\n    }\n  }\n\n  @ReactMethod public void stop(Promise promise) {\n    if (!TahaddiVoiceService.running) { promise.resolve(null); return; }\n    stops.add(promise);\n    boolean requested = getReactApplicationContext().stopService(\n        new Intent(getReactApplicationContext(), TahaddiVoiceService.class));\n    if (!requested) completeStops();\n  }\n  @ReactMethod public void addListener(String eventName) {}\n  @ReactMethod public void removeListeners(double count) {}\n\n  static void complete(String requestId, Exception error) {\n    if (requestId == null) return;\n    Promise promise = pending.remove(requestId);\n    if (promise == null) return;\n    if (error == null) promise.resolve(null);\n    else promise.reject(\"VOICE_SERVICE_START\", \"تعذر تشغيل خدمة الصوت في Android.\", error);\n  }\n\n  static void completeStops() {\n    for (Promise promise : stops) { stops.remove(promise); promise.resolve(null); }\n  }\n\n  static void emit(String name) {\n    ReactApplicationContext current = context.get();\n    if (current != null && current.hasActiveReactInstance())\n      current.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(name, null);\n  }\n\n  @Override public void invalidate() {\n    audio.unregisterAudioDeviceCallback(devices);\n    if (Build.VERSION.SDK_INT >= 29) audio.unregisterAudioRecordingCallback(recordings);\n    getReactApplicationContext().stopService(new Intent(getReactApplicationContext(), TahaddiVoiceService.class));\n    super.invalidate();\n  }\n}\n",
  "TahaddiVoiceService.java": "package PACKAGE_NAME.voice;\n\nimport android.Manifest;\nimport android.app.*;\nimport android.content.Intent;\nimport android.content.pm.PackageManager;\nimport android.content.pm.ServiceInfo;\nimport android.os.Build;\nimport androidx.core.app.NotificationCompat;\nimport androidx.core.content.ContextCompat;\nimport com.facebook.react.HeadlessJsTaskService;\nimport com.facebook.react.bridge.Arguments;\nimport com.facebook.react.jstasks.HeadlessJsTaskConfig;\n\npublic final class TahaddiVoiceService extends HeadlessJsTaskService {\n  static volatile boolean running = false;\n  static volatile boolean microphone = false;\n  private boolean taskStarted = false;\n  private static final String CHANNEL = \"tahaddi_voice_room\";\n  private static final int NOTIFICATION = 7041;\n\n  @Override public void onCreate() {\n    super.onCreate();\n    if (Build.VERSION.SDK_INT >= 26) {\n      NotificationChannel channel = new NotificationChannel(\n          CHANNEL, \"الغرفة الصوتية\", NotificationManager.IMPORTANCE_LOW);\n      channel.setDescription(\"جلسة الصوت النشطة في تحدي لايف\");\n      channel.setSound(null, null);\n      getSystemService(NotificationManager.class).createNotificationChannel(channel);\n    }\n  }\n\n  @Override public int onStartCommand(Intent intent, int flags, int startId) {\n    String requestId = intent == null ? null : intent.getStringExtra(\"requestId\");\n    if (intent == null) { stopSelf(); return START_NOT_STICKY; }\n    boolean wantsMicrophone = intent.getBooleanExtra(\"microphone\", false);\n    try {\n      if (wantsMicrophone && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)\n          != PackageManager.PERMISSION_GRANTED)\n        throw new SecurityException(\"Microphone permission is missing\");\n      Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());\n      NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)\n          .setSmallIcon(android.R.drawable.ic_btn_speak_now)\n          .setContentTitle(\"تحدي لايف — جلسة صوت نشطة\")\n          .setContentText(wantsMicrophone ? \"الميكروفون نشط · افتح التطبيق للتحكم\" : \"استماع للغرفة · افتح التطبيق للتحكم\")\n          .setOngoing(true).setOnlyAlertOnce(true)\n          .setCategory(NotificationCompat.CATEGORY_SERVICE)\n          .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);\n      if (launch != null) builder.setContentIntent(PendingIntent.getActivity(\n          this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));\n      Notification notification = builder.build();\n      if (Build.VERSION.SDK_INT >= 29) {\n        int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;\n        if (wantsMicrophone && Build.VERSION.SDK_INT >= 30) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;\n        startForeground(NOTIFICATION, notification, types);\n      } else startForeground(NOTIFICATION, notification);\n      running = true;\n      microphone = wantsMicrophone;\n      if (!taskStarted) {\n        taskStarted = true;\n        super.onStartCommand(intent, flags, startId);\n      }\n      TahaddiVoiceModule.complete(requestId, null);\n    } catch (Exception error) {\n      TahaddiVoiceModule.complete(requestId, error);\n      stopSelf();\n    }\n    // Never revive an expired membership or restart capture after OS termination.\n    return START_NOT_STICKY;\n  }\n\n  @Override protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {\n    return new HeadlessJsTaskConfig(\"TahaddiVoiceKeepAlive\", Arguments.createMap(), 0, true);\n  }\n\n  @Override public void onTaskRemoved(Intent rootIntent) {\n    stopSelf();\n    super.onTaskRemoved(rootIntent);\n  }\n\n  @Override public void onDestroy() {\n    running = false;\n    microphone = false;\n    TahaddiVoiceModule.emit(\"TahaddiVoiceServiceStopped\");\n    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);\n    else stopForeground(true);\n    super.onDestroy();\n    TahaddiVoiceModule.completeStops();\n  }\n}\n",
  "TahaddiVoicePackage.java": "package PACKAGE_NAME.voice;\n\nimport com.facebook.react.ReactPackage;\nimport com.facebook.react.bridge.NativeModule;\nimport com.facebook.react.bridge.ReactApplicationContext;\nimport com.facebook.react.uimanager.ViewManager;\nimport java.util.Collections;\nimport java.util.List;\n\npublic final class TahaddiVoicePackage implements ReactPackage {\n  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {\n    return Collections.singletonList(new TahaddiVoiceModule(context));\n  }\n  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {\n    return Collections.emptyList();\n  }\n}\n"
};

module.exports = function withVoiceAndroid(config) {
  const appPackage = config.android?.package;
  if (!appPackage || !/^[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)+$/.test(appPackage))
    throw new Error('withVoiceAndroid requires a valid android.package.');
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const permissions = [
      'INTERNET', 'ACCESS_NETWORK_STATE', 'MODIFY_AUDIO_SETTINGS', 'RECORD_AUDIO',
      'WAKE_LOCK', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MICROPHONE',
      'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'POST_NOTIFICATIONS', 'BLUETOOTH_CONNECT',
      'BLUETOOTH', 'BLUETOOTH_ADMIN',
    ];
    const managed = new Set([...permissions, 'CAMERA', 'SYSTEM_ALERT_WINDOW']
      .map((permission) => 'android.permission.' + permission));
    manifest['uses-permission'] = (manifest['uses-permission'] || [])
      .filter((entry) => !managed.has(entry.$?.['android:name']));
    for (const permission of permissions) {
      const attributes = { 'android:name': 'android.permission.' + permission };
      if (permission === 'BLUETOOTH' || permission === 'BLUETOOTH_ADMIN')
        attributes['android:maxSdkVersion'] = '30';
      manifest['uses-permission'].push({ $: attributes });
    }
    // LiveKit's generic video SDK contributes these; this product is audio-only.
    for (const permission of ['CAMERA', 'SYSTEM_ALERT_WINDOW'])
      manifest['uses-permission'].push({ $: {
        'android:name': 'android.permission.' + permission, 'tools:node': 'remove',
      } });
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const serviceName = appPackage + '.voice.TahaddiVoiceService';
    application.service = (application.service || [])
      .filter((entry) => entry.$?.['android:name'] !== serviceName);
    application.service.push({ $: {
      'android:name': serviceName, 'android:exported': 'false',
      'android:foregroundServiceType': 'mediaPlayback|microphone',
      'android:stopWithTask': 'true',
    } });
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt')
      throw new Error('withVoiceAndroid expects the Expo Kotlin MainApplication.');
    let source = mod.modResults.contents;
    const importLine = 'import ' + appPackage + '.voice.TahaddiVoicePackage';
    if (!source.includes(importLine)) source = source.replace(
      /^(package\s+[^\n]+)$/m, '$1\n\n' + importLine,
    );
    if (!source.includes('add(TahaddiVoicePackage())')) {
      const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!anchor.test(source))
        throw new Error('Expo MainApplication package-list format changed; inspect voice package registration.');
      source = source.replace(anchor, (match) => match + '\n          add(TahaddiVoicePackage())');
    }
    mod.modResults.contents = source;
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const directory = path.join(
      mod.modRequest.platformProjectRoot, 'app/src/main/java',
      ...appPackage.split('.'), 'voice',
    );
    await fs.mkdir(directory, { recursive: true });
    for (const [name, source] of Object.entries(SOURCES))
      await fs.writeFile(path.join(directory, name), source.replaceAll('PACKAGE_NAME', appPackage), 'utf8');
    return mod;
  }]);
};
