"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDeviceName = exports.wakeUpDevice = exports.rebootDevice = exports.clearGuestApps = exports.connectAdb = void 0;
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const execPromise = util_1.default.promisify(child_process_1.exec);
/**
 * Helper to easily list all currently installed third-party packages via ADB.
 * You can run this directly in your terminal to see exactly what to add to the whitelist:
 *
 * ADB Command Snippet:
 * adb shell pm list packages -3
 *
 * To check from a remote PC:
 * adb -s <ip>:5555 shell pm list packages -3
 */
// Resolve ADB path from .env or fallback to system PATH
const ADB_PATH = process.env.ADB_PATH || 'adb';
console.log(`[ADB] Using ADB at: ${ADB_PATH}`);
// Define the "Whitelist" of apps that should NEVER be wiped during checkout.
// Add any hotel/MDM system apps here.
const EXCLUDED_PACKAGES = [
    'com.hotel.tvapp', // Our main hotel portal app
    // Add other system/MDM apps below if they show up in the -3 list
    // 'com.example.mdm',
    // 'com.teamviewer.host.market',
];
// Define a list of known system/pre-installed guest apps that we want to wipe if present.
// These are not in the "-3" third-party packages list on some firmware.
const ADDITIONAL_GUEST_PACKAGES = [
    'com.netflix.ninja',
    'com.netflix.tokenmanager',
    'com.amazon.amazonvideo.livingroom',
    'com.google.android.youtube.tv',
    'com.google.android.youtube.tvmusic',
];
/**
 * Connects ADB to the device over the network.
 */
const connectAdb = async (ip) => {
    try {
        const { stdout, stderr } = await execPromise(`${ADB_PATH} connect ${ip}:5555`, { timeout: 5000 });
        console.log(`[ADB] Connect ${ip}:`, stdout.trim());
        return true;
    }
    catch (error) {
        console.error(`[ADB Error] Failed to connect to ${ip}:`, error);
        return false;
    }
};
exports.connectAdb = connectAdb;
/**
 * Dynamically fetches all 3rd party apps, filters against the whitelist, and wipes their data.
 */
const clearGuestApps = async (ip) => {
    console.log(`[ADB] Starting dynamic app clearing for ${ip}...`);
    try {
        // Ensure we are connected first
        await (0, exports.connectAdb)(ip);
        // Get all third-party packages (-3 flag)
        const { stdout: packageListOutput } = await execPromise(`${ADB_PATH} -s ${ip}:5555 shell pm list packages -3`, { timeout: 10000 });
        // Parse the third-party output
        const thirdPartyPackages = packageListOutput
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('package:'))
            .map(line => line.replace('package:', ''));
        console.log(`[ADB] Found ${thirdPartyPackages.length} third-party apps on ${ip}.`);
        // Filter out our whitelisted apps from the third-party list
        const thirdPartyAppsToClear = thirdPartyPackages.filter(pkg => !EXCLUDED_PACKAGES.includes(pkg));
        // Get all packages (to check if pre-installed/system guest packages are installed)
        const { stdout: allPackagesOutput } = await execPromise(`${ADB_PATH} -s ${ip}:5555 shell pm list packages`, { timeout: 10000 });
        const allInstalledPackages = allPackagesOutput
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('package:'))
            .map(line => line.replace('package:', ''));
        // Check which of the additional guest packages are actually installed
        const systemGuestAppsToClear = ADDITIONAL_GUEST_PACKAGES.filter(pkg => allInstalledPackages.includes(pkg));
        // Merge both lists into a unique set of packages to clear
        const appsToClear = Array.from(new Set([...thirdPartyAppsToClear, ...systemGuestAppsToClear]));
        console.log(`[ADB] Found ${appsToClear.length} guest apps to wipe:`, appsToClear);
        // Loop through and clear data for each app
        for (const pkg of appsToClear) {
            try {
                console.log(`[ADB] Wiping data for ${pkg} on ${ip}...`);
                const { stdout: clearOutput } = await execPromise(`${ADB_PATH} -s ${ip}:5555 shell pm clear ${pkg}`, { timeout: 15000 });
                console.log(`[ADB] Success wiping ${pkg}:`, clearOutput.trim());
            }
            catch (clearError) {
                console.error(`[ADB Error] Failed to wipe ${pkg} on ${ip}:`, clearError);
            }
        }
        console.log(`[ADB] Finished clearing guest apps on ${ip}.`);
    }
    catch (error) {
        console.error(`[ADB Error] Process failed while clearing guest apps on ${ip}:`, error);
    }
};
exports.clearGuestApps = clearGuestApps;
/**
 * Sends a reboot command to the device.
 */
const rebootDevice = async (ip) => {
    console.log(`[ADB] Triggering reboot for ${ip}...`);
    try {
        await (0, exports.connectAdb)(ip);
        await execPromise(`${ADB_PATH} -s ${ip}:5555 shell svc power reboot`, { timeout: 5000 });
        console.log(`[ADB] Reboot command sent to ${ip} successfully.`);
    }
    catch (error) {
        console.error(`[ADB Error] Failed to reboot ${ip}:`, error);
    }
};
exports.rebootDevice = rebootDevice;
/**
 * Wakes up the device screen and brings the portal app to the foreground.
 */
const wakeUpDevice = async (ip) => {
    console.log(`[ADB] Triggering wake up for ${ip}...`);
    try {
        await (0, exports.connectAdb)(ip);
        // Keyevent 224 (KEYCODE_WAKEUP) explicitly wakes up the screen
        await execPromise(`${ADB_PATH} -s ${ip}:5555 shell input keyevent KEYCODE_WAKEUP`, { timeout: 5000 });
        console.log(`[ADB] Wakeup keyevent sent to ${ip}.`);
        // Optional: Bring our app to front if it's not
        // await execPromise(`${ADB_PATH} -s ${ip}:5555 shell monkey -p com.hotel.tvapp -c android.intent.category.LAUNCHER 1`, { timeout: 5000 });
    }
    catch (error) {
        console.error(`[ADB Error] Failed to wake up ${ip}:`, error);
    }
};
exports.wakeUpDevice = wakeUpDevice;
/**
 * Sets the device name for casting and Bluetooth on the device.
 */
const setDeviceName = async (ip, name) => {
    console.log(`[ADB] Setting device name to "${name}" for ${ip}...`);
    try {
        await (0, exports.connectAdb)(ip);
        // Wrap the name in single quotes so Android shell preserves spaces correctly
        await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put global device_name "'${name}'"`, { timeout: 5000 });
        await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put system media_router_name "'${name}'"`, { timeout: 5000 });
        await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put global bluetooth_name "'${name}'"`, { timeout: 5000 });
        console.log(`[ADB] Device name updated successfully to "${name}" on ${ip}`);
    }
    catch (error) {
        console.error(`[ADB Error] Failed to set device name on ${ip}:`, error);
    }
};
exports.setDeviceName = setDeviceName;
