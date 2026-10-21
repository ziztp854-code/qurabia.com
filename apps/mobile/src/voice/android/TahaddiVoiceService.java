package PACKAGE_NAME.voice;

import android.Manifest;
import android.app.*;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;

public final class TahaddiVoiceService extends HeadlessJsTaskService {
  static volatile boolean running = false;
  static volatile boolean microphone = false;
  private boolean taskStarted = false;
  private static final String CHANNEL = "tahaddi_voice_room";
  private static final int NOTIFICATION = 7041;

  @Override public void onCreate() {
    super.onCreate();
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL, "الغرفة الصوتية", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("جلسة الصوت النشطة في تحدي لايف");
      channel.setSound(null, null);
      getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    String requestId = intent == null ? null : intent.getStringExtra("requestId");
    if (intent == null) { stopSelf(); return START_NOT_STICKY; }
    boolean wantsMicrophone = intent.getBooleanExtra("microphone", false);
    try {
      if (wantsMicrophone && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
          != PackageManager.PERMISSION_GRANTED)
        throw new SecurityException("Microphone permission is missing");
      Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
      NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
          .setSmallIcon(android.R.drawable.ic_btn_speak_now)
          .setContentTitle("تحدي لايف — جلسة صوت نشطة")
          .setContentText(wantsMicrophone ? "الميكروفون نشط · افتح التطبيق للتحكم" : "استماع للغرفة · افتح التطبيق للتحكم")
          .setOngoing(true).setOnlyAlertOnce(true)
          .setCategory(NotificationCompat.CATEGORY_SERVICE)
          .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
      if (launch != null) builder.setContentIntent(PendingIntent.getActivity(
          this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
      Notification notification = builder.build();
      if (Build.VERSION.SDK_INT >= 29) {
        int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (wantsMicrophone && Build.VERSION.SDK_INT >= 30) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        startForeground(NOTIFICATION, notification, types);
      } else startForeground(NOTIFICATION, notification);
      running = true;
      microphone = wantsMicrophone;
      if (!taskStarted) {
        taskStarted = true;
        super.onStartCommand(intent, flags, startId);
      }
      TahaddiVoiceModule.complete(requestId, null);
    } catch (Exception error) {
      TahaddiVoiceModule.complete(requestId, error);
      stopSelf();
    }
    // Never revive an expired membership or restart capture after OS termination.
    return START_NOT_STICKY;
  }

  @Override protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    return new HeadlessJsTaskConfig("TahaddiVoiceKeepAlive", Arguments.createMap(), 0, true);
  }

  @Override public void onTaskRemoved(Intent rootIntent) {
    stopSelf();
    super.onTaskRemoved(rootIntent);
  }

  @Override public void onDestroy() {
    running = false;
    microphone = false;
    TahaddiVoiceModule.emit("TahaddiVoiceServiceStopped");
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
    else stopForeground(true);
    super.onDestroy();
    TahaddiVoiceModule.completeStops();
  }
}
