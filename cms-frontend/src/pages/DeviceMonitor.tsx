import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api, type Device, type DeviceStatus } from '../lib/api';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw } from 'lucide-react';

type SortConfig = {
  key: 'roomNumber' | 'status' | 'ipAddress' | 'lastActive';
  desc: boolean;
};

export default function DeviceMonitor() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDevices, setTotalDevices] = useState(0);
  const limit = 20;
  
  const [filterStatus, setFilterStatus] = useState<DeviceStatus | 'All'>('All');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'roomNumber', desc: false });

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const result = await api.getDevices(page, limit, filterStatus, sortConfig.key, sortConfig.desc);
      setDevices(result.data);
      setTotalPages(result.totalPages);
      setTotalDevices(result.total);
    } catch (error) {
      console.error('Failed to fetch devices', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterStatus, sortConfig]);

  const handleSort = (key: SortConfig['key']) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, desc: !sortConfig.desc });
    } else {
      setSortConfig({ key, desc: false });
    }
    setPage(1); // Reset to page 1 on sort change
  };

  const handleFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value as DeviceStatus | 'All');
    setPage(1); // Reset to page 1 on filter change
  };

  const handleAction = async (id: string, action: 'Restart' | 'Ping') => {
    // In a real app, this would call an API
    console.log(`Action ${action} triggered for device ${id}`);
    alert(`Triggered ${action} for device ${id}`);
  };

  const renderSortIcon = (key: SortConfig['key']) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-4 h-4 inline-block ml-1 opacity-50" />;
    return sortConfig.desc ? <ArrowDown className="w-4 h-4 inline-block ml-1" /> : <ArrowUp className="w-4 h-4 inline-block ml-1" />;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Device Monitor</h2>
          <p className="text-on-surface-variant">Manage and monitor {totalDevices} TV endpoints</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={filterStatus}
            onChange={handleFilter}
            className="bg-surface-container border border-outline-variant rounded p-2 text-sm text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="All">All Statuses</option>
            <option value="Online">Online</option>
            <option value="Offline">Offline</option>
            <option value="Maintenance">Maintenance</option>
          </select>
          <Button variant="outline" size="icon" onClick={fetchDevices} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-surface-container-low">
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-surface-container transition-colors"
                  onClick={() => handleSort('roomNumber')}
                >
                  Room {renderSortIcon('roomNumber')}
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-surface-container transition-colors"
                  onClick={() => handleSort('ipAddress')}
                >
                  IP Address {renderSortIcon('ipAddress')}
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-surface-container transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status {renderSortIcon('status')}
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-surface-container transition-colors"
                  onClick={() => handleSort('lastActive')}
                >
                  Last Active {renderSortIcon('lastActive')}
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">Loading devices...</TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">No devices found.</TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-bold">Room {device.roomNumber}</TableCell>
                    <TableCell className="font-mono text-on-surface-variant">{device.ipAddress}</TableCell>
                    <TableCell>
                      {device.status === 'Online' && <Badge variant="success">Online</Badge>}
                      {device.status === 'Offline' && <Badge variant="error">Offline</Badge>}
                      {device.status === 'Maintenance' && <Badge variant="warning">Maintenance</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-on-surface-variant">
                      {new Date(device.lastActive).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="mr-2" onClick={() => handleAction(device.id, 'Ping')}>Ping</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(device.id, 'Restart')}>Restart</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          <div className="p-4 flex items-center justify-between border-t border-surface-container-high bg-surface-container-low">
            <span className="text-sm text-on-surface-variant">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalDevices)} of {totalDevices} entries
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
