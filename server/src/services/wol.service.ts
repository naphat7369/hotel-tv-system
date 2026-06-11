import wol from 'wake_on_lan';
import { connectedDevices } from '../websocket/socket';

/**
 * Sends a Magic Packet to wake up a device via Wake-on-LAN.
 * @param macAddress The MAC address of the target device.
 * @returns Promise that resolves when the packet is sent.
 */
export const wakeDevice = (macAddress: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Basic MAC address validation
    if (!macAddress || macAddress.length < 11) {
      return reject(new Error('Invalid MAC Address'));
    }

    wol.wake(macAddress, (error) => {
      if (error) {
        console.error(`[WoL] Failed to send Magic Packet to ${macAddress}:`, error);
        reject(error);
      } else {
        console.log(`[WoL] Magic Packet sent to ${macAddress}`);
        resolve();
      }
    });
  });
};

/**
 * Attempts to wake up a device by its Device ID using the stored MAC address from WebSocket.
 * @param deviceId The ID of the device.
 * @returns boolean indicating if the attempt was initiated (MAC address found).
 */
export const wakeDeviceById = async (deviceId: string): Promise<boolean> => {
  const device = connectedDevices.get(deviceId);
  
  if (device && device.macAddress) {
    try {
      await wakeDevice(device.macAddress);
      return true;
    } catch (err) {
      console.error(`[WoL] Error waking device ${deviceId}:`, err);
      return false;
    }
  } else {
    console.warn(`[WoL] Cannot wake device ${deviceId}: MAC Address unknown.`);
    return false;
  }
};
