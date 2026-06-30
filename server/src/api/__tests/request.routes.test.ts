import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import requestRoutes from '../request.routes';

const app = express();
app.use(express.json());
app.use('/api/v1/requests', requestRoutes);

describe('Request Routes', () => {
  it('GET /api/v1/requests should return a list of requests', async () => {
    const res = await request(app)
      .get('/api/v1/requests')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('requestType');
  });

  it('POST /api/v1/requests should create a new request', async () => {
    const newRequestData = {
      hotelId: 'hotel-123',
      roomId: 'room-101',
      requestType: 'ROOM_SERVICE',
      items: [{ id: 'rs1', name: 'Burger', quantity: 1 }],
    };

    const res = await request(app)
      .post('/api/v1/requests')
      .send(newRequestData)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.roomId).toBe(newRequestData.roomId);
    expect(res.body.requestType).toBe(newRequestData.requestType);
    expect(res.body.status).toBe('PENDING');
  });

  it('PATCH /api/v1/requests/:id/status should update request status', async () => {
    // First, let's get the list to find a valid ID
    const listRes = await request(app).get('/api/v1/requests');
    const existingId = listRes.body[0].id;

    const updateRes = await request(app)
      .patch(`/api/v1/requests/${existingId}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(updateRes.body.id).toBe(existingId);
    expect(updateRes.body.status).toBe('COMPLETED');
  });

  it('PATCH /api/v1/requests/:id/status should return 404 for non-existent ID', async () => {
    await request(app)
      .patch('/api/v1/requests/non-existent-id/status')
      .send({ status: 'COMPLETED' })
      .expect(404);
  });
});
