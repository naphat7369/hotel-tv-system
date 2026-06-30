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
        alert('Failed to send command');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setTimeout(() => setActionLoading(null), 1000); // Visual feedback
    }
  };

  const handleCheckIn = async (device: Device) => {
    const guestName = prompt('Enter Guest Name:', 'John Doe');
    if (!guestName) return;
    
    const tag = prompt('Enter Guest Tag (Default, VIP, Honeymoon):', 'VIP');
    if (!tag) return;

    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${backendUrl}/api/v1/pms/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: device.roomNumber || '101',
          guestName: guestName,
          guestTag: tag,
          deviceId: device.deviceId,
          ip: device.ipAddress
        })
      });
      if (res.ok) alert('Mock Check-in sent!');
      else alert('Check-in failed');
    } catch (e) {
      alert('Network error');
    }
  };

  const handleCheckOut = async (device: Device) => {
    if (!confirm('Simulate Check-out?')) return;
    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${backendUrl}/api/v1/pms/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: device.roomNumber || '101',
          deviceId: device.deviceId,
          ip: device.ipAddress
        })
      });
      if (res.ok) alert('Mock Check-out sent!');
      else alert('Check-out failed');
    } catch (e) {
      alert('Network error');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-on-surface">Device Management (MDM)</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Remote control and monitor Hotel TVs across the network.</p>
      </div>

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
            {devices.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">No devices connected yet.</td>
              </tr>
            ) : devices.map((device) => (
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
                          {/* Very rough RSSI calculation: -100 is 0%, -50 is 100% */}
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
                  <div className="flex flex-wrap gap-2 max-w-[400px]">
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
                        const newName = prompt('Enter new Cast/Device Name:', device.deviceId);
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

                    <div className="w-full h-px bg-gray-100 my-1" /> {/* Divider */}


                    {/* <button 
                      onClick={() => {
                        if(confirm('Are you sure you want to reboot this device?')) {
                          sendCommand(device.deviceId, 'reboot')
                        }
                      }}
                      disabled={!device.isOnline}
                      className="px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 font-medium text-xs disabled:opacity-50 transition-colors ml-auto"
                    >
                      Reboot
                    </button> */}
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
