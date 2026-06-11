package com.hotel.tvapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log
import android.widget.Toast

class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // This means silent install is NOT allowed (e.g. not Device Owner).
                // We must prompt the user.
                Log.w("InstallReceiver", "Silent install failed. Prompting user...")
                val confirmationIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirmationIntent != null) {
                    confirmationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(confirmationIntent)
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                Log.d("InstallReceiver", "APK Installed Successfully!")
                Toast.makeText(context, "App Installed Successfully!", Toast.LENGTH_LONG).show()
            }
            else -> {
                Log.e("InstallReceiver", "Install failed. Status: $status, Message: $message")
                Toast.makeText(context, "Install failed: $message", Toast.LENGTH_LONG).show()
            }
        }
    }
}
