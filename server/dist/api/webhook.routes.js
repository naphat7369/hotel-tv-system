"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyApiKey = exports.prisma = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const socket_1 = require("../websocket/socket");
const adb_service_1 = require("../services/adb.service");
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
exports.prisma = new client_1.PrismaClient(); // Exported for easy mocking in tests
// Middleware to verify the API key
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.WEBHOOK_API_KEY || 'default-secret-key-123';
    if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};
exports.verifyApiKey = verifyApiKey;
router.use(exports.verifyApiKey);
// Webhook: Handle new Check-in
router.post('/checkin', async (req, res) => {
    try {
        const rawPayload = JSON.stringify(req.body, null, 2);
        console.log('\n--- [Webhook] RAW PAYLOAD RECEIVED ---');
        console.log(rawPayload);
        console.log('--------------------------------------\n');
        // Save to file for easy viewing
        const logPath = path_1.default.join(__dirname, '../../webhook_payloads.log');
        const logEntry = `\n[${new Date().toISOString()}] CHECK-IN PAYLOAD:\n${rawPayload}\n------------------------\n`;
        fs_1.default.appendFileSync(logPath, logEntry);
        const payloadRoom = req.body.roomNumber || req.body.room;
        const payloadGuest = req.body.guestName || req.body.guest;
        const language = req.body.language || req.body.nation;
        const vipStatus = req.body.vipStatus || req.body.vip || req.body.VIP;
        const gender = req.body.gender || req.body.sex;
        const title = req.body.title || req.body.salutation || req.body.prefix;
        if (!payloadRoom) {
            return res.status(400).json({ error: 'roomNumber or room is required' });
        }
        // Ensure roomNumber is string for the TV Box deviceId match
        const roomNumber = String(payloadRoom);
        let guestName = payloadGuest ? String(payloadGuest).trim() : 'Guest';
        // Add title prefix if available and not already present
        if (guestName !== 'Guest') {
            let prefix = '';
            if (title) {
                prefix = String(title).trim();
            }
            else if (gender) {
                const g = String(gender).toLowerCase();
                if (g === 'm' || g === 'male')
                    prefix = 'Mr.';
                else if (g === 'f' || g === 'female')
                    prefix = 'Ms.';
            }
            if (prefix && !guestName.toLowerCase().startsWith(prefix.toLowerCase().replace('.', ''))) {
                // Ensure prefix ends with a dot if it's Mr or Ms
                if ((prefix === 'Mr' || prefix === 'Ms') && !prefix.endsWith('.'))
                    prefix += '.';
                guestName = `${prefix} ${guestName}`;
            }
        }
        // If this is actually a Check-out payload (service: 'delete'), redirect to checkout logic
        if (req.body.service === 'delete') {
            console.log(`[Webhook] 'delete' service detected in /checkin route. Redirecting to checkout logic for Room: ${roomNumber}`);
            // We will handle checkout directly here to avoid duplicate code
            const hotel = await exports.prisma.hotel.findFirst();
            if (hotel) {
                const room = await exports.prisma.room.findFirst({
                    where: { roomNumber: String(roomNumber), hotelId: hotel.id }
                });
                if (room) {
                    const activeReservations = await exports.prisma.reservation.findMany({
                        where: { roomId: room.id, status: 'In-House' }
                    });
                    for (const resRecord of activeReservations) {
                        await exports.prisma.reservation.update({
                            where: { id: resRecord.id },
                            data: { status: 'Checked-Out', checkOut: new Date() }
                        });
                    }
                }
            }
            // Socket update & ADB Clear
            const io = req.app.get('io');
            if (io) {
                let targetDeviceId = null;
                let targetIp = null;
                for (const [id, device] of socket_1.connectedDevices.entries()) {
                    if (device.roomNumber === String(roomNumber)) {
                        targetDeviceId = id;
                        targetIp = device.ipAddress || null;
                        break;
                    }
                }
                if (targetDeviceId) {
                    io.to(`device_${targetDeviceId}`).emit('guest_update', {
                        status: 'checked_out',
                        guestName: null,
                        guestTag: null,
                    });
                    console.log(`[Webhook] Sent guest_update(checked_out) to device_${targetDeviceId} (Room ${roomNumber})`);
                    if (targetIp) {
                        try {
                            console.log(`[Webhook] Initiating ADB auto-clear for IP: ${targetIp}`);
                            // Wait for the clearing process to completely finish without blocking the webhook too long? 
                            // Wait, doing it async might be better so webhook returns 200 immediately, but let's await it to guarantee it.
                            (0, adb_service_1.clearGuestApps)(targetIp).then(() => {
                                console.log(`[Webhook] Auto-clear finished for ${targetIp}.`);
                            }).catch(err => console.error(`[Webhook Error] Auto-clear failed:`, err));
                        }
                        catch (e) { }
                    }
                }
            }
            // Forward to WiFi
            try {
                const wifiApiUrl = process.env.PMS_API_URL || 'http://192.168.0.251:8012';
                await axios_1.default.post(`${wifiApiUrl}/wifi-auth/create`, req.body, { headers: { 'Content-Type': 'application/json' } });
            }
            catch (e) { }
            return res.status(200).json({ message: 'Check-out (via delete service) processed successfully' });
        }
        console.log(`[Webhook] Check-in received for Room: ${roomNumber}, Guest: ${guestName || 'Unknown'}`);
        // Fetch the first active hotel
        const hotel = await exports.prisma.hotel.findFirst();
        if (!hotel) {
            return res.status(500).json({ error: 'No active hotel found in the database.' });
        }
        // Find or create the room
        let room = await exports.prisma.room.findFirst({
            where: { roomNumber: String(roomNumber), hotelId: hotel.id }
        });
        if (!room) {
            room = await exports.prisma.room.create({
                data: {
                    hotelId: hotel.id,
                    roomNumber: String(roomNumber)
                }
            });
        }
        // Create or update the Reservation with the valid room ID
        await exports.prisma.reservation.create({
            data: {
                hotelId: hotel.id,
                roomId: room.id,
                guestFirstName: guestName, // Just using first name field for the full name from mock
                guestLanguage: language,
                guestLoyaltyTier: vipStatus,
                status: 'In-House',
                checkIn: new Date()
            }
        });
        const io = req.app.get('io');
        if (io) {
            // Find the deviceId that matches this room number
            let targetDeviceId = null;
            for (const [id, device] of socket_1.connectedDevices.entries()) {
                if (device.roomNumber === String(roomNumber)) {
                    targetDeviceId = id;
                    break;
                }
            }
            if (targetDeviceId) {
                io.to(`device_${targetDeviceId}`).emit('guest_update', {
                    status: 'checked_in',
                    guestName,
                    guestTag: vipStatus // Mapping vipStatus to guestTag for the TV frontend
                });
                console.log(`[Webhook] Sent guest_update(checked_in) to device_${targetDeviceId} (Room ${roomNumber})`);
            }
            else {
                console.log(`[Webhook Warning] TV for room ${roomNumber} is currently offline. Screen will update when it wakes up.`);
            }
        }
        // Forward the exact same payload to the original FastAPI WiFi system!
        // This allows the HMS to point to our Node.js server, and we act as a middleman.
        try {
            const wifiApiUrl = process.env.PMS_API_URL || 'http://192.168.0.251:8012';
            console.log(`[Webhook] Forwarding payload to WiFi system: ${wifiApiUrl}/wifi-auth/create`);
            await axios_1.default.post(`${wifiApiUrl}/wifi-auth/create`, req.body, {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`[Webhook] Successfully forwarded to WiFi system!`);
        }
        catch (forwardError) {
            console.error(`[Webhook Warning] Failed to forward to WiFi system:`, forwardError.message);
        }
        res.status(200).json({ message: 'Check-in processed successfully' });
    }
    catch (error) {
        console.error('[Webhook] Check-in Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Webhook: Handle new Check-out
router.post('/checkout', async (req, res) => {
    try {
        const rawPayload = JSON.stringify(req.body, null, 2);
        const logPath = path_1.default.join(__dirname, '../../webhook_payloads.log');
        const logEntry = `\n[${new Date().toISOString()}] CHECK-OUT PAYLOAD:\n${rawPayload}\n------------------------\n`;
        fs_1.default.appendFileSync(logPath, logEntry);
        const payloadRoom = req.body.roomNumber || req.body.room;
        if (!payloadRoom) {
            return res.status(400).json({ error: 'roomNumber or room is required' });
        }
        const roomNumber = String(payloadRoom);
        console.log(`[Webhook] Check-out received for Room: ${roomNumber}`);
        const hotel = await exports.prisma.hotel.findFirst();
        if (!hotel) {
            return res.status(500).json({ error: 'No active hotel found in the database.' });
        }
        const room = await exports.prisma.room.findFirst({
            where: { roomNumber: String(roomNumber), hotelId: hotel.id }
        });
        if (room) {
            // Find active reservation for this room
            const activeReservations = await exports.prisma.reservation.findMany({
                where: { roomId: room.id, status: 'In-House' }
            });
            // Update to Checked-Out
            for (const resRecord of activeReservations) {
                await exports.prisma.reservation.update({
                    where: { id: resRecord.id },
                    data: { status: 'Checked-Out', checkOut: new Date() }
                });
            }
        }
        const io = req.app.get('io');
        if (io) {
            // Find the deviceId that matches this room number
            let targetDeviceId = null;
            let targetIp = null;
            for (const [id, device] of socket_1.connectedDevices.entries()) {
                if (device.roomNumber === String(roomNumber)) {
                    targetDeviceId = id;
                    targetIp = device.ipAddress || null;
                    break;
                }
            }
            if (targetDeviceId) {
                io.to(`device_${targetDeviceId}`).emit('guest_update', {
                    status: 'checked_out',
                    guestName: null,
                    guestTag: null,
                });
                console.log(`[Webhook] Sent guest_update(checked_out) to device_${targetDeviceId} (Room ${roomNumber})`);
                if (targetIp) {
                    try {
                        console.log(`[Webhook] Initiating ADB auto-clear for IP: ${targetIp}`);
                        (0, adb_service_1.clearGuestApps)(targetIp).then(() => {
                            console.log(`[Webhook] Auto-clear finished for ${targetIp}.`);
                        }).catch(err => console.error(`[Webhook Error] Auto-clear failed:`, err));
                    }
                    catch (e) { }
                }
            }
            else {
                console.log(`[Webhook Warning] TV for room ${roomNumber} is currently offline. Screen will update when it wakes up.`);
            }
        }
        // Forward the payload to WiFi
        try {
            const wifiApiUrl = process.env.PMS_API_URL || 'http://192.168.0.251:8012';
            await axios_1.default.post(`${wifiApiUrl}/wifi-auth/create`, req.body, { headers: { 'Content-Type': 'application/json' } });
        }
        catch (e) { }
        res.status(200).json({ message: 'Check-out processed successfully' });
    }
    catch (error) {
        console.error('[Webhook] Check-out Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
