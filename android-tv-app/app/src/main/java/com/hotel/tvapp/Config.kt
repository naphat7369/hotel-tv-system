package com.hotel.tvapp

import android.content.Context

object Config {
    // ── Device Identity ──────────────────────────────────────────────────────
    const val DEVICE_ID = "BOX-101-A"

    // ── SharedPreferences keys ───────────────────────────────────────────────
    const val PREFS_NAME       = "hotel_tv_config"
    const val KEY_SERVER_IP    = "server_ip"
    const val DEFAULT_SERVER_IP = "10.0.101.253"

    // ── Dynamic Getters ──────────────────────────────────────────────────────

    /**
     * Returns the currently saved Server IP, falling back to DEFAULT_SERVER_IP.
     */
    fun getServerIp(context: Context): String =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SERVER_IP, DEFAULT_SERVER_IP) ?: DEFAULT_SERVER_IP

    /**
     * Persists a new Server IP to SharedPreferences.
     */
    fun saveServerIp(context: Context, ip: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_IP, ip.trim())
            .apply()
    }

    /**
     * Full WebSocket URL used by the native WebSocketClient.
     */
    fun getServerUrl(context: Context): String =
        "ws://${getServerIp(context)}:3000"

    /**
     * Full HTTP URL used by the WebView to load the React portal.
     */
    fun getPortalUrl(context: Context): String =
        "http://${getServerIp(context)}:5174"
}
