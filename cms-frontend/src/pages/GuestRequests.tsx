import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { RefreshCw, CheckCircle, Clock } from 'lucide-react';

interface RequestItem {
  id: string;
  name: string;
  quantity: number;
}

interface GuestRequest {
  id: string;
  roomId: string;
  requestType: string;
  items: RequestItem[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  room?: { roomNumber: string };
}

function GuestRequests() {
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://${window.location.hostname}:3000/api/v1/requests`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (e) {
      console.error('Error fetching requests', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Poll every 10 seconds
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const response = await fetch(`http://${window.location.hostname}:3000/api/v1/requests/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (response.ok) {
        setRequests(prev => prev.map(req => 
          req.id === id ? { ...req, status: newStatus as any } : req
        ));
      }
    } catch (e) {
      console.error('Error updating status', e);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="error" className="animate-pulse">Pending</Badge>;
      case 'IN_PROGRESS': return <Badge variant="warning">In Progress</Badge>;
      case 'COMPLETED': return <Badge variant="success">Completed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Guest Requests</h2>
          <p className="text-on-surface-variant">Live feed of housekeeping and room requests</p>
        </div>
        <Button onClick={fetchRequests} variant="outline" size="icon" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      <Card>
        <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
          <CardTitle>Incoming Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Requested Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">
                    {loading ? 'Loading requests...' : 'No active requests at the moment.'}
                  </TableCell>
                </TableRow>
              ) : (
                requests.map(req => (
                  <TableRow key={req.id} className={req.status === 'COMPLETED' ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-on-surface-variant" />
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-lg text-primary">
                      {req.room?.roomNumber || req.roomId}
                    </TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside">
                        {req.items.map((item, idx) => (
                          <li key={idx}>
                            <span className="font-medium">{item.quantity}x</span> {item.name}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell className="text-right">
                      {req.status === 'PENDING' && (
                        <Button size="sm" onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}>
                          Start Processing
                        </Button>
                      )}
                      {req.status === 'IN_PROGRESS' && (
                        <Button size="sm" variant="secondary" className="bg-success text-on-success" onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}>
                          <CheckCircle className="w-4 h-4 mr-2" /> Mark Done
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default GuestRequests;
