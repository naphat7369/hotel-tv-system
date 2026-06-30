"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// GET /api/v1/devices - List all devices
router.get('/', (req, res) => {
    // TODO: Fetch from database
    res.status(200).json({ devices: [] });
});
// POST /api/v1/devices/register - Register new box
router.post('/register', (req, res) => {
    const { box_serial, mac_address, room_id } = req.body;
    if (!box_serial || !mac_address) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    // TODO: Save to database
    res.status(201).json({
        message: 'Device registered successfully',
        device: { box_serial, mac_address, status: 'registered' }
    });
});
// GET /api/v1/devices/:id - Get device details
router.get('/:id', (req, res) => {
    const { id } = req.params;
    // TODO: Fetch from database
    res.status(200).json({ id, message: 'Device details' });
});
exports.default = router;
