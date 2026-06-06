package com.hotel.tvapp

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device Admin Receiver — required for Lock Task Mode / Kiosk Mode.
 * This class is declared in AndroidManifest.xml as a device admin.
 *
 * To activate kiosk mode, run this ADB command once on the device:
 *   adb shell dpm set-device-owner com.hotel.tvapp/.KioskAdminReceiver
 */
class KioskAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d("KioskAdmin", "Device Admin Enabled — Kiosk Mode is ready.")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d("KioskAdmin", "Device Admin Disabled.")
    }
}
