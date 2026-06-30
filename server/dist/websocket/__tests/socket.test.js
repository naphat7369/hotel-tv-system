"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const events_1 = require("events");
const socket_1 = require("../socket");
// Mock Socket.io Server & Socket
class MockSocket extends events_1.EventEmitter {
    id = 'mock-socket-id';
    rooms = new Set();
    join(room) {
        this.rooms.add(room);
    }
    leave(room) {
        this.rooms.delete(room);
    }
}
// We mock 'socket.io' module
vitest_1.vi.mock('socket.io', () => {
    const { EventEmitter } = require('events');
    class MockServer extends EventEmitter {
        toRooms = [];
        emits = [];
        to(room) {
            this.toRooms.push(room);
            return this;
        }
        emit(event, ...args) {
            this.emits.push({ event, args });
            super.emit(event, ...args);
            return true;
        }
    }
    return {
        Server: MockServer
    };
});
(0, vitest_1.describe)('WebSocket Server Handler', () => {
    let mockHttpServer;
    let io;
    (0, vitest_1.beforeEach)(() => {
        socket_1.connectedDevices.clear();
        mockHttpServer = {};
        io = (0, socket_1.initWebSocket)(mockHttpServer);
    });
    (0, vitest_1.it)('should register a device and emit registered status', () => {
        const socket = new MockSocket();
        // Simulate connection
        io.emit('connection', socket);
        // Trigger register_device
        const registerPayload = { deviceId: 'TV-101', roomNumber: '101' };
        let registeredEmitted = false;
        socket.on('registered', (data) => {
            (0, vitest_1.expect)(data.status).toBe('success');
            registeredEmitted = true;
        });
        socket.emit('register_device', registerPayload);
        // Verify stored device
        const device = socket_1.connectedDevices.get('TV-101');
        (0, vitest_1.expect)(device).toBeDefined();
        (0, vitest_1.expect)(device?.isOnline).toBe(true);
        (0, vitest_1.expect)(device?.roomNumber).toBe('101');
        (0, vitest_1.expect)(socket.rooms.has('device_TV-101')).toBe(true);
        (0, vitest_1.expect)(registeredEmitted).toBe(true);
        // Verify system broadcasted to all and sent network check command to this device
        (0, vitest_1.expect)(io.toRooms).toContain('device_TV-101');
        const updateEvent = io.emits.find(e => e.event === 'device_status_update');
        (0, vitest_1.expect)(updateEvent).toBeDefined();
    });
    (0, vitest_1.it)('should update network status report', () => {
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
        const device = socket_1.connectedDevices.get('TV-101');
        (0, vitest_1.expect)(device?.ipAddress).toBe('192.168.1.101');
        (0, vitest_1.expect)(device?.macAddress).toBe('AA:BB:CC:DD:EE:FF');
        (0, vitest_1.expect)(device?.wifiSignal).toBe(-50);
    });
    (0, vitest_1.it)('should mark device as offline on socket disconnect', () => {
        const socket = new MockSocket();
        io.emit('connection', socket);
        // Register first
        socket.emit('register_device', { deviceId: 'TV-101', roomNumber: '101' });
        (0, vitest_1.expect)(socket_1.connectedDevices.get('TV-101')?.isOnline).toBe(true);
        // Disconnect socket
        socket.emit('disconnect');
        (0, vitest_1.expect)(socket_1.connectedDevices.get('TV-101')?.isOnline).toBe(false);
    });
});
