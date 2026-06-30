"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const socket_1 = require("../websocket/socket");
const request_routes_1 = require("./request.routes");
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';
// GET /api/v1/analytics/overview - Get real analytics summary
router.get('/overview', async (req, res) => {
    try {
        // 1. Real device data from WebSocket connectedDevices map
        const allDevices = Array.from(socket_1.connectedDevices.values());
        const onlineDevices = allDevices.filter(d => d.isOnline);
        const offlineDevices = allDevices.filter(d => !d.isOnline);
        // 2. Real channel data from Prisma
        const [totalChannels, activeChannels, topChannels] = await Promise.all([
            prisma.channel.count({ where: { hotelId: MOCK_HOTEL_ID } }),
            prisma.channel.count({ where: { hotelId: MOCK_HOTEL_ID, isActive: true } }),
            prisma.channel.findMany({
                where: { hotelId: MOCK_HOTEL_ID, isActive: true },
                orderBy: { channelNumber: 'asc' },
                take: 5,
                select: { id: true, name: true, channelNumber: true, category: true, logoUrl: true }
            })
        ]);
        // 3. Room Service Requests (in-memory real data)
        const requestStats = (0, request_routes_1.getRequestStats)();
        // 4. Connected device details
        const deviceList = allDevices.map(d => ({
            deviceId: d.deviceId,
            roomNumber: d.roomNumber || 'Unassigned',
            isOnline: d.isOnline,
            ipAddress: d.ipAddress,
            wifiSignal: d.wifiSignal,
            lastSeen: d.lastSeen,
            deviceName: d.deviceName
        }));
        res.status(200).json({
            devices: {
                online: onlineDevices.length,
                offline: offlineDevices.length,
                total: allDevices.length,
                list: deviceList
            },
            channels: {
                total: totalChannels,
                active: activeChannels,
                topChannels
            },
            requests: requestStats,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[Analytics] Error fetching overview:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});
// GET /api/v1/analytics/reports - Get detailed analytics reports
router.get('/reports', async (req, res) => {
    try {
        const daysParam = req.query.days;
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const whereClause = { hotelId: MOCK_HOTEL_ID };
        if (!isNaN(days) && days > 0) {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            whereClause.timestamp = { gte: dateLimit };
        }
        const events = await prisma.usageEvent.findMany({
            where: whereClause,
            orderBy: { timestamp: 'desc' }
        });
        // Aggregate Channels (duration by channelId)
        const channelWatch = events.filter(e => e.eventType === 'CHANNEL_WATCH');
        const channelStats = {};
        channelWatch.forEach(e => {
            try {
                if (e.value && e.durationSeconds) {
                    const val = JSON.parse(e.value);
                    if (val.channelId && val.name) {
                        if (!channelStats[val.channelId])
                            channelStats[val.channelId] = { name: val.name, duration: 0 };
                        channelStats[val.channelId].duration += e.durationSeconds;
                    }
                }
            }
            catch (err) { }
        });
        const topChannels = Object.values(channelStats).sort((a, b) => b.duration - a.duration).slice(0, 5);
        // Aggregate Apps (count by appName)
        const appOpens = events.filter(e => e.eventType === 'APP_OPEN');
        const appStats = {};
        appOpens.forEach(e => {
            try {
                if (e.value) {
                    const val = JSON.parse(e.value);
                    if (val.appName) {
                        appStats[val.appName] = (appStats[val.appName] || 0) + 1;
                    }
                }
            }
            catch (err) { }
        });
        const topApps = Object.entries(appStats)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // Aggregate Menu Clicks
        const menuClicks = events.filter(e => e.eventType === 'MENU_CLICK');
        const menuStats = {};
        menuClicks.forEach(e => {
            try {
                if (e.value) {
                    const val = JSON.parse(e.value);
                    if (val.menu) {
                        menuStats[val.menu] = (menuStats[val.menu] || 0) + 1;
                    }
                }
            }
            catch (err) { }
        });
        const topMenus = Object.entries(menuStats)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        res.status(200).json({
            topChannels,
            topApps,
            topMenus,
            totalEvents: events.length
        });
    }
    catch (error) {
        console.error('[Analytics] Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});
// POST /api/v1/analytics/events - Record a usage event from device
router.post('/events', async (req, res) => {
    const { deviceId, eventType, value, durationSeconds, roomId, guestType } = req.body;
    if (!deviceId || !eventType) {
        return res.status(400).json({ error: 'deviceId and eventType are required' });
    }
    try {
        const newEvent = await prisma.usageEvent.create({
            data: {
                hotelId: MOCK_HOTEL_ID,
                deviceId,
                eventType,
                value: value ? JSON.stringify(value) : null,
                durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : null,
                roomId: roomId || null,
                guestType: guestType || null,
            }
        });
        res.status(201).json(newEvent);
    }
    catch (error) {
        console.error('[Analytics] Error recording event:', error);
        res.status(500).json({ error: 'Failed to record event' });
    }
});
exports.default = router;
