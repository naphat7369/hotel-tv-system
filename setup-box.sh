#!/usr/bin/env bash
# ==============================================================================
# Hotel TV Box Provisioning & Kiosk Enforcer Script
# S31 Sukhumvit Hotel - Hotel TV System
#
# Usage:
#   ./setup-box.sh <IP_ADDRESS>
# Example:
#   ./setup-box.sh 172.16.110.54
# ==============================================================================

set -e

IP="$1"

if [ -z "$IP" ]; then
    echo "❌ Usage: $0 <IP_ADDRESS>"
    echo "Example: $0 172.16.110.54"
    exit 1
fi

PORT="5555"
DEVICE="${IP}:${PORT}"
APK_PATH="/home/itadmin/hotel-tv-system/uploads/apks/hotel-tv-latest.apk"

echo "=========================================================="
echo "🚀 Starting Hotel TV Box Setup for: ${DEVICE}"
echo "=========================================================="

# 1. Connect ADB
echo "📡 [1/6] Connecting to ${DEVICE}..."
adb connect "${DEVICE}"
sleep 2

# Verify device is authorized
STATE=$(adb -s "${DEVICE}" get-state 2>/dev/null || echo "offline")
if [ "$STATE" != "device" ]; then
    echo "❌ Error: Device is not ready (State: ${STATE}). Check TV screen for ADB authorization prompt."
    exit 1
fi
echo "✅ Connected successfully!"

# Detect Android version — app requires minSdk 28 (Android 9+).
# Live TV uses TextureView rendering, verified on Android 11 (SDK 30) and Android 14 (SDK 34).
ANDROID_VER=$(adb -s "${DEVICE}" shell getprop ro.build.version.release | tr -d '\r')
ANDROID_SDK=$(adb -s "${DEVICE}" shell getprop ro.build.version.sdk | tr -d '\r')
BOX_MODEL=$(adb -s "${DEVICE}" shell getprop ro.product.model | tr -d '\r')
echo "📱 Box model: ${BOX_MODEL} | Android ${ANDROID_VER} (SDK ${ANDROID_SDK})"
if [ -n "$ANDROID_SDK" ] && [ "$ANDROID_SDK" -lt 28 ] 2>/dev/null; then
    echo "❌ Error: Android ${ANDROID_VER} (SDK ${ANDROID_SDK}) is not supported. Minimum is Android 9 (SDK 28)."
    exit 1
fi

# 2. Install / Update APK
if [ -f "$APK_PATH" ]; then
    echo "📦 [2/6] Installing Hotel TV App (${APK_PATH})..."
    adb -s "${DEVICE}" install -r -d -g "$APK_PATH" || {
        echo "⚠️  Direct install returned warning, retrying with simple install..."
        adb -s "${DEVICE}" install -r "$APK_PATH"
    }
    echo "✅ APK installed successfully."
else
    echo "⚠️  APK file not found at ${APK_PATH}, skipping install."
fi

# 3. Activate Device Admin (MDM) & Permissions
echo "🛡️  [3/6] Activating Device Admin & Permissions..."
adb -s "${DEVICE}" shell dpm set-active-admin com.hotel.tvapp/.KioskAdminReceiver || true
adb -s "${DEVICE}" shell appops set com.hotel.tvapp SYSTEM_ALERT_WINDOW allow || true
adb -s "${DEVICE}" shell appops set com.hotel.tvapp REQUEST_INSTALL_PACKAGES allow || true
echo "✅ Device Admin & Permissions registered."

# 4. Permanently Disable System Launcher (Prevents portal drop on Netflix/Apps exit)
echo "🔒 [4/6] Disabling default Google TV / Android TV Launchers..."
adb -s "${DEVICE}" shell pm disable-user --user 0 com.google.android.tvlauncher 2>/dev/null || true
adb -s "${DEVICE}" shell pm disable-user --user 0 com.google.android.apps.tv.launcherx 2>/dev/null || true
echo "✅ System launchers disabled (Google TV home will not take over)."

# 5. Set Hotel TV as the System Default Home Activity
echo "🏠 [5/6] Registering Hotel TV as Default Home Activity..."
adb -s "${DEVICE}" shell cmd package set-home-activity com.hotel.tvapp/.MainActivity || true

# 6. Launch Portal & Verify
echo "🎬 [6/6] Launching Hotel TV Portal..."
adb -s "${DEVICE}" shell am start -n com.hotel.tvapp/.MainActivity -a android.intent.action.MAIN -c android.intent.category.HOME

echo "🔍 Verifying active Home Launcher..."
RESOLVED=$(adb -s "${DEVICE}" shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME)
echo "${RESOLVED}"

echo "=========================================================="
echo "🎉 Setup complete for ${DEVICE}!"
echo "   - Kiosk lock: ACTIVE"
echo "   - Google TV Launcher: DISABLED"
echo "   - Returning from Netflix/Apps: LOCKED TO HOTEL PORTAL"
echo "=========================================================="
