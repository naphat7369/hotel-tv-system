"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const pms_routes_1 = __importDefault(require("../pms.routes"));
// Mock the adb.service
vitest_1.vi.mock('../../services/adb.service', () => ({
    clearGuestApps: vitest_1.vi.fn().mockResolvedValue(undefined),
    rebootDevice: vitest_1.vi.fn().mockResolvedValue(undefined),
    wakeUpDevice: vitest_1.vi.fn().mockResolvedValue(undefined),
}));
// Import mock functions to verify calls
const adb_service_1 = require("../../services/adb.service");
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Setup mock io
const mockIo = {
    to: vitest_1.vi.fn().mockReturnThis(),
    emit: vitest_1.vi.fn(),
};
app.set('io', mockIo);
app.use('/api/v1/pms', pms_routes_1.default);
(0, vitest_1.describe)('PMS Routes', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('POST /api/v1/pms/checkin should process check-in successfully', async () => {
        const checkinData = {
            roomNumber: '101',
            guestName: 'John Doe',
            guestTag: 'VIP',
            deviceId: 'BOX-101-A',
            ip: '192.168.1.101',
        };
        const res = await (0, supertest_1.default)(app)
            .post('/api/v1/pms/checkin')
            .send(checkinData)
            .expect(200);
        (0, vitest_1.expect)(res.body.status).toBe('success');
        (0, vitest_1.expect)(mockIo.to).toHaveBeenCalledWith('device_BOX-101-A');
        (0, vitest_1.expect)(mockIo.emit).toHaveBeenCalledWith('guest_update', {
            status: 'checked_in',
            guestName: 'John Doe',
            guestTag: 'VIP',
        });
    });
    (0, vitest_1.it)('POST /api/v1/pms/checkout should clear guest apps and process checkout successfully', async () => {
        const checkoutData = {
            roomNumber: '101',
            deviceId: 'BOX-101-A',
            ip: '192.168.1.101',
        };
        const res = await (0, supertest_1.default)(app)
            .post('/api/v1/pms/checkout')
            .send(checkoutData)
            .expect(200);
        (0, vitest_1.expect)(res.body.status).toBe('success');
        (0, vitest_1.expect)(adb_service_1.clearGuestApps).toHaveBeenCalledWith('192.168.1.101');
        (0, vitest_1.expect)(mockIo.to).toHaveBeenCalledWith('device_BOX-101-A');
        (0, vitest_1.expect)(mockIo.emit).toHaveBeenCalledWith('guest_update', {
            status: 'checked_out',
            guestName: null,
            guestTag: null,
        });
    });
    (0, vitest_1.it)('POST /api/v1/pms/checkout should return 400 if no IP is provided or found', async () => {
        const checkoutData = {
            roomNumber: '101',
            deviceId: 'BOX-NONEXISTENT', // No device in connected map, so IP can't be found
        };
        const res = await (0, supertest_1.default)(app)
            .post('/api/v1/pms/checkout')
            .send(checkoutData)
            .expect(400);
        (0, vitest_1.expect)(res.body.error).toBe('IP address is required for ADB execution');
    });
    (0, vitest_1.it)('GET /api/v1/pms/status/:ip should return current reservation status', async () => {
        // Check-in first to store in map
        await (0, supertest_1.default)(app)
            .post('/api/v1/pms/checkin')
            .send({
            roomNumber: '202',
            guestName: 'Jane Smith',
            guestTag: 'Regular',
            ip: '192.168.1.202',
        })
            .expect(200);
        // Fetch status
        const statusRes = await (0, supertest_1.default)(app)
            .get('/api/v1/pms/status/192.168.1.202')
            .expect(200);
        (0, vitest_1.expect)(statusRes.body.status).toBe('checked_in');
        (0, vitest_1.expect)(statusRes.body.guestName).toBe('Jane Smith');
        (0, vitest_1.expect)(statusRes.body.roomNumber).toBe('202');
    });
    (0, vitest_1.it)('GET /api/v1/pms/status/:ip should return checked_out for unknown IP', async () => {
        const res = await (0, supertest_1.default)(app)
            .get('/api/v1/pms/status/192.168.1.999')
            .expect(200);
        (0, vitest_1.expect)(res.body.status).toBe('checked_out');
        (0, vitest_1.expect)(res.body.guestName).toBeNull();
    });
});
