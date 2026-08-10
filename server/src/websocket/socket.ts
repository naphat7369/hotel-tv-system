import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { exec } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { clearGuestApps } from '../services/adb.service';

const prisma = new PrismaClient();
const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';
const SERVER_BOOT_ID = Date.now().toString();

const checkDeviceAlive = (ip: string): Promise<boolean> => {
  return new Promise((resolve) => {
    // Send 3 packets, wait 1s max for each. Exits with 0 if AT LEAST ONE packet is received.
    exec(`ping -c 3 -W 1 ${ip}`, (error) => {
      resolve(!error);
    });
  });
};

export interface DeviceStatus {
  deviceId: string;
  isOnline: boolean;
  lastSeen: string;
  ipAddress?: string;
  macAddress?: string;
  wifiSignal?: number;
  socketId?: string;
  roomNumber?: string;
  deviceName?: string;
}

// In-memory store for connected devices
export const connectedDevices = new Map<string, DeviceStatus>();

// Function to update the CMS about device status changes
const broadcastDeviceList = async (io: Server) => {
  try {
    const dbDevices = await prisma.device.findMany({
      include: { room: true },
      orderBy: { registeredAt: 'desc' }
    });
    const devicesList = dbDevices.map(dbDevice => {
      const inMemory = connectedDevices.get(dbDevice.boxSerial);
      return {
        deviceId: dbDevice.boxSerial,
        isOnline: dbDevice.isOnline,
        lastSeen: dbDevice.lastSeen ? dbDevice.lastSeen.toISOString() : null,
        ipAddress: dbDevice.ipAddress || undefined,
        macAddress: dbDevice.macAddress || undefined,
        wifiSignal: inMemory?.wifiSignal,
        socketId: inMemory?.socketId,
        roomNumber: dbDevice.room?.roomNumber || undefined,
        deviceName: inMemory?.deviceName
      };
    });
    io.emit('device_status_update', devicesList);
  } catch (err) {
    console.error('[WebSocket] Error broadcasting device list:', err);
  }
};

// Map to hold disconnect timeout timers for grace period
const disconnectTimers = new Map<string, NodeJS.Timeout>();

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
    socket.on('register_device', async (data) => {
      const deviceId = data.deviceId;
      let roomNumber = data.roomNumber || 'Unassigned';
      if (!deviceId) return;
      
      currentDeviceId = deviceId;
      const existingDevice: Partial<DeviceStatus> = connectedDevices.get(deviceId) || {};

      // Prevent multiple tabs from wiping out a valid room number with 'Unassigned'
      if (roomNumber === 'Unassigned' && existingDevice.roomNumber && existingDevice.roomNumber !== 'Unassigned') {
        roomNumber = existingDevice.roomNumber;
      }

      console.log(`[WebSocket] Device registered: ${deviceId} (Room: ${roomNumber})`);
      socket.join(`device_${deviceId}`);
      
      // Update store but preserve existing properties like ipAddress
      connectedDevices.set(deviceId, {
        ...existingDevice,
        deviceId,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        socketId: socket.id,
        roomNumber
      });
      
      // Sync to Database
      try {
        let roomId: string | null = null;
        if (roomNumber !== 'Unassigned') {
          const room = await prisma.room.findFirst({
            where: { roomNumber: String(roomNumber), hotelId: MOCK_HOTEL_ID }
          });
          if (room) roomId = room.id;
        }

        await prisma.device.upsert({
          where: { boxSerial: deviceId },
          update: {
            isOnline: true,
            lastSeen: new Date(),
            roomId: roomId,
            ipAddress: existingDevice.ipAddress || undefined,
            macAddress: existingDevice.macAddress || undefined
          },
          create: {
            boxSerial: deviceId,
            hotelId: MOCK_HOTEL_ID,
            isOnline: true,
            lastSeen: new Date(),
            roomId: roomId,
            ipAddress: existingDevice.ipAddress || undefined,
            macAddress: existingDevice.macAddress || undefined
          }
        });
      } catch (dbErr) {
        console.error('[WebSocket] Failed to upsert device in DB:', dbErr);
      }

      broadcastDeviceList(io);
      socket.emit('registered', { status: 'success', bootId: SERVER_BOOT_ID });
      
      // Automatically request network status upon registration so CMS populates immediately
      io.to(`device_${deviceId}`).emit('mdm_command', { command: 'get_network_status', payload: {} });

      // Fetch active guest data for this room and send it to the TV
      if (roomNumber !== 'Unassigned') {
        prisma.room.findFirst({
          where: { roomNumber: String(roomNumber), hotelId: MOCK_HOTEL_ID }
        }).then((room) => {
          if (room) {
            prisma.reservation.findFirst({
              where: { roomId: room.id, status: 'In-House' },
              orderBy: { createdAt: 'desc' }
            }).then((reservation) => {
              if (reservation && (!reservation.checkOut || new Date() < reservation.checkOut)) {
                socket.emit('guest_update', {
                  status: 'checked_in',
                  guestName: reservation.guestFirstName,
                  guestTag: reservation.guestLoyaltyTier
                });
              } else {
                socket.emit('guest_update', {
                  status: 'checked_out',
                  guestName: null,
                  guestTag: null
                });
                // Trigger auto-clear for vacant/checked-out rooms when TV boots up
                const currentDevice = connectedDevices.get(deviceId);
                if (currentDevice && currentDevice.ipAddress) {
                  console.log(`[WebSocket] TV Booted in checked-out state. Initiating auto-clear for ${currentDevice.ipAddress}`);
                  clearGuestApps(currentDevice.ipAddress).catch(err => console.error('[WebSocket] Auto-clear failed:', err));
                }
              }
            }).catch(err => console.error('[WebSocket] Error fetching reservation:', err));
          }
        }).catch(err => console.error('[WebSocket] Error fetching room:', err));
      }
    });


    // ── Analytics via WebSocket ───────────────────────────────────────────
    // The TV frontend emits 'track_event' instead of HTTP POST /analytics/events
    // This is more reliable on Android TV WebViews which can drop HTTP requests
    // when navigation happens immediately after (e.g. launchApp is called).
    socket.on('track_event', async (data) => {
      const { deviceId, roomId, eventType, value, durationSeconds } = data;
      if (!deviceId || !eventType) return;

      // Do NOT track Hotel TV system itself in app metrics
      if (eventType === 'APP_OPEN' || eventType === 'APP_WATCH_DURATION') {
        if (value) {
          const appName = String(value.appName || '');
          const pkgName = String(value.packageName || '');
          if (pkgName === 'com.hotel.tvapp' || appName.toLowerCase().includes('hotel tv')) {
            console.log(`[Analytics/WS] Ignored event for Hotel TV system (${eventType})`);
            return;
          }
        }
      }

      console.log(`[Analytics/WS] ${deviceId} → ${eventType}`);

      try {
        // Resolve roomId (room number string like "2003") to the UUID
        let actualRoomId: string | null = null;
        if (roomId) {
          const room = await prisma.room.findFirst({
            where: { roomNumber: String(roomId), hotelId: MOCK_HOTEL_ID }
          });
          if (room) actualRoomId = room.id;
        }

        // Resolve deviceId (boxSerial like "BOX-101-A") to the Device UUID
        // The FK on usage_events.device_id references devices.id (UUID), not box_serial
        let actualDeviceId: string | null = null;
        const device = await prisma.device.findUnique({ where: { boxSerial: deviceId } });
        if (device) {
          actualDeviceId = device.id;
        } else {
          console.warn(`[Analytics/WS] Device not found for boxSerial=${deviceId}, saving event without device link.`);
        }

        await prisma.usageEvent.create({
          data: {
            hotelId: MOCK_HOTEL_ID,
            deviceId: actualDeviceId,
            eventType,
            value: value ? JSON.stringify(value) : null,
            durationSeconds: durationSeconds ? parseInt(String(durationSeconds), 10) : null,
            roomId: actualRoomId,
          }
        });

        console.log(`[Analytics/WS] ✓ Saved ${eventType} for device ${deviceId}`);
      } catch (err) {
        console.error(`[Analytics/WS] ✗ Failed to save ${eventType}:`, err);
      }
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
    socket.on('network_status_report', async (data) => {
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
      
      try {
        await prisma.device.update({
          where: { boxSerial: deviceId },
          data: {
            ipAddress: data.ipAddress,
            macAddress: data.macAddress,
            isOnline: true,
            lastSeen: new Date()
          }
        });
      } catch (dbErr) { }

      console.log(`[WebSocket] Network report from ${deviceId}: IP=${data.ipAddress}`);
      broadcastDeviceList(io);
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      if (currentDeviceId) {
        const deviceIdToDisconnect = currentDeviceId;
        const existing = connectedDevices.get(deviceIdToDisconnect);
        if (existing && existing.socketId === socket.id) {
          const ipToPing = existing.ipAddress;
          
          const verifyStatus = async () => {
            const check = connectedDevices.get(deviceIdToDisconnect);
            // Only proceed if it hasn't successfully reconnected with a new socketId
            if (check && (check.socketId === socket.id || check.socketId === undefined)) {
              if (ipToPing) {
                if (await checkDeviceAlive(ipToPing)) {
                  // Device is alive (likely streaming an app) -> clear socketId so we know it's disconnected but keep online
                  check.socketId = undefined;
                  connectedDevices.set(deviceIdToDisconnect, check);
                  const nextTimer = setTimeout(verifyStatus, 3 * 60 * 1000); // Check every 3 mins
                  disconnectTimers.set(deviceIdToDisconnect, nextTimer);
                } else {
                  // Device is completely offline (ping failed)
                  check.isOnline = false;
                  check.lastSeen = new Date().toISOString();
                  connectedDevices.set(deviceIdToDisconnect, check);

                  prisma.device.update({
                    where: { boxSerial: deviceIdToDisconnect },
                    data: { isOnline: false, lastSeen: new Date() }
                  }).catch(() => {});

                  broadcastDeviceList(io);
                  console.log(`[WebSocket] Device ${deviceIdToDisconnect} marked offline (Ping failed).`);
                }
              } else {
                 // No IP address known (e.g. testing in browser or native app not responding).
                 // We can't ping, so we just give it a blind 2 hour grace period.
                 check.socketId = undefined;
                 connectedDevices.set(deviceIdToDisconnect, check);
                 const nextTimer = setTimeout(() => {
                   const finalCheck = connectedDevices.get(deviceIdToDisconnect);
                   if (finalCheck && finalCheck.socketId === undefined) {
                      finalCheck.isOnline = false;
                      finalCheck.lastSeen = new Date().toISOString();
                      connectedDevices.set(deviceIdToDisconnect, finalCheck);

                      prisma.device.update({
                        where: { boxSerial: deviceIdToDisconnect },
                        data: { isOnline: false, lastSeen: new Date() }
                      }).catch(() => {});

                      broadcastDeviceList(io);
                      console.log(`[WebSocket] Device ${deviceIdToDisconnect} marked offline (Grace period expired).`);
                   }
                 }, 2 * 60 * 60 * 1000); // 2 hours
                 disconnectTimers.set(deviceIdToDisconnect, nextTimer);
              }
            }
          };

          // Start the verification process after 15 seconds to allow for short network blips
          const timer = setTimeout(verifyStatus, 15000); 
          disconnectTimers.set(deviceIdToDisconnect, timer);
        } else if (existing) {
          console.log(`[WebSocket] Ignored stale disconnect for ${deviceIdToDisconnect}`);
        }
      }
    });
  });

  return io;
};
