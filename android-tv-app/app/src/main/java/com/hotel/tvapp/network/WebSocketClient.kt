package com.hotel.tvapp.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class WebSocketClient(private val serverUrl: String) {
    private var socket: Socket? = null

    var onMessageReceived: ((JSONObject) -> Unit)? = null

    fun connect() {
        try {
            val opts = IO.Options()
            opts.reconnection = true
            opts.forceNew = true
            
            socket = IO.socket(serverUrl, opts)
            
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d("WebSocketClient", "Connected to Socket.io server: $serverUrl")
                
                // Register Device
                val registerData = JSONObject().apply {
                    put("deviceId", com.hotel.tvapp.Config.DEVICE_ID)
                }
                socket?.emit("register_device", registerData)
                
                // Send heartbeat
                val heartbeat = JSONObject().apply {
                    put("deviceId", com.hotel.tvapp.Config.DEVICE_ID)
                    put("status", "online")
                }
                socket?.emit("heartbeat", heartbeat)
            }

            // Custom event for pushing Welcome Screen
            socket?.on("show_welcome") { args ->
                Log.d("WebSocketClient", "Received show_welcome: ${args[0]}")
                try {
                    val data = args[0] as JSONObject
                    val formattedJson = JSONObject().apply {
                        put("action", "show_welcome")
                        put("payload", data)
                    }
                    onMessageReceived?.invoke(formattedJson)
                } catch (e: Exception) {
                    Log.e("WebSocketClient", "Error parsing show_welcome", e)
                }
            }

            // Listen for MDM commands
            socket?.on("mdm_command") { args ->
                Log.d("WebSocketClient", "Received mdm_command: ${args[0]}")
                try {
                    val data = args[0] as JSONObject
                    val formattedJson = JSONObject().apply {
                        put("action", "mdm_command")
                        put("command", data.optString("command"))
                        put("payload", data.optJSONObject("payload") ?: JSONObject())
                    }
                    onMessageReceived?.invoke(formattedJson)
                } catch (e: Exception) {
                    Log.e("WebSocketClient", "Error parsing mdm_command", e)
                }
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d("WebSocketClient", "Disconnected from server")
            }

            socket?.connect()
            
        } catch (e: Exception) {
            Log.e("WebSocketClient", "Socket connection error", e)
        }
    }

    fun emit(event: String, data: JSONObject) {
        socket?.emit(event, data)
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
