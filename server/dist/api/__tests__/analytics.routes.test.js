"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const analytics_routes_1 = __importDefault(require("../analytics.routes"));
// Mock the PrismaClient instance that is created inside analytics.routes.ts
const prismaMock = vitest_1.vi.hoisted(() => ({
    usageEvent: {
        create: vitest_1.vi.fn(),
    },
    channel: {
        count: vitest_1.vi.fn(),
        findMany: vitest_1.vi.fn(),
    }
}));
vitest_1.vi.mock('@prisma/client', () => {
    return {
        PrismaClient: class {
            constructor() {
                return prismaMock;
            }
        }
    };
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/api/v1/analytics', analytics_routes_1.default);
(0, vitest_1.describe)('Analytics API Routes', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('POST /api/v1/analytics/events', () => {
        (0, vitest_1.it)('should successfully record a usage event and return 201', async () => {
            const mockEventData = {
                deviceId: 'device-123',
                eventType: 'CHANNEL_WATCH',
                value: { channelId: 'ch-1', name: 'BBC News' },
                durationSeconds: 120,
                roomId: 'room-101',
                guestType: 'VIP'
            };
            const mockCreatedEvent = {
                id: 'event-1',
                hotelId: '123e4567-e89b-12d3-a456-426614174000',
                deviceId: 'device-123',
                eventType: 'CHANNEL_WATCH',
                value: JSON.stringify(mockEventData.value),
                durationSeconds: 120,
                roomId: 'room-101',
                guestType: 'VIP',
                timestamp: new Date()
            };
            prismaMock.usageEvent.create.mockResolvedValue(mockCreatedEvent);
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/analytics/events')
                .send(mockEventData);
            (0, vitest_1.expect)(response.status).toBe(201);
            (0, vitest_1.expect)(response.body.id).toBe('event-1');
            (0, vitest_1.expect)(prismaMock.usageEvent.create).toHaveBeenCalledTimes(1);
            // Verify correct parameters passed to Prisma
            const createCall = prismaMock.usageEvent.create.mock.calls[0][0];
            (0, vitest_1.expect)(createCall.data.deviceId).toBe('device-123');
            (0, vitest_1.expect)(createCall.data.eventType).toBe('CHANNEL_WATCH');
            (0, vitest_1.expect)(createCall.data.durationSeconds).toBe(120);
            (0, vitest_1.expect)(createCall.data.value).toBe(JSON.stringify(mockEventData.value));
        });
        (0, vitest_1.it)('should return 400 Bad Request when deviceId is missing', async () => {
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/analytics/events')
                .send({
                eventType: 'APP_OPEN'
            });
            (0, vitest_1.expect)(response.status).toBe(400);
            (0, vitest_1.expect)(response.body.error).toBe('deviceId and eventType are required');
            (0, vitest_1.expect)(prismaMock.usageEvent.create).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should return 400 Bad Request when eventType is missing', async () => {
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/analytics/events')
                .send({
                deviceId: 'device-123'
            });
            (0, vitest_1.expect)(response.status).toBe(400);
            (0, vitest_1.expect)(response.body.error).toBe('deviceId and eventType are required');
            (0, vitest_1.expect)(prismaMock.usageEvent.create).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle internal server errors and return 500', async () => {
            prismaMock.usageEvent.create.mockRejectedValue(new Error('DB Error'));
            const response = await (0, supertest_1.default)(app)
                .post('/api/v1/analytics/events')
                .send({
                deviceId: 'device-123',
                eventType: 'HARDWARE_METRIC'
            });
            (0, vitest_1.expect)(response.status).toBe(500);
            (0, vitest_1.expect)(response.body.error).toBe('Failed to record event');
        });
    });
});
