"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = exports.connectedDevices = void 0;
const socket_io_1 = require("socket.io");
// In-memory store for connected devices
exports.connectedDevices = new Map();
// Function to update the CMS about device status changes
const broadcastDeviceList = (io) => {
    const devicesList = Array.from(exports.connectedDevices.values());
    io.emit('device_status_update', devicesList);
};
const initWebSocket = (server) => {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: '*', // For development only
            methods: ['GET', 'POST']
        }
    });
    io.on('connection', (socket) => {
        console.log(`[WebSocket] Client connected: ${socket.id}`);
        // We attach the deviceId to the socket for easy lookup on disconnect
        let currentDeviceId = null;
        // Device Handshake
        socket.on('register_device', (data) => {
            const deviceId = data.deviceId;
            let roomNumber = data.roomNumber || 'Unassigned';
            if (!deviceId)
                return;
            currentDeviceId = deviceId;
            const existingDevice = exports.connectedDevices.get(deviceId) || {};
            // Prevent multiple tabs from wiping out a valid room number with 'Unassigned'
            if (roomNumber === 'Unassigned' && existingDevice.roomNumber && existingDevice.roomNumber !== 'Unassigned') {
                roomNumber = existingDevice.roomNumber;
            }
            console.log(`[WebSocket] Device registered: ${deviceId} (Room: ${roomNumber})`);
            socket.join(`device_${deviceId}`);
            // Update store but preserve existing properties like ipAddress
            exports.connectedDevices.set(deviceId, {
                ...existingDevice,
                deviceId,
                isOnline: true,
                lastSeen: new Date().toISOString(),
                socketId: socket.id,
                roomNumber
            });
            broadcastDeviceList(io);
            socket.emit('registered', { status: 'success' });
            // Automatically request network status upon registration so CMS populates immediately
            io.to(`device_${deviceId}`).emit('mdm_command', { command: 'get_network_status', payload: {} });
        });
        // Handle Heartbeat
        socket.on('heartbeat', (data) => {
            const deviceId = data.deviceId;
            if (!deviceId)
                return;
            const existing = exports.connectedDevices.get(deviceId);
            exports.connectedDevices.set(deviceId, {
                ...existing,
                deviceId,
                isOnline: true,
                lastSeen: new Date().toISOString()
            });
            // We don't broadcast on every heartbeat to save bandwidth, 
            // but the server knows it's online.
        });
        // Handle Network Status Report
        socket.on('network_status_report', (data) => {
            const deviceId = data.deviceId;
            if (!deviceId)
                return;
            const existing = exports.connectedDevices.get(deviceId);
            exports.connectedDevices.set(deviceId, {
                ...existing,
                deviceId,
                isOnline: true,
                lastSeen: new Date().toISOString(),
                ipAddress: data.ipAddress,
                macAddress: data.macAddress,
                wifiSignal: data.wifiSignal
            });
            console.log(`[WebSocket] Network report from ${deviceId}: IP=${data.ipAddress}`);
            broadcastDeviceList(io);
        });
        // Handle Disconnect
        socket.on('disconnect', () => {
            console.log(`[WebSocket] Client disconnected: ${socket.id}`);
            if (currentDeviceId) {
                const existing = exports.connectedDevices.get(currentDeviceId);
                if (existing && existing.socketId === socket.id) {
                    existing.isOnline = false;
                    existing.lastSeen = new Date().toISOString();
                    exports.connectedDevices.set(currentDeviceId, existing);
                    broadcastDeviceList(io);
                }
                else if (existing) {
                    console.log(`[WebSocket] Ignored stale disconnect for ${currentDeviceId}`);
                }
            }
        });
    });
    return io;
};
exports.initWebSocket = initWebSocket;
