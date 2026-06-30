import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set up mock for child_process
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: (cmd: string, options: any, callback: any) => {
    // If options is omitted and callback is the second argument
    const cb = typeof options === 'function' ? options : callback;
    mockExec(cmd, options);
    
    // Simulate successful command output
    if (cmd.includes('pm list packages -3')) {
      cb(null, { stdout: 'package:com.netflix.ninja\npackage:com.spotify.music\n' });
    } else if (cmd.includes('pm list packages')) {
      cb(null, { stdout: 'package:com.netflix.ninja\npackage:com.hotel.tvapp\npackage:com.google.android.youtube.tv\n' });
    } else {
      cb(null, { stdout: 'success' });
    }
  }
}));

import { connectAdb, clearGuestApps, rebootDevice, wakeUpDevice, setDeviceName } from '../adb.service';

describe('ADB Service', () => {
  beforeEach(() => {
    mockExec.mockClear();
  });

  it('connectAdb should call adb connect command', async () => {
    const success = await connectAdb('192.168.1.100');
    expect(success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('connect 192.168.1.100:5555'),
      expect.any(Object)
    );
  });

  it('clearGuestApps should query packages, filter whitelist, and clear guest apps', async () => {
    await clearGuestApps('192.168.1.100');
    
    // Should connect first
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('connect 192.168.1.100:5555'),
      expect.any(Object)
    );

    // Should query -3 third-party apps
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('-s 192.168.1.100:5555 shell pm list packages -3'),
      expect.any(Object)
    );

    // Should clear Spotify (com.spotify.music, third-party) and Netflix (com.netflix.ninja, system guest app)
    // but NOT com.hotel.tvapp (whitelisted)
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('shell pm clear com.spotify.music'),
      expect.any(Object)
    );
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('shell pm clear com.netflix.ninja'),
      expect.any(Object)
    );
    expect(mockExec).not.toHaveBeenCalledWith(
      expect.stringContaining('shell pm clear com.hotel.tvapp'),
      expect.any(Object)
    );
  });

  it('rebootDevice should call adb reboot power command', async () => {
    await rebootDevice('192.168.1.100');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('-s 192.168.1.100:5555 shell svc power reboot'),
      expect.any(Object)
    );
  });

  it('wakeUpDevice should send KEYCODE_WAKEUP to device', async () => {
    await wakeUpDevice('192.168.1.100');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('-s 192.168.1.100:5555 shell input keyevent KEYCODE_WAKEUP'),
      expect.any(Object)
    );
  });

  it('setDeviceName should configure names on device settings', async () => {
    await setDeviceName('192.168.1.100', 'Room 101 TV');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("shell settings put global device_name \"'Room 101 TV'\""),
      expect.any(Object)
    );
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("shell settings put system media_router_name \"'Room 101 TV'\""),
      expect.any(Object)
    );
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("shell settings put global bluetooth_name \"'Room 101 TV'\""),
      expect.any(Object)
    );
  });
});
