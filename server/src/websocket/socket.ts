import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

export interface DeviceStatus {
  deviceId: string;
  isOnline: boolean;
  lastSeen: string;
  ipAddress?: string;
  macAddress?: string;
  wifiSignal?: number;
  socketId?: string;
}

// In-memory store for connected devices
export const connectedDevices = new Map<string, DeviceStatus>();

// Function to update the CMS about device status changes
const broadcastDeviceList = (io: Server) => {
  const devicesList = Array.from(connectedDevices.values());
  io.emit('device_status_update', devicesList);
};

export const initWebSocket = (server: HttpServer) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development only
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);
    
    // We attach the deviceId to the socket for easy lookup on disconnect
    let currentDeviceId: string | null = null;

    // Device Handshake
    socket.on('register_device', (data) => {
      const deviceId = data.deviceId;
      if (!deviceId) return;
      
      currentDeviceId = deviceId;
      console.log(`[WebSocket] Device registered: ${deviceId}`);
      socket.join(`device_${deviceId}`);
      
      const existingDevice = connectedDevices.get(deviceId) || {};
      
      // Update store but preserve existing properties like ipAddress
      connectedDevices.set(deviceId, {
        ...existingDevice,
        deviceId,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        socketId: socket.id
      });
      
      broadcastDeviceList(io);
      socket.emit('registered', { status: 'success' });
    });

    // Handle Heartbeat
    socket.on('heartbeat', (data) => {
      const deviceId = data.deviceId;
      if (!deviceId) return;
      
      const existing = connectedDevices.get(deviceId);
      connectedDevices.set(deviceId, {
        ...existing,
        deviceId,
        isOnline: true,
        lastSeen: new Date().toISOString()
      });
      
      // We don't broadcast on every heartbeat to save bandwidth, 
      // but the server knows it's online.
    });

    // Handle Network Status Report
    socket.on('network_status_report', (data) => {
      const deviceId = data.deviceId;
      if (!deviceId) return;
      
      const existing = connectedDevices.get(deviceId);
      connectedDevices.set(deviceId, {
        ...existing,
        deviceId,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        ipAddress: data.ipAddress,
        macAddress: data.macAddress,
        wifiSignal: data.wifiSignal
      });
      
      console.log(`[WebSocket] Network report from ${deviceId}: IP=${data.ipAddress}`);
      broadcastDeviceList(io);
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      if (currentDeviceId) {
        const existing = connectedDevices.get(currentDeviceId);
        if (existing && existing.socketId === socket.id) {
          existing.isOnline = false;
          existing.lastSeen = new Date().toISOString();
          connectedDevices.set(currentDeviceId, existing);
          broadcastDeviceList(io);
        } else if (existing) {
          console.log(`[WebSocket] Ignored stale disconnect for ${currentDeviceId}`);
        }
      }
    });
  });

  return io;
};
