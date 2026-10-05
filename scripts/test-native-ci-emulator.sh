#!/usr/bin/env bash
# Public catalog + synthetic fixtures only, on an ephemeral GitHub-hosted Linux runner.
# Never use a local phone, a signed-in AVD, release credentials, or Firebase configuration.
set -euo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || {
  echo 'Refusing: requires an ephemeral GitHub-hosted CI runner'; exit 1;
}
[[ "${RUNNER_OS:-}" == Linux ]] || { echo 'Requires Linux/KVM'; exit 1; }
: "${ANDROID_HOME:?}" "${RUNNER_TEMP:?}"
for private_config in android-native/firebase-preview.json android-native/firebase-production.json android-native/app/google-services.json; do
  [[ ! -f "$private_config" ]] || { echo 'Refusing private Firebase configuration in UI CI'; exit 1; }
done
adb="$ANDROID_HOME/platform-tools/adb"
emulator="$ANDROID_HOME/emulator/emulator"
serial=emulator-5580
[[ $("$adb" devices | awk 'NR>1 && NF {n++} END {print n+0}') == 0 ]] || {
  echo 'Refusing an existing device; this job owns one disposable emulator only'; exit 1;
}
[[ -c /dev/kvm ]] || { echo 'KVM device unavailable'; exit 1; }
if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  # Only the current job user, only this ephemeral VM's KVM device; no world-writable permissions.
  sudo chown "$(id -u):$(id -g)" /dev/kvm
fi
"$emulator" -accel-check
evidence="$RUNNER_TEMP/searchbefore-native-ui"
mkdir -p "$evidence"
export ANDROID_USER_HOME="$evidence/android-user"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$evidence/avd"
mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
printf 'no\n' | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
  --name SearchBeforeCI --package 'system-images;android-36;google_apis;x86_64' \
  --path "$ANDROID_AVD_HOME/SearchBeforeCI.avd"
"$emulator" -avd SearchBeforeCI -read-only -no-window -no-audio -no-snapshot -no-boot-anim \
  -memory 2048 -cores 2 -gpu swiftshader_indirect -skin 360x640 -port 5580 \
  >"$evidence/emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  "$adb" -s "$serial" emu kill >/dev/null 2>&1 || true
  if kill -0 "$emulator_pid" 2>/dev/null; then kill "$emulator_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
deadline=$((SECONDS + 360))
until [[ $(timeout 5 "$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]]; do
  if (( SECONDS >= deadline )) || ! kill -0 "$emulator_pid" 2>/dev/null; then
    tail -100 "$evidence/emulator.log"; echo 'Emulator did not boot; not an App test pass'; exit 1;
  fi
  sleep 2
done
[[ $("$adb" -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r') == 1 ]]
"$adb" -s "$serial" shell wm density 160
"$adb" -s "$serial" shell settings put system font_scale 1.5
"$adb" -s "$serial" shell input keyevent KEYCODE_WAKEUP
"$adb" -s "$serial" shell wm dismiss-keyguard
"$adb" -s "$serial" shell getprop ro.build.version.sdk
"$adb" -s "$serial" shell wm size
"$adb" -s "$serial" shell wm density
"$adb" -s "$serial" shell settings get system font_scale
apk=android-native/app/build/outputs/apk/debug/app-debug.apk
test_apk=android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
sha256sum "$apk" "$test_apk"
"$adb" -s "$serial" install "$apk"
"$adb" -s "$serial" install "$test_apk"
"$adb" -s "$serial" shell pm revoke tw.searchbefore.app.nativepreview android.permission.POST_NOTIFICATIONS
set +e
timeout 12m "$adb" -s "$serial" shell am instrument -w \
  tw.searchbefore.app.nativepreview.test/androidx.test.runner.AndroidJUnitRunner 2>&1 | tee "$evidence/instrumentation.txt"
instrument_status=${PIPESTATUS[0]}
set -e
# Explicit allowlist: never upload app storage, backups, AVD files, logs with environment
# details, APKs or Firebase configuration. All screens below contain public/synthetic data.
mkdir -p "$evidence/public-evidence"
cp "$evidence/instrumentation.txt" "$evidence/public-evidence/instrumentation.txt"
for screen in synthetic/area-range.png synthetic/recipe-batch.png \
  public-query/home.png public-query/beet-armyworm.png public-query/armyworm-group.png public-query/registered-use.png; do
  if "$adb" -s "$serial" shell run-as tw.searchbefore.app.nativepreview test -f "cache/native-validation/$screen"; then
    "$adb" -s "$serial" exec-out run-as tw.searchbefore.app.nativepreview cat "cache/native-validation/$screen" \
      >"$evidence/public-evidence/$(basename "$screen")"
  fi
done
"$adb" -s "$serial" logcat -d -b events >"$evidence/system-events.txt"
if grep -E 'am_anr.*(com.android.systemui|tw.searchbefore.app.nativepreview)' "$evidence/system-events.txt"; then
  echo 'System/App ANR invalidates the UI acceptance run'; exit 1;
fi
if [[ $instrument_status != 0 ]] || ! grep -Eq '^OK \([0-9]+ tests?\)' "$evidence/instrumentation.txt" || \
   grep -Eq 'FAILURES!!!|Process crashed|INSTRUMENTATION_FAILED' "$evidence/instrumentation.txt"; then
  echo 'UI suite failed or incomplete; no release is authorized'; exit 1;
fi
echo 'Public/synthetic UI suite passed. This does not verify Play login, private cloud data or production readiness.'
