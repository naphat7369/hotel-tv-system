"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Set up mock for child_process
const mockExec = vitest_1.vi.fn();
vitest_1.vi.mock('child_process', () => ({
    exec: (cmd, options, callback) => {
        // If options is omitted and callback is the second argument
        const cb = typeof options === 'function' ? options : callback;
        mockExec(cmd, options);
        // Simulate successful command output
        if (cmd.includes('pm list packages -3')) {
            cb(null, { stdout: 'package:com.netflix.ninja\npackage:com.spotify.music\n' });
        }
        else if (cmd.includes('pm list packages')) {
            cb(null, { stdout: 'package:com.netflix.ninja\npackage:com.hotel.tvapp\npackage:com.google.android.youtube.tv\n' });
        }
        else {
            cb(null, { stdout: 'success' });
        }
    }
}));
const adb_service_1 = require("../adb.service");
(0, vitest_1.describe)('ADB Service', () => {
    (0, vitest_1.beforeEach)(() => {
        mockExec.mockClear();
    });
    (0, vitest_1.it)('connectAdb should call adb connect command', async () => {
        const success = await (0, adb_service_1.connectAdb)('192.168.1.100');
        (0, vitest_1.expect)(success).toBe(true);
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('connect 192.168.1.100:5555'), vitest_1.expect.any(Object));
    });
    (0, vitest_1.it)('clearGuestApps should query packages, filter whitelist, and clear guest apps', async () => {
        await (0, adb_service_1.clearGuestApps)('192.168.1.100');
        // Should connect first
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('connect 192.168.1.100:5555'), vitest_1.expect.any(Object));
        // Should query -3 third-party apps
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('-s 192.168.1.100:5555 shell pm list packages -3'), vitest_1.expect.any(Object));
        // Should clear Spotify (com.spotify.music, third-party) and Netflix (com.netflix.ninja, system guest app)
        // but NOT com.hotel.tvapp (whitelisted)
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('shell pm clear com.spotify.music'), vitest_1.expect.any(Object));
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('shell pm clear com.netflix.ninja'), vitest_1.expect.any(Object));
        (0, vitest_1.expect)(mockExec).not.toHaveBeenCalledWith(vitest_1.expect.stringContaining('shell pm clear com.hotel.tvapp'), vitest_1.expect.any(Object));
    });
    (0, vitest_1.it)('rebootDevice should call adb reboot power command', async () => {
        await (0, adb_service_1.rebootDevice)('192.168.1.100');
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('-s 192.168.1.100:5555 shell svc power reboot'), vitest_1.expect.any(Object));
    });
    (0, vitest_1.it)('wakeUpDevice should send KEYCODE_WAKEUP to device', async () => {
        await (0, adb_service_1.wakeUpDevice)('192.168.1.100');
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining('-s 192.168.1.100:5555 shell input keyevent KEYCODE_WAKEUP'), vitest_1.expect.any(Object));
    });
    (0, vitest_1.it)('setDeviceName should configure names on device settings', async () => {
        await (0, adb_service_1.setDeviceName)('192.168.1.100', 'Room 101 TV');
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining("shell settings put global device_name \"'Room 101 TV'\""), vitest_1.expect.any(Object));
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining("shell settings put system media_router_name \"'Room 101 TV'\""), vitest_1.expect.any(Object));
        (0, vitest_1.expect)(mockExec).toHaveBeenCalledWith(vitest_1.expect.stringContaining("shell settings put global bluetooth_name \"'Room 101 TV'\""), vitest_1.expect.any(Object));
    });
});
