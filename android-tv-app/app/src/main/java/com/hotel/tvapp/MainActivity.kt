package com.hotel.tvapp

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.text.InputType
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.hotel.tvapp.network.WebSocketClient
import org.json.JSONObject

@UnstableApi
class MainActivity : Activity() {

    // ─── Views ──────────────────────────────────────────────────────────────
    private lateinit var webView: WebView
    private lateinit var playerView: PlayerView

    // ─── Loading Overlay Views ───────────────────────────────────────────────
    private lateinit var loadingOverlay: LinearLayout
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var loadingTitle: TextView
    private lateinit var loadingSubtitle: TextView
    private lateinit var loadingIpHint: TextView

    // ─── ExoPlayer ──────────────────────────────────────────────────────────
    private var exoPlayer: ExoPlayer? = null

    // ─── Multicast Lock ─────────────────────────────────────────────────────
    private var multicastLock: WifiManager.MulticastLock? = null

    // ─── MDM ────────────────────────────────────────────────────────────────
    private lateinit var webSocketClient: WebSocketClient
    private lateinit var devicePolicyManager: DevicePolicyManager
    private lateinit var adminComponentName: ComponentName
    private lateinit var apkInstaller: ApkInstaller
    private var isKioskActive = false

    // ─── Auto-Retry Handler ──────────────────────────────────────────────────
    private val retryHandler = Handler(Looper.getMainLooper())
    private val retryRunnable = Runnable {
        Log.d("LoadingOverlay", "Auto-retry: reloading portal…")
        loadPortal()
    }

    // ─── 5-Click Counter ─────────────────────────────────────────────────────
    // Stores the timestamp of each center-key press. We keep the last 5.
    // The dialog fires only if the 5th click arrives within 2000ms of the 1st.
    private val clickTimestamps = ArrayDeque<Long>(5)
    private val CLICK_WINDOW_MS = 2000L
    private val REQUIRED_CLICKS  = 5

    // ════════════════════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ════════════════════════════════════════════════════════════════════════

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        System.setProperty("java.net.preferIPv4Stack", "true")
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        enterImmersiveMode()

        devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponentName  = ComponentName(this, KioskAdminReceiver::class.java)
        apkInstaller        = ApkInstaller(this)

        if (isDeviceOwner()) {
            devicePolicyManager.setLockTaskPackages(adminComponentName, arrayOf(packageName))
            Log.d("KioskMode", "Lock Task package whitelist set.")
        }

        // ── MDM WebSocket ────────────────────────────────────────────────
        webSocketClient = WebSocketClient(Config.getServerUrl(this))
        webSocketClient.onMessageReceived = { message ->
            runOnUiThread { handleMdmCommand(message) }
        }
        webSocketClient.connect()

        // ── Inflate Layout ────────────────────────────────────────────────
        setContentView(R.layout.activity_main)

        playerView      = findViewById(R.id.player_view)
        webView         = findViewById(R.id.web_view)
        loadingOverlay  = findViewById(R.id.loading_overlay)
        loadingSpinner  = findViewById(R.id.loading_spinner)
        loadingTitle    = findViewById(R.id.loading_title)
        loadingSubtitle = findViewById(R.id.loading_subtitle)
        loadingIpHint   = findViewById(R.id.loading_ip_hint)

        playerView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        playerView.visibility = View.GONE

        configureWebView()
        loadPortal()
    }

    // ════════════════════════════════════════════════════════════════════════
    //  LOADING OVERLAY HELPERS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Show the loading overlay with a given title and subtitle.
     * Updates the current-IP hint so staff can always see what IP is being used.
     */
    private fun showLoading(title: String, subtitle: String) {
        runOnUiThread {
            loadingOverlay.visibility = View.VISIBLE
            loadingSpinner.visibility = View.VISIBLE
            loadingTitle.text   = title
            loadingSubtitle.text = subtitle
            loadingIpHint.text  = "Server: ${Config.getPortalUrl(this)}"
        }
    }

    /**
     * Switch the overlay to an error state.
     * Hides the spinner, shows a red-tinted title and a detailed subtitle.
     * Also schedules an automatic retry.
     */
    private fun showError(detail: String = "") {
        runOnUiThread {
            loadingOverlay.visibility = View.VISIBLE
            loadingSpinner.visibility = View.GONE
            loadingTitle.text   = "Connection Failed"
            loadingSubtitle.text = if (detail.isNotBlank())
                detail
            else
                "Check the server IP or network.\nThe app will retry automatically."
            loadingIpHint.text  = "Server: ${Config.getPortalUrl(this)}"
        }
        scheduleRetry()
    }

    /** Hide the overlay (page loaded successfully). */
    private fun hideLoading() {
        runOnUiThread {
            cancelRetry()
            loadingOverlay.animate()
                .alpha(0f)
                .setDuration(400)
                .withEndAction {
                    loadingOverlay.visibility = View.GONE
                    loadingOverlay.alpha = 1f   // reset for next time
                }
                .start()
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  AUTO-RETRY
    // ════════════════════════════════════════════════════════════════════════

    private fun scheduleRetry() {
        retryHandler.removeCallbacks(retryRunnable)
        retryHandler.postDelayed(retryRunnable, 5000L)
    }

    private fun cancelRetry() {
        retryHandler.removeCallbacks(retryRunnable)
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PORTAL LOADING
    // ════════════════════════════════════════════════════════════════════════

    private fun loadPortal() {
        showLoading("Connecting…", "Loading hotel portal from ${Config.getServerIp(this)}…")
        webView.loadUrl(Config.getPortalUrl(this))
    }

    // ════════════════════════════════════════════════════════════════════════
    //  WEBVIEW CONFIGURATION
    // ════════════════════════════════════════════════════════════════════════

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.apply {
            setBackgroundColor(Color.TRANSPARENT)
            background.alpha = 0
            setLayerType(View.LAYER_TYPE_HARDWARE, null)

            settings.apply {
                javaScriptEnabled                = true
                domStorageEnabled                = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode                        = WebSettings.LOAD_DEFAULT
                mixedContentMode                 = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort                  = true
                loadWithOverviewMode             = true
                setSupportZoom(false)
                builtInZoomControls   = false
                displayZoomControls   = false
            }

            webViewClient = object : WebViewClient() {

                override fun onPageStarted(
                    view: WebView?,
                    url: String?,
                    favicon: android.graphics.Bitmap?
                ) {
                    super.onPageStarted(view, url, favicon)
                    showLoading("Connecting…", "Reaching server at ${Config.getServerIp(this@MainActivity)}…")
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    enterImmersiveMode()
                    // Only hide if the URL is our portal (not about:blank from an error)
                    if (url != null && url != "about:blank") {
                        Log.d("WebView", "Page finished: $url — hiding overlay.")
                        hideLoading()
                    }
                }

                /** Network-level errors (no connection, DNS failure, timeout). */
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    // Only handle errors for the main frame (not sub-resources)
                    if (request?.isForMainFrame == true) {
                        val description = error?.description?.toString() ?: "Unknown error"
                        Log.e("WebView", "Main frame error: $description")
                        showError("Could not reach the server.\nCheck Server IP or network.\n($description)")
                    }
                }

                /** HTTP-level errors (404, 502, etc.). */
                override fun onReceivedHttpError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    errorResponse: WebResourceResponse?
                ) {
                    super.onReceivedHttpError(view, request, errorResponse)
                    if (request?.isForMainFrame == true) {
                        val code = errorResponse?.statusCode ?: 0
                        Log.e("WebView", "HTTP error: $code")
                        showError("Server returned an error (HTTP $code).\nCheck if the server is running.")
                    }
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = false
            }

            // ── JavaScript Bridges ────────────────────────────────────────
            addJavascriptInterface(AndroidTVBridge(), "AndroidTVBridge")
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
    //  5-CLICK IP CONFIGURATION DIALOG
    //  Uses timestamp-array approach:
    //    - Each CENTER/ENTER press adds System.currentTimeMillis() to a deque.
    //    - We keep at most REQUIRED_CLICKS (5) entries.
    //    - After 5 presses, check if (newest - oldest) <= CLICK_WINDOW_MS (2000ms).
    //    - If yes → open dialog. Always reset the deque after dialog opens OR
    //      if the window has already expired.
    // ════════════════════════════════════════════════════════════════════════

    private fun recordBackClick(): Boolean {
        val now = System.currentTimeMillis()

        // Prune expired entries (older than the window) before adding
        clickTimestamps.removeAll { (now - it) > CLICK_WINDOW_MS }

        clickTimestamps.addLast(now)

        // Keep only the last REQUIRED_CLICKS entries
        while (clickTimestamps.size > REQUIRED_CLICKS) {
            clickTimestamps.removeFirst()
        }

        Log.d("5Click", "Back click recorded — ${clickTimestamps.size}/$REQUIRED_CLICKS in window")

        if (clickTimestamps.size == REQUIRED_CLICKS) {
            val delta = clickTimestamps.last() - clickTimestamps.first()
            Log.d("5Click", "5 back clicks detected — delta = ${delta}ms (max $CLICK_WINDOW_MS ms)")
            if (delta <= CLICK_WINDOW_MS) {
                clickTimestamps.clear()
                showIpConfigDialog()
                return true
            }
        }
        return false
    }

    private fun showIpConfigDialog() {
        Log.d("5Click", "Opening IP config dialog")
        val currentIp = Config.getServerIp(this)

        val input = EditText(this).apply {
            // Standard text keyboard to allow multiple dots in IP address
            inputType = InputType.TYPE_CLASS_TEXT
            setText(currentIp)
            hint      = "e.g. 192.168.1.63"
            setSelectAllOnFocus(true)
            requestFocus()
        }

        AlertDialog.Builder(this)
            .setTitle("⚙️ Server IP Configuration")
            .setMessage("Enter the IP address of the Hotel TV Server.")
            .setView(input)
            .setPositiveButton("Connect") { dialog, _ ->
                val newIp = input.text.toString().trim()
                if (newIp.isNotEmpty() && newIp != currentIp) {
                    Config.saveServerIp(this, newIp)
                    Toast.makeText(this, "IP saved: $newIp — reconnecting…", Toast.LENGTH_LONG).show()
                    Log.d("Config", "New server IP saved: $newIp")
                    cancelRetry()
                    reconnectWebSocket()
                    loadPortal()
                } else if (newIp == currentIp) {
                    Toast.makeText(this, "IP unchanged. Retrying current server…", Toast.LENGTH_SHORT).show()
                    cancelRetry()
                    loadPortal()
                } else {
                    Toast.makeText(this, "Invalid IP entered.", Toast.LENGTH_SHORT).show()
                }
                dialog.dismiss()
            }
            .setNegativeButton("Cancel") { dialog, _ -> dialog.dismiss() }
            .show()
    }

    // ════════════════════════════════════════════════════════════════════════
    //  WEBSOCKET RECONNECT WITH NEW IP
    // ════════════════════════════════════════════════════════════════════════

    private fun reconnectWebSocket() {
        webSocketClient.disconnect()
        webSocketClient = WebSocketClient(Config.getServerUrl(this))
        webSocketClient.onMessageReceived = { message ->
            runOnUiThread { handleMdmCommand(message) }
        }
        webSocketClient.connect()
        Log.d("WebSocket", "Reconnected to ${Config.getServerUrl(this)}")
    }

    // ════════════════════════════════════════════════════════════════════════
    //  KEY HANDLING — D-Pad navigation, 5-click secret, Home button
    // ════════════════════════════════════════════════════════════════════════

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {

            // Center / Enter — forward the event to WebView for normal UI navigation.
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                event?.let { webView.dispatchKeyEvent(it) }
                true
            }

            KeyEvent.KEYCODE_BACK -> {
                if (!recordBackClick()) {
                    // Normal back behavior: webView back or Escape key event
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', keyCode: 27}));",
                            null
                        )
                    }
                }
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
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                event?.let { webView.dispatchKeyEvent(it) }
                true
            }

            else -> super.onKeyDown(keyCode, event)
        }
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
                releasePlayer()
                releaseMulticastLock()
                cancelRetry()
                loadPortal()
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
    //  HELPER — Open Android Settings (unlocks kiosk first)
    // ════════════════════════════════════════════════════════════════════════

    private fun openAndroidSettings() {
        try {
            if (isKioskActive) {
                try { stopLockTask() } catch (e: Exception) {}
                isKioskActive = false
            }
            val intent = android.content.Intent(android.provider.Settings.ACTION_SETTINGS)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            Toast.makeText(this, "Opening Settings…", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e("MDM", "Failed to open settings", e)
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  JAVASCRIPT BRIDGE — AndroidTVBridge
    // ════════════════════════════════════════════════════════════════════════

    inner class AndroidTVBridge {

        @JavascriptInterface
        fun playStream(streamUrl: String) {
            // Keep the URL as-is; CustomMulticastDataSource handles udp://@IP:PORT format
            Log.d("AndroidTVBridge", "playStream: $streamUrl")
            runOnUiThread {
                acquireMulticastLock()
                initAndPlay(streamUrl)
            }
        }

        @JavascriptInterface
        fun stopStream() {
            Log.d("AndroidTVBridge", "stopStream")
            runOnUiThread {
                releasePlayer()
                releaseMulticastLock()
            }
        }

        @JavascriptInterface
        fun isNativePlayer(): Boolean = true

        @JavascriptInterface
        fun getCurrentStream(): String =
            exoPlayer?.currentMediaItem?.localConfiguration?.uri?.toString() ?: ""

        /**
         * Allows React to read the device IP so it can connect to the right server.
         */
        @JavascriptInterface
        fun getIpAddress(): String = getLocalIpAddress()
    }

    // ════════════════════════════════════════════════════════════════════════
    //  EXOPLAYER
    // ════════════════════════════════════════════════════════════════════════

    private fun initAndPlay(streamUrl: String) {
        releasePlayer()
        Log.d("ExoPlayer", "Initializing for: $streamUrl")

        val dataSourceFactory = androidx.media3.datasource.DataSource.Factory {
            if (streamUrl.startsWith("udp://")) {
                CustomMulticastDataSource()
            } else {
                androidx.media3.datasource.DefaultDataSource.Factory(this@MainActivity).createDataSource()
            }
        }

        exoPlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(this).setDataSourceFactory(dataSourceFactory)
            )
            .build()
            .also { player ->
                playerView.player = player
                val mediaItem = MediaItem.fromUri(streamUrl)
                player.setMediaItem(mediaItem)

                player.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        when (state) {
                            Player.STATE_READY    -> playerView.visibility = View.VISIBLE
                            Player.STATE_ENDED    -> Log.d("ExoPlayer", "Stream ended")
                            Player.STATE_BUFFERING-> Log.d("ExoPlayer", "Buffering…")
                            Player.STATE_IDLE     -> Log.d("ExoPlayer", "Player IDLE")
                        }
                    }
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e("ExoPlayer", "Playback error: ${error.message}", error)
                        runOnUiThread {
                            webView.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('nativePlayerError', { detail: { message: '${error.message}' } }));",
                                null
                            )
                        }
                    }
                })

                player.prepare()
                player.playWhenReady = true
                playerView.visibility = View.VISIBLE
            }
    }

    private fun releasePlayer() {
        exoPlayer?.let { player ->
            player.stop()
            player.release()
            exoPlayer = null
        }
        playerView.player = null
        playerView.visibility = View.GONE
    }

    // ════════════════════════════════════════════════════════════════════════
    //  MULTICAST LOCK
    // ════════════════════════════════════════════════════════════════════════

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wifiManager.createMulticastLock("HotelTV_IPTV_Lock").apply {
                setReferenceCounted(true)
                acquire()
                Log.d("Multicast", "MulticastLock acquired")
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
                    val sb = StringBuilder()
                    for (b in macBytes) sb.append(String.format("%02X:", b))
                    if (sb.isNotEmpty()) sb.deleteCharAt(sb.length - 1)
                    return sb.toString()
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
            Log.e("MDM", "Failed to report network status", e)
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
        cancelRetry()
        releasePlayer()
        releaseMulticastLock()
        webSocketClient.disconnect()
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  CUSTOM MULTICAST DATA SOURCE — bypasses Android TV EACCES bug on UDP bind
// ════════════════════════════════════════════════════════════════════════════

class CustomMulticastDataSource : androidx.media3.datasource.DataSource {
    private var socket: java.net.MulticastSocket? = null
    private var multicastAddress: java.net.InetAddress? = null
    private val packetBuffer = ByteArray(188 * 1024) // 188 bytes per TS packet × 1024
    private val packet = java.net.DatagramPacket(packetBuffer, packetBuffer.size)
    private var opened = false
    private var uri: android.net.Uri? = null
    private var packetRemaining = 0
    private var packetOffset = 0

    override fun addTransferListener(transferListener: androidx.media3.datasource.TransferListener) {}

    /**
     * Parse host and port from UDP multicast URI.
     * Supports both:
     *   udp://@238.0.0.2:6000  (standard multicast "SSM" format)
     *   udp://238.0.0.2:6000   (simple format)
     */
    private fun parseMulticastUri(uriStr: String): Pair<String, Int>? {
        return try {
            // Remove udp:// or udp://@  prefix
            val stripped = uriStr
                .removePrefix("udp://@")
                .removePrefix("udp://")
            val colonIdx = stripped.lastIndexOf(':')
            if (colonIdx < 0) return null
            val host = stripped.substring(0, colonIdx)
            val port = stripped.substring(colonIdx + 1).toInt()
            Pair(host, port)
        } catch (e: Exception) {
            android.util.Log.e("MulticastDS", "Failed to parse URI: $uriStr", e)
            null
        }
    }

    override fun open(dataSpec: androidx.media3.datasource.DataSpec): Long {
        uri = dataSpec.uri
        val uriStr = dataSpec.uri.toString()
        android.util.Log.d("MulticastDS", "Opening URI: $uriStr")

        val (host, port) = parseMulticastUri(uriStr) ?: run {
            android.util.Log.e("MulticastDS", "Cannot parse multicast URI: $uriStr")
            throw java.io.IOException("Cannot parse multicast URI: $uriStr")
        }

        android.util.Log.d("MulticastDS", "Multicast group=$host port=$port")

        try {
            multicastAddress = java.net.InetAddress.getByName(host)
            socket = java.net.MulticastSocket(null).apply {
                reuseAddress = true
                soTimeout = 5000 // 5 second receive timeout
                // Bind directly to the multicast group address (instead of 0.0.0.0)
                // This is required on some Android TV boxes to prevent the kernel from dropping packets.
                bind(java.net.InetSocketAddress(multicastAddress, port))
            }

            // Try to join on each active non-loopback network interface
            // Prioritise eth0 (wired LAN) then wlan0 (WiFi)
            val allInterfaces = java.net.NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
            val preferredOrder = allInterfaces.sortedByDescending {
                when {
                    it.name.startsWith("eth") -> 2  // Ethernet first
                    it.name.startsWith("wlan") -> 1 // WiFi second
                    else -> 0
                }
            }

            var joinedAny = false
            for (ni in preferredOrder) {
                if (!ni.isUp || !ni.supportsMulticast() || ni.isLoopback) continue
                try {
                    socket?.joinGroup(java.net.InetSocketAddress(multicastAddress, port), ni)
                    android.util.Log.d("MulticastDS", "Joined $host:$port on ${ni.name}")
                    joinedAny = true
                } catch (e: Exception) {
                    android.util.Log.w("MulticastDS", "Cannot join on ${ni.name}: ${e.message}")
                }
            }

            if (!joinedAny) {
                // Fallback: join without specifying interface
                socket?.joinGroup(multicastAddress)
                android.util.Log.w("MulticastDS", "Joined $host without specific interface (fallback)")
            }

            opened = true
            android.util.Log.d("MulticastDS", "Socket opened successfully")
        } catch (e: Exception) {
            android.util.Log.e("MulticastDS", "Failed to open socket", e)
            throw java.io.IOException(e)
        }
        return androidx.media3.common.C.LENGTH_UNSET.toLong()
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (packetRemaining == 0) {
            try {
                packet.length = packetBuffer.size
                socket?.receive(packet)
                
                val receivedLength = packet.length
                var payloadOffset = 0

                // IPTV streams are usually MPEG-TS (starts with 0x47).
                // If it's RTP, it has a 12+ byte header before the TS packets.
                // We will scan for the first 0x47 to strip any non-TS header.
                if (receivedLength > 0 && packetBuffer[0] != 0x47.toByte()) {
                    if (receivedLength > 12 && packetBuffer[12] == 0x47.toByte()) {
                        // Standard 12-byte RTP header
                        payloadOffset = 12
                    } else {
                        // Scan for 0x47 sync byte
                        for (i in 0 until receivedLength) {
                            if (packetBuffer[i] == 0x47.toByte()) {
                                payloadOffset = i
                                break
                            }
                        }
                    }
                }

                packetRemaining = receivedLength - payloadOffset
                packetOffset = payloadOffset

            } catch (e: java.net.SocketTimeoutException) {
                android.util.Log.w("MulticastDS", "Receive timeout — no data from multicast group")
                return androidx.media3.common.C.RESULT_END_OF_INPUT
            } catch (e: Exception) {
                android.util.Log.e("MulticastDS", "Receive error: ${e.message}")
                return androidx.media3.common.C.RESULT_END_OF_INPUT
            }
        }
        val bytesToRead = minOf(packetRemaining, length)
        System.arraycopy(packetBuffer, packetOffset, buffer, offset, bytesToRead)
        packetOffset    += bytesToRead
        packetRemaining -= bytesToRead
        return bytesToRead
    }

    override fun getUri(): android.net.Uri? = uri

    override fun close() {
        if (opened) {
            try {
                val allInterfaces = java.net.NetworkInterface.getNetworkInterfaces()
                while (allInterfaces?.hasMoreElements() == true) {
                    val ni = allInterfaces.nextElement()
                    if (!ni.isUp || !ni.supportsMulticast() || ni.isLoopback) continue
                    try {
                        socket?.leaveGroup(java.net.InetSocketAddress(multicastAddress, 0), ni)
                    } catch (e: Exception) {}
                }
            } catch (e: Exception) {}
            try { socket?.close() } catch (e: Exception) {}
            socket = null
            multicastAddress = null
            opened = false
            android.util.Log.d("MulticastDS", "Socket closed")
        }
    }
}
