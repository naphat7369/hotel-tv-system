"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const request_routes_1 = __importDefault(require("../request.routes"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/api/v1/requests', request_routes_1.default);
(0, vitest_1.describe)('Request Routes', () => {
    (0, vitest_1.it)('GET /api/v1/requests should return a list of requests', async () => {
        const res = await (0, supertest_1.default)(app)
            .get('/api/v1/requests')
            .expect(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.expect)(res.body.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('id');
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('requestType');
    });
    (0, vitest_1.it)('POST /api/v1/requests should create a new request', async () => {
        const newRequestData = {
            hotelId: 'hotel-123',
            roomId: 'room-101',
            requestType: 'ROOM_SERVICE',
            items: [{ id: 'rs1', name: 'Burger', quantity: 1 }],
        };
        const res = await (0, supertest_1.default)(app)
            .post('/api/v1/requests')
            .send(newRequestData)
            .expect(201);
        (0, vitest_1.expect)(res.body).toHaveProperty('id');
        (0, vitest_1.expect)(res.body.roomId).toBe(newRequestData.roomId);
        (0, vitest_1.expect)(res.body.requestType).toBe(newRequestData.requestType);
        (0, vitest_1.expect)(res.body.status).toBe('PENDING');
    });
    (0, vitest_1.it)('PATCH /api/v1/requests/:id/status should update request status', async () => {
        // First, let's get the list to find a valid ID
        const listRes = await (0, supertest_1.default)(app).get('/api/v1/requests');
        const existingId = listRes.body[0].id;
        const updateRes = await (0, supertest_1.default)(app)
            .patch(`/api/v1/requests/${existingId}/status`)
            .send({ status: 'COMPLETED' })
            .expect(200);
        (0, vitest_1.expect)(updateRes.body.id).toBe(existingId);
        (0, vitest_1.expect)(updateRes.body.status).toBe('COMPLETED');
    });
    (0, vitest_1.it)('PATCH /api/v1/requests/:id/status should return 404 for non-existent ID', async () => {
        await (0, supertest_1.default)(app)
            .patch('/api/v1/requests/non-existent-id/status')
            .send({ status: 'COMPLETED' })
            .expect(404);
    });
});
