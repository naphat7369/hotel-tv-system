package com.hotel.tvapp

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import android.util.Log
import android.widget.Toast
import java.io.File
import android.app.PendingIntent
import android.content.pm.PackageInstaller
import java.io.FileInputStream
import java.io.OutputStream

class ApkInstaller(private val context: Context) {

    private var downloadId: Long = -1

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
            if (id == downloadId) {
                Log.d("ApkInstaller", "Download complete!")
                Toast.makeText(context, "APK Downloaded. Starting install...", Toast.LENGTH_SHORT).show()
                installApk()
            }
        }
    }

    fun startDownloadAndInstall(apkUrl: String) {
        try {
            // Clean up old downloads
            val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
            if (file.exists()) {
                file.delete()
            }

            val request = DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("Hotel TV App Update")
                .setDescription("Downloading update in background...")
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "update.apk")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadId = downloadManager.enqueue(request)

            context.registerReceiver(
                downloadReceiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_EXPORTED
            )
            
            Log.d("ApkInstaller", "Download started: $apkUrl")
        } catch (e: Exception) {
            Log.e("ApkInstaller", "Failed to start download", e)
        }
    }

    private fun installApk() {
        try {
            val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
            if (!file.exists()) {
                Log.e("ApkInstaller", "APK file not found after download.")
                return
            }

            // Check for Install Unknown Apps permission on Android 8.0+
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    Log.w("ApkInstaller", "Missing REQUEST_INSTALL_PACKAGES permission")
                    Toast.makeText(context, "กรุณากดอนุญาตให้ Hotel TV ติดตั้งแอปได้ แล้วลองอีกครั้ง", Toast.LENGTH_LONG).show()
                    val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return
                }
            }

            // Attempt silent install using PackageInstaller API
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            val out: OutputStream = session.openWrite("package", 0, -1)
            val input = FileInputStream(file)
            val buffer = ByteArray(65536)
            var c: Int
            while (input.read(buffer).also { c = it } != -1) {
                out.write(buffer, 0, c)
            }
            session.fsync(out)
            input.close()
            out.close()

            val intent = Intent(context, InstallReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                sessionId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )

            Log.d("ApkInstaller", "Committing PackageInstaller session...")
            session.commit(pendingIntent.intentSender)

        } catch (e: Exception) {
            Log.e("ApkInstaller", "Failed silent install, falling back to Intent", e)
            fallbackInstall()
        }
    }

    private fun fallbackInstall() {
        try {
            val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
            val uri = Uri.fromFile(file)
            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e("ApkInstaller", "Fallback install also failed", e)
        }
    }
}
