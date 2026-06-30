"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wakeDeviceById = exports.wakeDevice = void 0;
const wake_on_lan_1 = __importDefault(require("wake_on_lan"));
const socket_1 = require("../websocket/socket");
/**
 * Sends a Magic Packet to wake up a device via Wake-on-LAN.
 * @param macAddress The MAC address of the target device.
 * @returns Promise that resolves when the packet is sent.
 */
const wakeDevice = (macAddress) => {
    return new Promise((resolve, reject) => {
        // Basic MAC address validation
        if (!macAddress || macAddress.length < 11) {
            return reject(new Error('Invalid MAC Address'));
        }
        wake_on_lan_1.default.wake(macAddress, (error) => {
            if (error) {
                console.error(`[WoL] Failed to send Magic Packet to ${macAddress}:`, error);
                reject(error);
            }
            else {
                console.log(`[WoL] Magic Packet sent to ${macAddress}`);
                resolve();
            }
        });
    });
};
exports.wakeDevice = wakeDevice;
/**
 * Attempts to wake up a device by its Device ID using the stored MAC address from WebSocket.
 * @param deviceId The ID of the device.
 * @returns boolean indicating if the attempt was initiated (MAC address found).
 */
const wakeDeviceById = async (deviceId) => {
    const device = socket_1.connectedDevices.get(deviceId);
    if (device && device.macAddress) {
        try {
            await (0, exports.wakeDevice)(device.macAddress);
            return true;
        }
        catch (err) {
            console.error(`[WoL] Error waking device ${deviceId}:`, err);
            return false;
        }
    }
    else {
        console.warn(`[WoL] Cannot wake device ${deviceId}: MAC Address unknown.`);
        return false;
    }
};
exports.wakeDeviceById = wakeDeviceById;
