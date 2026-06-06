package com.hotel.tvapp

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.hotel.tvapp.network.WebSocketClient
import org.json.JSONObject

class MainActivity : Activity() {

    private lateinit var webSocketClient: WebSocketClient
    private lateinit var webView: WebView
    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponentName: ComponentName

    private var isKioskActive = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enterImmersiveMode()

        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponentName = ComponentName(this, KioskAdminReceiver::class.java)

        if (isDeviceOwner()) {
            devicePolicyManager.setLockTaskPackages(
                adminComponentName,
                arrayOf(packageName)
            )
            Log.d("KioskMode", "Lock Task package whitelist set.")
        }

        webSocketClient = WebSocketClient(Config.SERVER_URL)
        
        webSocketClient.onMessageReceived = { message ->
            runOnUiThread {
                handleMdmCommand(message)
            }
        }
        
        webSocketClient.connect()

        webView = WebView(this).apply {
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                
                // --- Performance Optimizations ---
                useWideViewPort = true
                loadWithOverviewMode = true
                @Suppress("DEPRECATION")
                setRenderPriority(WebSettings.RenderPriority.HIGH)
                
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    enterImmersiveMode()
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }
            }
            loadUrl(Config.PORTAL_URL)

            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
        }

        setContentView(webView)
        startKioskMode()
    }

    private fun handleMdmCommand(data: JSONObject) {
        if (data.optString("action") != "mdm_command") return
        val command = data.optString("command")
        val payload = data.optJSONObject("payload") ?: JSONObject()
        
        Log.d("MDM", "Executing command: $command")
        
        when (command) {
            "reboot" -> {
                if (isDeviceOwner()) {
                    try {
                        devicePolicyManager.reboot(adminComponentName)
                    } catch (e: Exception) {
                        Log.e("MDM", "Failed to reboot: ${e.message}")
                    }
                } else {
                    Toast.makeText(this, "Reboot failed: Not Device Owner", Toast.LENGTH_LONG).show()
                }
            }
            "reload_portal" -> {
                webView.reload()
                Toast.makeText(this, "Portal Reloaded", Toast.LENGTH_SHORT).show()
            }
            "get_network_status" -> {
                reportNetworkStatus()
            }
            "send_message" -> {
                val message = payload.optString("message", "No message provided")
                AlertDialog.Builder(this)
                    .setTitle("Hotel Notification")
                    .setMessage(message)
                    .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                    .show()
            }
            "clear_cache" -> {
                webView.clearCache(true)
                webView.clearFormData()
                Toast.makeText(this, "Cache Cleared", Toast.LENGTH_SHORT).show()
            }
            "screen_off" -> {
                if (isDeviceOwner()) {
                    try {
                        devicePolicyManager.lockNow()
                    } catch (e: Exception) {
                        Log.e("MDM", "Failed to lock screen: ${e.message}")
                    }
                }
            }
            "screen_on" -> {
                try {
                    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                    val wakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "HotelTV::MDMWakeLock"
                    )
                    wakeLock.acquire(3000) // Acquire for 3 seconds to turn on screen
                } catch (e: Exception) {
                    Log.e("MDM", "Failed to wake screen: ${e.message}")
                }
            }
            else -> Log.w("MDM", "Unknown command: $command")
        }
    }

    private fun getLocalIpAddress(): String {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                val addrs = intf.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress ?: "Unknown"
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("MDM", "Error getting IP", e)
        }
        return "0.0.0.0"
    }

    private fun getMacAddress(): String {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                // Prefer ethernet (eth0) or wifi (wlan0)
                if (intf.name.equals("eth0", ignoreCase = true) || intf.name.equals("wlan0", ignoreCase = true)) {
                    val macBytes = intf.hardwareAddress ?: continue
                    val res1 = StringBuilder()
                    for (b in macBytes) {
                        res1.append(String.format("%02X:", b))
                    }
                    if (res1.isNotEmpty()) {
                        res1.deleteCharAt(res1.length - 1)
                    }
                    return res1.toString()
                }
            }
        } catch (e: Exception) {
            Log.e("MDM", "Error getting MAC", e)
        }
        return "Unknown"
    }

    private fun reportNetworkStatus() {
        try {
            val ipAddress = getLocalIpAddress()
            val macAddress = getMacAddress()
            
            // Try to get Wifi Signal if available, otherwise assume LAN (0 dBm)
            var rssi = 0
            try {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (wifiManager.isWifiEnabled) {
                    val wifiInfo = wifiManager.connectionInfo
                    if (wifiInfo.networkId != -1) {
                        rssi = wifiInfo.rssi
                    }
                }
            } catch (e: Exception) {}
            
            val report = JSONObject().apply {
                put("deviceId", Config.DEVICE_ID)
                put("ipAddress", ipAddress)
                put("macAddress", macAddress)
                put("wifiSignal", rssi)
            }
            
            webSocketClient.emit("network_status_report", report)
        } catch (e: Exception) {
            Log.e("MDM", "Failed to get network status", e)
        }
    }

    private fun startKioskMode() {
        if (isDeviceOwner()) {
            try {
                startLockTask()
                isKioskActive = true
            } catch (e: Exception) {
                Log.e("KioskMode", "Failed to start Lock Task: ${e.message}")
            }
        }
    }

    private fun isDeviceOwner(): Boolean {
        return devicePolicyManager.isDeviceOwnerApp(packageName)
    }

    private fun enterImmersiveMode() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                webView.reload()
                true
            }
            KeyEvent.KEYCODE_HOME -> {
                true
            }
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> {
                event?.let { webView.dispatchKeyEvent(it) }
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!isKioskActive) {
            val intent = intent
            startActivity(intent)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        webSocketClient.disconnect()
    }
}
