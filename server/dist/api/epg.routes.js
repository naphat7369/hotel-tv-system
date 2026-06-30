"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// GET /api/v1/epg - Get EPG data
router.get('/', (req, res) => {
    res.status(200).json({ data: [] });
});
// POST /api/v1/epg/sync - Sync EPG data from source
router.post('/sync', (req, res) => {
    res.status(200).json({ message: 'EPG Sync initiated' });
});
exports.default = router;
