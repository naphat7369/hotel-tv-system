package com.hotel.tvapp

import android.content.Context
import java.util.UUID

object Config {
    // ── SharedPreferences keys ───────────────────────────────────────────────
    const val PREFS_NAME        = "hotel_tv_config"
    const val KEY_SERVER_IP     = "server_ip"
    const val KEY_DEVICE_ID     = "device_id"
    const val DEFAULT_SERVER_IP = "10.0.101.200"

    // ── Device Identity ──────────────────────────────────────────────────────
    /**
     * Returns a persistent, unique Device ID for this TV box.
     * On first call, a UUID is generated and saved to SharedPreferences.
     * Subsequent calls always return the same ID — survives reboots and
     * network changes, but each physical box gets its own unique identity.
     */
    fun getDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var id = prefs.getString(KEY_DEVICE_ID, null)
        if (id == null) {
            id = "BOX-" + UUID.randomUUID().toString().uppercase().substring(0, 8)
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }

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
