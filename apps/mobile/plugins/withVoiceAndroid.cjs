const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication,
} = require('expo/config-plugins');

const SOURCES = ['TahaddiVoiceModule.java', 'TahaddiVoiceService.java', 'TahaddiVoicePackage.java'];

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
    application.$ = application.$ || {};
    application.$['android:usesCleartextTraffic'] = 'false';
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
    for (const name of SOURCES) {
      const source = await fs.readFile(path.join(__dirname, '../src/voice/android', name), 'utf8');
      await fs.writeFile(path.join(directory, name), source.replaceAll('PACKAGE_NAME', appPackage), 'utf8');
    }
    // Debug manifests merge at higher priority than main. Embedded debug APKs
    // need neither Expo's overlay permission nor plaintext Metro connectivity.
    for (const variant of ['debug', 'debugOptimized']) {
      const manifestPath = path.join(mod.modRequest.platformProjectRoot, 'app/src', variant, 'AndroidManifest.xml');
      let original;
      try { original = await fs.readFile(manifestPath, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const cleaned = original
        .replace(/<uses-permission\b(?=[^>]*android:name=["']android\.permission\.(?:SYSTEM_ALERT_WINDOW|CAMERA)["'])[^>]*\/>\s*/g, '')
        .replace(/android:usesCleartextTraffic=(["'])true\1/g, 'android:usesCleartextTraffic="false"');
      if (cleaned !== original) await fs.writeFile(manifestPath, cleaned, 'utf8');
    }
    return mod;
  }]);
};
