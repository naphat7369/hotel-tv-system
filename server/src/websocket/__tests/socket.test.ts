import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { initWebSocket, connectedDevices } from '../socket';

// Mock Socket.io Server & Socket
class MockSocket extends EventEmitter {
  id = 'mock-socket-id';
  rooms = new Set<string>();
  
  join(room: string) {
    this.rooms.add(room);
  }
  
  leave(room: string) {
    this.rooms.delete(room);
  }
}

// We mock 'socket.io' module
vi.mock('socket.io', () => {
  const { EventEmitter } = require('events');
  class MockServer extends EventEmitter {
    toRooms: string[] = [];
    emits: { event: string; args: any[] }[] = [];

    to(room: string) {
      this.toRooms.push(room);
      return this;
    }

    emit(event: string, ...args: any[]) {
      this.emits.push({ event, args });
      super.emit(event, ...args);
      return true;
    }
  }
  return {
    Server: MockServer
  };
});

describe('WebSocket Server Handler', () => {
  let mockHttpServer: any;
  let io: any;

  beforeEach(() => {
    connectedDevices.clear();
    mockHttpServer = {};
    io = initWebSocket(mockHttpServer);
  });

  it('should register a device and emit registered status', () => {
    const socket = new MockSocket();
    
    // Simulate connection
    io.emit('connection', socket);

    // Trigger register_device
    const registerPayload = { deviceId: 'TV-101', roomNumber: '101' };
    let registeredEmitted = false;
    socket.on('registered', (data) => {
      expect(data.status).toBe('success');
      registeredEmitted = true;
    });

    socket.emit('register_device', registerPayload);

    // Verify stored device
    const device = connectedDevices.get('TV-101');
    expect(device).toBeDefined();
    expect(device?.isOnline).toBe(true);
    expect(device?.roomNumber).toBe('101');
    expect(socket.rooms.has('device_TV-101')).toBe(true);
    expect(registeredEmitted).toBe(true);

    // Verify system broadcasted to all and sent network check command to this device
    expect(io.toRooms).toContain('device_TV-101');
    const updateEvent = io.emits.find(e => e.event === 'device_status_update');
    expect(updateEvent).toBeDefined();
  });

  it('should update network status report', () => {
    const socket = new MockSocket();
    io.emit('connection', socket);

    // Register first
    socket.emit('register_device', { deviceId: 'TV-101', roomNumber: '101' });

    // Send status report
    const reportPayload = {
      deviceId: 'TV-101',
      ipAddress: '192.168.1.101',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      wifiSignal: -50
    };

    socket.emit('network_status_report', reportPayload);

    const device = connectedDevices.get('TV-101');
    expect(device?.ipAddress).toBe('192.168.1.101');
    expect(device?.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(device?.wifiSignal).toBe(-50);
  });

  it('should mark device as offline on socket disconnect', () => {
    const socket = new MockSocket();
    io.emit('connection', socket);

    // Register first
    socket.emit('register_device', { deviceId: 'TV-101', roomNumber: '101' });
    expect(connectedDevices.get('TV-101')?.isOnline).toBe(true);

    // Disconnect socket
    socket.emit('disconnect');
    expect(connectedDevices.get('TV-101')?.isOnline).toBe(false);
  });
});
