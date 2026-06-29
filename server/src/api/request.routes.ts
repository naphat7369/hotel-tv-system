import { Router, Request, Response } from 'express';

const router = Router();

// Export a getter so other routes (analytics) can read in-memory stats without circular deps
export const getRequestStats = () => ({
  total: mockRequests.length,
  pending: mockRequests.filter(r => r.status === 'PENDING').length,
  inProgress: mockRequests.filter(r => r.status === 'IN_PROGRESS').length,
  completed: mockRequests.filter(r => r.status === 'COMPLETED').length,
});

// In-memory store since Postgres is currently unreachable
let mockRequests: any[] = [
  {
    id: 'req-1',
    hotelId: 'hotel-1',
    roomId: 'room-402',
    requestType: 'HOUSEKEEPING',
    items: [{ id: 'h1', name: 'Fresh Towel', quantity: 2 }],
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    room: { roomNumber: '402' }
  }
];

// GET /api/v1/requests - Fetch all guest requests
router.get('/', (req: Request, res: Response) => {
  res.status(200).json(mockRequests);
});

// POST /api/v1/requests - Create a new guest request (called by TV Portal)
router.post('/', (req: Request, res: Response) => {
  const { hotelId, roomId, requestType, items } = req.body;
  
  const newRequest = {
    id: `req-${Date.now()}`,
    hotelId: hotelId || 'hotel-1',
    roomId: roomId || 'room-402',
    requestType: requestType || 'HOUSEKEEPING',
    items: items || [],
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    room: { roomNumber: roomId ? roomId.replace('room-', '') : '402' }
  };
  
  mockRequests = [newRequest, ...mockRequests];
  res.status(201).json(newRequest);
});

// PATCH /api/v1/requests/:id/status - Update request status
router.patch('/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const requestIndex = mockRequests.findIndex(r => r.id === id);
  if (requestIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }
  
  mockRequests[requestIndex].status = status;
  mockRequests[requestIndex].updatedAt = new Date().toISOString();
  
  res.status(200).json(mockRequests[requestIndex]);
});

export default router;
