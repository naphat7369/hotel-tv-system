import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { exec } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { clearGuestApps, pendingClearRooms } from '../services/adb.service';
import { addUsageEventToStream } from '../lib/redis';
import { normalizeEvent } from '../lib/analytics-normalizer';
import { logDeviceEvent } from '../services/device-log.service';
import { IncidentService } from '../services/incident.service';

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
        isOnline: inMemory ? inMemory.isOnline : dbDevice.isOnline,
        lastSeen: inMemory?.lastSeen || (dbDevice.lastSeen ? dbDevice.lastSeen.toISOString() : null),
        ipAddress: inMemory?.ipAddress || dbDevice.ipAddress || undefined,
        macAddress: inMemory?.macAddress || dbDevice.macAddress || undefined,
        wifiSignal: inMemory?.wifiSignal,
        socketId: inMemory?.socketId,
        roomNumber: inMemory?.roomNumber || dbDevice.room?.roomNumber || undefined,
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

const scheduleDeviceVerification = (
  deviceIdToDisconnect: string,
  ipToPing: string | undefined,
  expectedSocketId: string | undefined,
  io: Server,
  initialDelayMs = 15000
) => {
  const existingTimer = disconnectTimers.get(deviceIdToDisconnect);
  if (existingTimer) {
    clearTimeout(existingTimer);
    disconnectTimers.delete(deviceIdToDisconnect);
  }

  const verifyStatus = async () => {
    const check = connectedDevices.get(deviceIdToDisconnect);
    // Only proceed if it hasn't successfully reconnected with a new socketId
    if (check && check.isOnline && (check.socketId === expectedSocketId || check.socketId === undefined)) {
      if (ipToPing) {
        if (await checkDeviceAlive(ipToPing)) {
          // Device is alive (likely streaming an app) -> clear socketId so we know it's disconnected but keep online
          check.socketId = undefined;
          connectedDevices.set(deviceIdToDisconnect, check);
          const nextTimer = setTimeout(verifyStatus, 3 * 60 * 1000); // Check every 3 mins while alive
          disconnectTimers.set(deviceIdToDisconnect, nextTimer);
        } else {
          // Device is completely offline (ping failed) -> mark offline and STOP checking
          check.isOnline = false;
          check.lastSeen = new Date().toISOString();
          connectedDevices.set(deviceIdToDisconnect, check);
          disconnectTimers.delete(deviceIdToDisconnect);

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
            disconnectTimers.delete(deviceIdToDisconnect);

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

  const timer = setTimeout(verifyStatus, initialDelayMs);
  disconnectTimers.set(deviceIdToDisconnect, timer);
};

export const initWebSocket = (server: HttpServer) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development only
      methods: ['GET', 'POST']
    }
  });

  // On server startup, hydrate devices that were marked online in DB so boxes without
  // an active WebSocket (e.g. streaming an external app across a server reload) are still monitored via ping.
  prisma.device.findMany({
    where: { isOnline: true },
    include: { room: true }
  }).then((onlineDbDevices) => {
    for (const dbDevice of onlineDbDevices) {
      if (!connectedDevices.has(dbDevice.boxSerial)) {
        connectedDevices.set(dbDevice.boxSerial, {
          deviceId: dbDevice.boxSerial,
          isOnline: true,
          lastSeen: dbDevice.lastSeen ? dbDevice.lastSeen.toISOString() : new Date().toISOString(),
          ipAddress: dbDevice.ipAddress || undefined,
          macAddress: dbDevice.macAddress || undefined,
          roomNumber: dbDevice.room?.roomNumber || 'Unassigned',
          socketId: undefined
        });
        scheduleDeviceVerification(
          dbDevice.boxSerial,
          dbDevice.ipAddress || undefined,
          undefined,
          io,
          30000
        );
      }
    }
  }).catch(() => {});

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
      const pendingTimer = disconnectTimers.get(deviceId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(deviceId);
      }
      const existingDevice: Partial<DeviceStatus> = connectedDevices.get(deviceId) || {};

      // Prevent multiple tabs or native background sockets from wiping out a valid room number with 'Unassigned'
      if (roomNumber === 'Unassigned' && existingDevice.roomNumber && existingDevice.roomNumber !== 'Unassigned') {
        roomNumber = existingDevice.roomNumber;
      }

      socket.join(`device_${deviceId}`);
      
      // Sync to Database & recover room assignment if client sent 'Unassigned'
      try {
        let roomId: string | null = null;
        const existingDbDevice = await prisma.device.findUnique({
          where: { boxSerial: deviceId },
          include: { room: true }
        });

        if (roomNumber !== 'Unassigned') {
          const room = await prisma.room.findFirst({
            where: { roomNumber: String(roomNumber), hotelId: MOCK_HOTEL_ID }
          });
          if (room) roomId = room.id;
        } else if (existingDbDevice?.room?.roomNumber) {
          roomId = existingDbDevice.roomId;
          roomNumber = existingDbDevice.room.roomNumber;
        }

        const resolvedIp = existingDevice.ipAddress || existingDbDevice?.ipAddress || undefined;
        const resolvedMac = existingDevice.macAddress || existingDbDevice?.macAddress || undefined;

        console.log(`[WebSocket] Device registered: ${deviceId} (Room: ${roomNumber})`);

        // Update store while preserving existing properties like ipAddress and recovered roomNumber
        connectedDevices.set(deviceId, {
          ...existingDevice,
          deviceId,
          isOnline: true,
          lastSeen: new Date().toISOString(),
          socketId: socket.id,
          roomNumber,
          ipAddress: resolvedIp,
          macAddress: resolvedMac
        });

        const dbDevice = await prisma.device.upsert({
          where: { boxSerial: deviceId },
          update: {
            isOnline: true,
            lastSeen: new Date(),
            ...(roomId !== null ? { roomId } : {}),
            ipAddress: resolvedIp,
            macAddress: resolvedMac
          },
          create: {
            boxSerial: deviceId,
            hotelId: MOCK_HOTEL_ID,
            isOnline: true,
            lastSeen: new Date(),
            roomId: roomId,
            ipAddress: resolvedIp,
            macAddress: resolvedMac
          }
        });

        // Cache session context on socket instance for zero-DB event ingestion
        socket.data.roomUuid = roomId;
        socket.data.deviceUuid = dbDevice.id;
        socket.data.hotelId = MOCK_HOTEL_ID;
        socket.data.boxSerial = deviceId;
      } catch (dbErr) {
        console.error('[WebSocket] Failed to upsert device in DB:', dbErr);
        console.log(`[WebSocket] Device registered (fallback): ${deviceId} (Room: ${roomNumber})`);
        connectedDevices.set(deviceId, {
          ...existingDevice,
          deviceId,
          isOnline: true,
          lastSeen: new Date().toISOString(),
          socketId: socket.id,
          roomNumber
        });
      }

      broadcastDeviceList(io);
      socket.emit('registered', {
        status: 'success',
        ...(process.env.FORCE_PORTAL_RELOAD_ON_BOOT === 'true' ? { bootId: SERVER_BOOT_ID } : {})
      });
      
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
                // Only auto-clear if an explicit checkout occurred while the TV was offline
                if (pendingClearRooms.has(String(roomNumber))) {
                  const currentDevice = connectedDevices.get(deviceId);
                  if (currentDevice && currentDevice.ipAddress) {
                    pendingClearRooms.delete(String(roomNumber));
                    console.log(`[WebSocket] TV connected with pending checkout for Room ${roomNumber}. Initiating auto-clear for ${currentDevice.ipAddress}`);
                    clearGuestApps(currentDevice.ipAddress).catch(err => console.error('[WebSocket] Auto-clear failed:', err));
                  }
                }
              }
            }).catch(err => console.error('[WebSocket] Error fetching reservation:', err));
          }
        }).catch(err => console.error('[WebSocket] Error fetching room:', err));
      }

      // Fetch currently active broadcasts and send to newly connected device
      prisma.activeBroadcast.findFirst({
        where: {
          hotelId: MOCK_HOTEL_ID,
          isActive: true,
          OR: [
            { startTime: null },
            { startTime: { lte: new Date() } }
          ],
          AND: [
            { OR: [{ endTime: null }, { endTime: { gt: new Date() } }] }
          ]
        },
        orderBy: { createdAt: 'desc' }
      }).then((activeBroadcast) => {
        if (activeBroadcast) {
           const eventName = activeBroadcast.type === 'alert' ? 'show_modal' : 'show_marquee';
           // Check targeting
           let shouldSend = true;
           if (activeBroadcast.target === 'room' && activeBroadcast.targetRoom !== String(roomNumber)) {
             shouldSend = false;
           }
           if (shouldSend) {
             socket.emit(eventName, {
               id: activeBroadcast.id,
               message: activeBroadcast.message,
               type: activeBroadcast.type
             });
           }
        }
      }).catch(err => console.error('[WebSocket] Error fetching active broadcast:', err));
    });


    // ── Analytics via WebSocket ───────────────────────────────────────────
    // The TV frontend emits 'track_event' instead of HTTP POST /analytics/events
    // This is more reliable on Android TV WebViews which can drop HTTP requests
    // when navigation happens immediately after (e.g. launchApp is called).
    socket.on('track_event', async (data) => {
      if (!data) return;

      try {
        const session = {
          hotelId: socket.data?.hotelId || MOCK_HOTEL_ID,
          roomUuid: socket.data?.roomUuid,
          deviceUuid: socket.data?.deviceUuid
        };

        const normalized = normalizeEvent(data, session);
        if (!normalized) return;

        await addUsageEventToStream(normalized);
      } catch (err: any) {
        console.error('[Analytics/WS] Error buffering event to Redis stream:', err.message);
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

      try {
        if (IncidentService.isEnabled()) {
          IncidentService.recordDeviceHeartbeat(deviceId, existing?.roomNumber);
        }
      } catch {
        // Non-blocking fire-and-forget guard
      }
      
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

    // Handle Device Logs (Errors, Warnings, Debug from TV box / Frontend)
    socket.on('device_log', (data) => {
      if (!data) return;
      const deviceId = data.deviceId || currentDeviceId || socket.data?.boxSerial || 'UnknownBox';
      const existing = connectedDevices.get(deviceId);
      const roomNumber = data.roomNumber || existing?.roomNumber || 'Unassigned';
      const ipAddress = data.ipAddress || existing?.ipAddress;

      logDeviceEvent({
        ...data,
        deviceId,
        roomNumber,
        ipAddress
      });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      if (currentDeviceId) {
        const deviceIdToDisconnect = currentDeviceId;
        const existing = connectedDevices.get(deviceIdToDisconnect);
        if (existing && existing.socketId === socket.id) {
          scheduleDeviceVerification(
            deviceIdToDisconnect,
            existing.ipAddress,
            socket.id,
            io,
            15000
          );
        } else if (existing) {
          console.log(`[WebSocket] Ignored stale disconnect for ${deviceIdToDisconnect}`);
        }
      }
    });
  });

  return io;
};
