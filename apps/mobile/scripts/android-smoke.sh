#!/usr/bin/env bash
set -euo pipefail
apk=apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
package=com.qurabia.tahaddi
mkdir -p android-reports
adb logcat -c
# No Metro process or port forwarding is used by this smoke test.
adb reverse --remove-all
adb install -r "$apk"
adb shell am start -W -n "$package/.MainActivity" > android-reports/android-launch.txt
trap 'adb logcat -d > android-reports/logcat.txt; adb exec-out screencap -p > android-reports/android-launch.png' EXIT
ready=0
for attempt in $(seq 1 30); do
  if ! adb shell pidof "$package" > /dev/null; then
    echo "Application exited during startup" >&2
    exit 1
  fi
  adb shell uiautomator dump /sdcard/tahaddi-window.xml > /dev/null 2>&1 || true
  adb pull /sdcard/tahaddi-window.xml android-reports/android-window.xml > /dev/null 2>&1 || true
  if test -s android-reports/android-window.xml && python3 - <<'PY'
import pathlib, xml.etree.ElementTree as ET
root = ET.fromstring(pathlib.Path("android-reports/android-window.xml").read_text())
labels = " ".join(" ".join(n.attrib.get(k, "") for k in ("text", "content-desc")) for n in root.iter())
assert "رمز الغرفة" in labels and "انضم الآن" in labels
PY
  then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = 1
adb shell dumpsys meminfo "$package" > android-reports/meminfo-startup.txt
adb shell getprop ro.build.version.sdk > android-reports/emulator-api.txt
adb logcat -d -s AndroidRuntime:E ReactNativeJS:E '*:S' > android-reports/runtime-errors.txt
if grep -Eq 'FATAL EXCEPTION|Unable to load script|Could not connect to development server|ReactNativeJS.*(Error|Exception)' android-reports/runtime-errors.txt; then
  cat android-reports/runtime-errors.txt
  exit 1
fi
echo 'Installed and rendered the native quiz-code launcher on Android 36 without Metro.' > android-reports/smoke-result.txt
