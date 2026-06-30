"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const webhook_routes_1 = __importStar(require("./webhook.routes"));
const socket_1 = require("../websocket/socket");
// Mock Prisma
const mPrismaClient = vitest_1.vi.hoisted(() => ({
    hotel: {
        findFirst: vitest_1.vi.fn(),
    },
    room: {
        findFirst: vitest_1.vi.fn(),
    },
    reservation: {
        create: vitest_1.vi.fn(),
        findMany: vitest_1.vi.fn(),
        update: vitest_1.vi.fn(),
    }
}));
vitest_1.vi.mock('@prisma/client', () => {
    return {
        PrismaClient: class {
            hotel = mPrismaClient.hotel;
            room = mPrismaClient.room;
            reservation = mPrismaClient.reservation;
        }
    };
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Mock Socket.io
const mockEmit = vitest_1.vi.fn();
const mockTo = vitest_1.vi.fn(() => ({ emit: mockEmit }));
const mockIo = { to: mockTo };
app.set('io', mockIo);
app.use('/webhooks', webhook_routes_1.default);
(0, vitest_1.describe)('Webhook Routes', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        process.env.WEBHOOK_API_KEY = 'test-key';
        // Setup a dummy device for testing
        socket_1.connectedDevices.clear();
        socket_1.connectedDevices.set('101', {
            deviceId: '101',
            roomNumber: '101',
            isOnline: true,
            lastSeen: new Date().toISOString()
        });
    });
    (0, vitest_1.afterEach)(() => {
        socket_1.connectedDevices.clear();
    });
    (0, vitest_1.it)('should return 401 if API key is missing', async () => {
        const res = await (0, supertest_1.default)(app).post('/webhooks/checkin').send({});
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)('should return 401 if API key is invalid', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/webhooks/checkin')
            .set('x-api-key', 'wrong-key')
            .send({});
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)('should process check-in successfully', async () => {
        // Mock DB responses
        webhook_routes_1.prisma.hotel.findFirst.mockResolvedValue({ id: 'hotel-123' });
        webhook_routes_1.prisma.room.findFirst.mockResolvedValue({ id: 'room-123' });
        webhook_routes_1.prisma.reservation.create.mockResolvedValue({});
        const res = await (0, supertest_1.default)(app)
            .post('/webhooks/checkin')
            .set('x-api-key', 'test-key')
            .send({ roomNumber: '101', guestName: 'John Doe' });
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(webhook_routes_1.prisma.hotel.findFirst).toHaveBeenCalled();
        (0, vitest_1.expect)(webhook_routes_1.prisma.room.findFirst).toHaveBeenCalledWith({
            where: { roomNumber: '101', hotelId: 'hotel-123' }
        });
        (0, vitest_1.expect)(webhook_routes_1.prisma.reservation.create).toHaveBeenCalled();
        // Check if socket was emitted directly to the device
        (0, vitest_1.expect)(mockTo).toHaveBeenCalledWith('device_101');
        (0, vitest_1.expect)(mockEmit).toHaveBeenCalledWith('guest_update', {
            status: 'checked_in',
            guestName: 'John Doe',
            guestTag: undefined
        });
    });
    (0, vitest_1.it)('should process check-out successfully', async () => {
        webhook_routes_1.prisma.hotel.findFirst.mockResolvedValue({ id: 'hotel-123' });
        webhook_routes_1.prisma.room.findFirst.mockResolvedValue({ id: 'room-123' });
        webhook_routes_1.prisma.reservation.findMany.mockResolvedValue([{ id: 'res-123' }]);
        webhook_routes_1.prisma.reservation.update.mockResolvedValue({});
        const res = await (0, supertest_1.default)(app)
            .post('/webhooks/checkout')
            .set('x-api-key', 'test-key')
            .send({ roomNumber: '101' });
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(webhook_routes_1.prisma.reservation.findMany).toHaveBeenCalledWith({
            where: { roomId: 'room-123', status: 'In-House' }
        });
        (0, vitest_1.expect)(webhook_routes_1.prisma.reservation.update).toHaveBeenCalledWith({
            where: { id: 'res-123' },
            data: vitest_1.expect.objectContaining({ status: 'Checked-Out' })
        });
        // Check if socket was emitted directly to the device
        (0, vitest_1.expect)(mockTo).toHaveBeenCalledWith('device_101');
        (0, vitest_1.expect)(mockEmit).toHaveBeenCalledWith('guest_update', {
            status: 'checked_out',
            guestName: null,
            guestTag: null
        });
    });
});
