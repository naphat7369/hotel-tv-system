import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface Device {
  deviceId: string;
  isOnline: boolean;
  lastSeen: string;
  ipAddress?: string;
  macAddress?: string;
  wifiSignal?: number;
  roomNumber?: string;
  deviceName?: string;
}

export const DeviceManagement = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    // Connect to WebSocket server to receive real-time device updates
    const backendUrl = `http://${window.location.hostname}:3000`;
    const newSocket = io(backendUrl);
    
    newSocket.on('connect', () => {
      console.log('Connected to MDM WebSocket');
    });

    newSocket.on('device_status_update', (updatedDevices: Device[]) => {
      setDevices(updatedDevices);
    });

    // Initial fetch via REST API
    fetch(`${backendUrl}/api/v1/mdm/devices`)
      .then(res => res.json())
      .then(data => setDevices(data))
      .catch(err => console.error('Error fetching initial devices:', err));

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const sendCommand = async (deviceId: string, command: string, payload: any = {}) => {
    setActionLoading(`${deviceId}-${command}`);
    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const response = await fetch(`${backendUrl}/api/v1/mdm/devices/${deviceId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload })
      });
      if (response.ok) {
        // Success
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Failed to send command');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setTimeout(() => setActionLoading(null), 1000); // Visual feedback
    }
  };

  const handleBulkCommand = async (command: string, labelName: string) => {
    const onlineDevices = devices.filter(d => d.isOnline);
    if (onlineDevices.length === 0) {
      alert('No online devices connected to send command.');
      return;
    }

    if (!confirm(`Are you sure you want to send "${labelName}" to ALL ${onlineDevices.length} online devices?`)) {
      return;
    }

    setActionLoading(`bulk-${command}`);
    try {
      await Promise.all(
        onlineDevices.map(d => sendCommand(d.deviceId, command))
      );
      alert(`Sent "${labelName}" to ${onlineDevices.length} devices.`);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter devices based on search term
  const filteredDevices = devices.filter(device => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (device.roomNumber && device.roomNumber.toLowerCase().includes(term)) ||
      (device.deviceId && device.deviceId.toLowerCase().includes(term)) ||
      (device.deviceName && device.deviceName.toLowerCase().includes(term)) ||
      (device.ipAddress && device.ipAddress.toLowerCase().includes(term)) ||
      (device.macAddress && device.macAddress.toLowerCase().includes(term))
    );
  });

  const onlineCount = devices.filter(d => d.isOnline).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-on-surface">Device Management (MDM)</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Remote control and monitor Hotel TVs across the network. (Online: <span className="font-semibold text-green-600">{onlineCount}</span> / Total: {devices.length})
          </p>
        </div>

        {/* Global Bulk Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleBulkCommand('reload_portal', 'Reload UI Total')}
            disabled={onlineCount === 0 || actionLoading === 'bulk-reload_portal'}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <span>🔄 Reload UI Total</span>
          </button>
          <button
            onClick={() => handleBulkCommand('clear_cache', 'Clear Cache Total')}
            disabled={onlineCount === 0 || actionLoading === 'bulk-clear_cache'}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <span>🧹 Clear Cache Total</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6 bg-white p-4 rounded-xl shadow ring-1 ring-black ring-opacity-5 flex items-center gap-3">
        <span className="text-gray-400 text-lg">🔍</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by Room Number, Box Serial, Device Name, IP, or MAC..."
          className="w-full bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 focus:ring-0"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 bg-gray-100 rounded-md"
          >
            Clear
          </button>
        )}
      </div>

      {/* Device Table */}
      <div className="bg-white rounded-xl shadow ring-1 ring-black ring-opacity-5 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Device & Room</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Network Info</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredDevices.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  {searchTerm ? `No devices matching "${searchTerm}"` : 'No devices connected yet.'}
                </td>
              </tr>
            ) : filteredDevices.map((device) => (
              <tr key={device.deviceId}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📺</span>
                    <div>
                      <div className="font-bold text-gray-900">{device.deviceName || device.deviceId}</div>
                      {device.deviceName && (
                        <div className="text-xs text-gray-400">ID: {device.deviceId}</div>
                      )}
                      <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit mt-1">
                        Room: {device.roomNumber || 'Unassigned'}
                      </div>
                      <div className="text-xs text-gray-500 font-normal mt-1">
                        Last Seen: {new Date(device.lastSeen).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${device.isOnline ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/10'}`}>
                    {device.isOnline ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {device.ipAddress ? (
                    <div className="space-y-1">
                      <div>IP: <span className="font-mono text-gray-900">{device.ipAddress}</span></div>
                      <div>MAC: <span className="font-mono text-xs">{device.macAddress}</span></div>
                      <div className="flex items-center gap-1">
                        Signal: 
                        <div className="w-16 h-2 bg-gray-200 rounded overflow-hidden">
                          <div 
                            className={`h-full ${device.wifiSignal && device.wifiSignal > -70 ? 'bg-green-500' : 'bg-yellow-500'}`} 
                            style={{ width: `${Math.max(0, Math.min(100, (device.wifiSignal || -100) + 100))}%` }} 
                          />
                        </div>
                        <span className="text-xs">{device.wifiSignal} dBm</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">Unknown</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  <div className="flex flex-wrap gap-2 max-w-[420px]">
                    <button 
                      onClick={() => sendCommand(device.deviceId, 'get_network_status')}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-xs disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === `${device.deviceId}-get_network_status` ? '...' : 'Refresh Network'}
                    </button>
                    <button 
                      onClick={() => sendCommand(device.deviceId, 'reload_portal')}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium text-xs disabled:opacity-50 transition-colors"
                    >
                      Reload UI
                    </button>
                    <button 
                      onClick={() => sendCommand(device.deviceId, 'clear_cache')}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium text-xs disabled:opacity-50 transition-colors"
                    >
                      Clear Cache
                    </button>
                    
                    <div className="w-full h-px bg-gray-100 my-1" /> {/* Divider */}

                    <button 
                      onClick={() => sendCommand(device.deviceId, 'open_settings')}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-xs disabled:opacity-50 transition-colors"
                      title="Open Android TV Settings"
                    >
                      ⚙️ TV Settings
                    </button>
                    <button 
                      onClick={() => {
                        const newName = prompt('Enter new Cast/Device Name:', device.deviceName || device.deviceId);
                        if (newName) {
                          sendCommand(device.deviceId, 'set_device_name', { name: newName });
                        }
                      }}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-xs disabled:opacity-50 transition-colors"
                      title="Set TV Cast Name"
                    >
                      🏷️ Set Device Name
                    </button>
                    <button 
                      onClick={() => {
                        const newRoom = prompt('Enter Room Number for this TV:', device.roomNumber || '');
                        if (newRoom) {
                          sendCommand(device.deviceId, 'set_room_number', { roomNumber: newRoom });
                        }
                      }}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-pink-50 text-pink-700 hover:bg-pink-100 font-medium text-xs disabled:opacity-50 transition-colors"
                      title="Assign TV to Room"
                    >
                      🔑 Set Room
                    </button>

                    <button 
                      onClick={() => {
                        if (confirm(`Are you sure you want to reboot device ${device.roomNumber ? `Room ${device.roomNumber}` : device.deviceId}?`)) {
                          sendCommand(device.deviceId, 'reboot');
                        }
                      }}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 font-medium text-xs disabled:opacity-50 transition-colors"
                      title="Reboot TV Device"
                    >
                      🔌 Reboot
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeviceManagement;
