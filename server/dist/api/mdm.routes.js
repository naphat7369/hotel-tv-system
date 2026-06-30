"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const os_1 = __importDefault(require("os"));
const socket_1 = require("../websocket/socket");
const wol_service_1 = require("../services/wol.service");
const router = (0, express_1.Router)();
// Helper to get the actual LAN IP of the Node.js server
function getLocalIpAddress() {
    const interfaces = os_1.default.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        if (iface) {
            for (let i = 0; i < iface.length; i++) {
                const alias = iface[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    return alias.address;
                }
            }
        }
    }
    return '127.0.0.1';
}
// Get list of all known devices and their status
router.get('/devices', (req, res) => {
    const devicesList = Array.from(socket_1.connectedDevices.values());
    res.json(devicesList);
});
// Send an MDM command to a specific device
router.post('/devices/:id/command', async (req, res) => {
    const { id } = req.params;
    let { command, payload } = req.body;
    const io = req.app.get('io');
    if (!io) {
        return res.status(500).json({ error: 'WebSocket server not initialized' });
    }
    // Intercept install_apk to prepend the exact LAN IP so the TV Box can reach the server
    if (command === 'install_apk' && payload && payload.url) {
        if (payload.url.startsWith('/')) {
            const ip = getLocalIpAddress();
            const port = process.env.PORT || 3000;
            payload.url = `http://${ip}:${port}${payload.url}`;
        }
    }
    // Handle specific hardware/network commands
    if (command === 'screen_on') {
        await (0, wol_service_1.wakeDeviceById)(id);
    }
    else if (command === 'set_device_name') {
        const device = socket_1.connectedDevices.get(id);
        if (device && device.ipAddress) {
            const { setDeviceName } = require('../services/adb.service');
            await setDeviceName(device.ipAddress, payload.name);
            // Save in memory
            device.deviceName = payload.name;
            socket_1.connectedDevices.set(id, device);
            // Broadcast updated list to CMS
            const devicesList = Array.from(socket_1.connectedDevices.values());
            io.emit('device_status_update', devicesList);
        }
    }
    else if (command === 'set_room_number') {
        const device = socket_1.connectedDevices.get(id);
        if (device) {
            device.roomNumber = payload.roomNumber;
            socket_1.connectedDevices.set(id, device);
            // Broadcast update immediately to CMS
            const devicesList = Array.from(socket_1.connectedDevices.values());
            io.emit('device_status_update', devicesList);
        }
    }
    // For all other software commands (reload UI, clear cache, messages), emit via WebSocket
    io.to(`device_${id}`).emit('mdm_command', { command, payload });
    console.log(`[MDM] Sent command '${command}' to device ${id}`);
    res.json({ status: 'success', message: `Command ${command} dispatched to ${id}` });
});
exports.default = router;
