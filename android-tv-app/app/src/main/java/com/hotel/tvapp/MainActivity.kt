package com.hotel.tvapp

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.hotel.tvapp.network.WebSocketClient
import org.json.JSONObject

@UnstableApi
class MainActivity : Activity() {

    // ─── Views ──────────────────────────────────────────────────────────────
    private lateinit var webView: WebView
    private lateinit var playerView: PlayerView

    // ─── ExoPlayer ──────────────────────────────────────────────────────────
    private var exoPlayer: ExoPlayer? = null

    // ─── Multicast Lock ─────────────────────────────────────────────────────
    // Required on Android to allow joining UDP multicast groups over WiFi.
    // Without this lock, the WiFi chip filters out multicast packets.
    private var multicastLock: WifiManager.MulticastLock? = null

    // ─── MDM ────────────────────────────────────────────────────────────────
    private lateinit var webSocketClient: WebSocketClient
    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponentName: ComponentName
    private lateinit var apkInstaller: ApkInstaller
    private var isKioskActive = false

    // ─── Secret PIN code to open settings (Default: 1234) ────────────────────
    private val secretPin = listOf(
        KeyEvent.KEYCODE_1,
        KeyEvent.KEYCODE_2,
        KeyEvent.KEYCODE_3,
        KeyEvent.KEYCODE_4
    )
    private val pinBuffer = mutableListOf<Int>()

    /**
     * Helper to open Android Settings after unlocking Kiosk mode
     */
    private fun openAndroidSettings() {
        try {
            if (isKioskActive) {
                try { stopLockTask() } catch (e: Exception) {}
                isKioskActive = false
            }
            val intent = android.content.Intent(android.provider.Settings.ACTION_SETTINGS)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            Toast.makeText(this, "Opening Settings...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e("MDM", "Failed to open settings", e)
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  JAVASCRIPT BRIDGE — AndroidTVBridge
    //  Injected into WebView so React can control native ExoPlayer
    // ════════════════════════════════════════════════════════════════════════
    inner class AndroidTVBridge {

        /**
         * Called by React when the user selects a Live TV channel.
         *
         * Supports:
         *   - UDP Multicast: udp://@239.x.x.x:port  (zero latency, LAN only)
         *   - RTP:           rtp://@239.x.x.x:port
         *   - RTSP:          rtsp://server:port/stream
         *   - HLS fallback:  http://server/stream.m3u8  (internet fallback)
         */
        @JavascriptInterface
        fun playStream(streamUrl: String) {
            Log.d("AndroidTVBridge", "playStream called with: $streamUrl")
            runOnUiThread {
                acquireMulticastLock()
                initAndPlay(streamUrl)
            }
        }

        /**
         * Called by React when the user exits Live TV mode (Back/Escape).
         * Stops the player and releases hardware resources.
         */
        @JavascriptInterface
        fun stopStream() {
            Log.d("AndroidTVBridge", "stopStream called")
            runOnUiThread {
                releasePlayer()
                releaseMulticastLock()
            }
        }

        /**
         * Called by React to check if we are running inside the native Android app.
         * React can use this to decide whether to use AndroidTVBridge or HLS.js fallback.
         *
         * Usage in React:
         *   if (window.AndroidTVBridge) { use native } else { use HLS.js }
         */
        @JavascriptInterface
        fun isNativePlayer(): Boolean = true

        /**
         * Called by React to get the current stream URL (useful for OSD after rotation).
         */
        @JavascriptInterface
        fun getCurrentStream(): String {
            return exoPlayer?.currentMediaItem?.localConfiguration?.uri?.toString() ?: ""
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ════════════════════════════════════════════════════════════════════════

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on — essential for a TV display that runs 24/7
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enterImmersiveMode()

        // ── Device Admin / Kiosk ──────────────────────────────────────────
        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponentName = ComponentName(this, KioskAdminReceiver::class.java)
        apkInstaller = ApkInstaller(this)

        if (isDeviceOwner()) {
            devicePolicyManager.setLockTaskPackages(adminComponentName, arrayOf(packageName))
            Log.d("KioskMode", "Lock Task package whitelist set.")
        }

        // ── MDM WebSocket ────────────────────────────────────────────────
        webSocketClient = WebSocketClient(Config.SERVER_URL)
        webSocketClient.onMessageReceived = { message ->
            runOnUiThread { handleMdmCommand(message) }
        }
        webSocketClient.connect()

        // ── Inflate Layout ────────────────────────────────────────────────
        // The layout has: FrameLayout > [PlayerView (bottom), WebView (top)]
        setContentView(R.layout.activity_main)

        playerView = findViewById(R.id.player_view)
        webView    = findViewById(R.id.web_view)

        // ── Configure PlayerView ──────────────────────────────────────────
        // Hardware-accelerated layer for maximum performance
        playerView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        // Hide the player view initially; it will appear when playStream() is called
        playerView.visibility = View.GONE

        // ── Configure WebView ─────────────────────────────────────────────
        configureWebView()

        // Load the React portal
        webView.loadUrl(Config.PORTAL_URL)
    }

    // ════════════════════════════════════════════════════════════════════════
    //  WEBVIEW CONFIGURATION
    // ════════════════════════════════════════════════════════════════════════

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.apply {
            // ── CRITICAL: Make the WebView background transparent ──────────
            // This allows the ExoPlayer video (behind the WebView) to show through
            // when React sets its own background to transparent during TV playback.
            setBackgroundColor(Color.TRANSPARENT)
            background.alpha = 0

            // Since API 21+, Hardware layer supports transparent backgrounds natively
            setLayerType(View.LAYER_TYPE_HARDWARE, null)

            settings.apply {
                javaScriptEnabled       = true
                domStorageEnabled       = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode               = WebSettings.LOAD_DEFAULT
                mixedContentMode        = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort         = true
                loadWithOverviewMode    = true
                setSupportZoom(false)
                builtInZoomControls    = false
                displayZoomControls    = false
            }

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    enterImmersiveMode()
                }
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = false
            }

            // ── Inject AndroidTVBridge ────────────────────────────────────
            // React can now call: window.AndroidTVBridge.playStream("udp://...")
            addJavascriptInterface(AndroidTVBridge(), "AndroidTVBridge")

            // ── App Launcher Bridge (existing) ────────────────────────────
            addJavascriptInterface(object {
                @JavascriptInterface
                fun launchApp(packageName: String) {
                    runOnUiThread {
                        try {
                            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
                            if (intent != null) {
                                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                                context.startActivity(intent)
                            } else {
                                Toast.makeText(context, "App not installed: $packageName", Toast.LENGTH_SHORT).show()
                            }
                        } catch (e: Exception) {
                            Log.e("WebAppInterface", "Failed to launch app: $packageName", e)
                        }
                    }
                }
            }, "AndroidTV")

            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  EXOPLAYER — Initialize & Play
    // ════════════════════════════════════════════════════════════════════════

    private fun initAndPlay(streamUrl: String) {
        // Release any existing player before creating a new one
        releasePlayer()

        Log.d("ExoPlayer", "Initializing player for stream: $streamUrl")

        // Build ExoPlayer with DefaultMediaSourceFactory.
        // This factory supports: HLS (.m3u8), DASH, RTSP, and UDP (udp://)
        // UDP multicast is handled by UdpDataSource under the hood.
        exoPlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(this)
            )
            .build()
            .also { player ->

                // Attach the player to the PlayerView surface
                playerView.player = player

                // Build the MediaItem from the given URL.
                // ExoPlayer auto-detects the protocol (UDP, RTSP, HLS, etc.)
                val mediaItem = MediaItem.fromUri(streamUrl)
                player.setMediaItem(mediaItem)

                // Add listener for state changes (optional: for error handling)
                player.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        when (state) {
                            Player.STATE_READY -> {
                                Log.d("ExoPlayer", "Playback READY — stream connected")
                                // Show PlayerView once stream is ready
                                playerView.visibility = View.VISIBLE
                            }
                            Player.STATE_BUFFERING -> {
                                Log.d("ExoPlayer", "Buffering...")
                            }
                            Player.STATE_ENDED -> {
                                Log.d("ExoPlayer", "Stream ended")
                            }
                            Player.STATE_IDLE -> {
                                Log.d("ExoPlayer", "Player IDLE")
                            }
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e("ExoPlayer", "Playback error: ${error.message}", error)
                        // Notify React about the error so it can show error UI
                        runOnUiThread {
                            webView.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('nativePlayerError', { detail: { message: '${error.message}' } }));",
                                null
                            )
                        }
                    }
                })

                // Prepare and start playback
                player.prepare()
                player.playWhenReady = true

                // Show the player view (will be fully visible after STATE_READY)
                playerView.visibility = View.VISIBLE
                Log.d("ExoPlayer", "Player prepared and starting playback")
            }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  EXOPLAYER — Release
    // ════════════════════════════════════════════════════════════════════════

    private fun releasePlayer() {
        exoPlayer?.let { player ->
            Log.d("ExoPlayer", "Releasing player")
            player.stop()
            player.release()
            exoPlayer = null
        }
        playerView.player = null
        playerView.visibility = View.GONE
    }

    // ════════════════════════════════════════════════════════════════════════
    //  MULTICAST LOCK — Required for UDP multicast over WiFi
    // ════════════════════════════════════════════════════════════════════════

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return

        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wifiManager.createMulticastLock("HotelTV_IPTV_Lock").apply {
                setReferenceCounted(true)
                acquire()
                Log.d("Multicast", "MulticastLock acquired — UDP multicast enabled")
            }
        } catch (e: Exception) {
            Log.e("Multicast", "Failed to acquire MulticastLock: ${e.message}")
        }
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
                Log.d("Multicast", "MulticastLock released")
            }
        } catch (e: Exception) {
            Log.e("Multicast", "Failed to release MulticastLock: ${e.message}")
        }
        multicastLock = null
    }

    // ════════════════════════════════════════════════════════════════════════
    //  MDM COMMAND HANDLER
    // ════════════════════════════════════════════════════════════════════════

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
                // Stop any playing stream before reloading
                releasePlayer()
                releaseMulticastLock()
                webView.reload()
                Toast.makeText(this, "Portal Reloaded", Toast.LENGTH_SHORT).show()
            }
            "get_network_status" -> reportNetworkStatus()
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
                    try { devicePolicyManager.lockNow() } catch (e: Exception) {
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
                    wakeLock.acquire(3000)
                } catch (e: Exception) {
                    Log.e("MDM", "Failed to wake screen: ${e.message}")
                }
            }
            "open_settings" -> openAndroidSettings()
            "install_apk" -> {
                val url = payload.optString("url")
                if (url.isNotEmpty()) {
                    apkInstaller.startDownloadAndInstall(url)
                } else {
                    Log.e("MDM", "No URL provided for install_apk")
                }
            }
            else -> Log.w("MDM", "Unknown command: $command")
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  NETWORK STATUS REPORTING
    // ════════════════════════════════════════════════════════════════════════

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
                if (intf.name.equals("eth0", ignoreCase = true) ||
                    intf.name.equals("wlan0", ignoreCase = true)) {
                    val macBytes = intf.hardwareAddress ?: continue
                    val res1 = StringBuilder()
                    for (b in macBytes) {
                        res1.append(String.format("%02X:", b))
                    }
                    if (res1.isNotEmpty()) res1.deleteCharAt(res1.length - 1)
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
            val ipAddress  = getLocalIpAddress()
            val macAddress = getMacAddress()
            var rssi = 0
            try {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                if (wifiManager.isWifiEnabled) {
                    val wifiInfo = wifiManager.connectionInfo
                    if (wifiInfo.networkId != -1) rssi = wifiInfo.rssi
                }
            } catch (e: Exception) {}

            val report = JSONObject().apply {
                put("deviceId",   Config.DEVICE_ID)
                put("ipAddress",  ipAddress)
                put("macAddress", macAddress)
                put("wifiSignal", rssi)
            }
            webSocketClient.emit("network_status_report", report)
        } catch (e: Exception) {
            Log.e("MDM", "Failed to get network status", e)
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  KIOSK MODE
    // ════════════════════════════════════════════════════════════════════════

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

    private fun isDeviceOwner(): Boolean =
        devicePolicyManager.isDeviceOwnerApp(packageName)

    // ════════════════════════════════════════════════════════════════════════
    //  IMMERSIVE / FULLSCREEN
    // ════════════════════════════════════════════════════════════════════════

    @Suppress("DEPRECATION")
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

    // ════════════════════════════════════════════════════════════════════════
    //  KEY HANDLING — D-Pad navigation & secret code
    // ════════════════════════════════════════════════════════════════════════

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Track secret PIN code to open settings (e.g. 1 2 3 4)
        if (keyCode in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9) {
            pinBuffer.add(keyCode)
            if (pinBuffer.size > secretPin.size) pinBuffer.removeAt(0)

            if (pinBuffer == secretPin) {
                pinBuffer.clear()
                openAndroidSettings()
                return true
            }
        }

        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                // Send Escape to React so it can handle exit logic cleanly
                webView.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27}));",
                    null
                )
                true
            }
            KeyEvent.KEYCODE_HOME -> {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home'}));",
                    null
                )
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

    // ════════════════════════════════════════════════════════════════════════
    //  ACTIVITY LIFECYCLE
    // ════════════════════════════════════════════════════════════════════════

    override fun onResume() {
        super.onResume()
        startKioskMode()
        exoPlayer?.play()
    }

    override fun onPause() {
        super.onPause()
        exoPlayer?.pause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        if (intent?.hasCategory(android.content.Intent.CATEGORY_HOME) == true) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home'}));",
                null
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        releasePlayer()
        releaseMulticastLock()
        webSocketClient.disconnect()
    }
}
