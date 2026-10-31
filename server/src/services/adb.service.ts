import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { IncidentService } from './incident.service';

const execPromise = util.promisify(exec);

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

// Track active clear operations to prevent concurrent ADB clear loops on the same IP
const activeClears = new Set<string>();

// Track IPs that failed ADB authorization so we don't repeatedly trigger popups on guest TVs
export const unauthorizedIps = new Map<string, number>();
const UNAUTHORIZED_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// Track rooms where a checkout occurred while the TV was offline/unreachable
export const pendingClearRooms = new Set<string>();

function isUnauthorizedCooldownActive(ip: string): boolean {
  const blockedAt = unauthorizedIps.get(ip);
  if (!blockedAt) return false;
  if (Date.now() - blockedAt > UNAUTHORIZED_COOLDOWN_MS) {
    return false;
  }
  return true;
}

export function markIpUnauthorized(ip: string): void {
  unauthorizedIps.set(ip, Date.now());
  // Disconnect so the host ADB daemon stops holding an unauthorized transport to the TV
  execPromise(`${ADB_PATH} disconnect ${ip}:5555`, { timeout: 5000 }).catch(() => {});

  try {
    if (IncidentService.isEnabled()) {
      Promise.resolve()
        .then(() => IncidentService.reportAdbUnauthorized(ip))
        .catch(() => {});
    }
  } catch {
    // Non-blocking fire-and-forget guard
  }
}

/**
 * Connects ADB to the device over the network.
 */
export const connectAdb = async (ip: string, forceRetry = false): Promise<boolean> => {
  if (!forceRetry && isUnauthorizedCooldownActive(ip)) {
    console.warn(`[ADB] Skipping connect to ${ip}: device is in unauthorized cooldown (prevents TV popup).`);
    return false;
  }

  try {
    const { stdout, stderr } = await execPromise(`${ADB_PATH} connect ${ip}:5555`, { timeout: 5000 });
    const output = `${stdout || ''} ${stderr || ''}`.trim();
    const lower = output.toLowerCase();
    console.log(`[ADB] Connect ${ip}:`, (stdout || '').trim());

    if (lower.includes('failed to authenticate') || lower.includes('unauthorized')) {
      console.warn(`[ADB Warning] Device ${ip} is ADB unauthorized. Suppressing further ADB requests to avoid TV popup.`);
      markIpUnauthorized(ip);
      return false;
    }

    if (
      lower.includes('failed to connect') ||
      lower.includes('cannot connect') ||
      lower.includes('unable to connect') ||
      lower.includes('connection refused') ||
      lower.includes('no route to host')
    ) {
      console.warn(`[ADB Warning] Could not connect to ${ip}: ${output}`);
      return false;
    }

    const wasUnauthorized = unauthorizedIps.delete(ip);
    try {
      if (IncidentService.isEnabled() && wasUnauthorized) {
        Promise.resolve()
          .then(() => IncidentService.resolveAdbUnauthorized(ip))
          .catch(() => {});
      }
    } catch {
      // Non-blocking fire-and-forget guard
    }

    return true;
  } catch (error: any) {
    const errMsg = `${error?.stderr || ''} ${error?.message || ''}`.toLowerCase();
    if (errMsg.includes('unauthorized') || errMsg.includes('failed to authenticate')) {
      console.warn(`[ADB Warning] Device ${ip} is ADB unauthorized. Suppressing further ADB requests.`);
      markIpUnauthorized(ip);
      return false;
    }
    console.error(`[ADB Error] Failed to connect to ${ip}:`, error?.message || error);
    return false;
  }
};

/**
 * Dynamically fetches all 3rd party apps, filters against the whitelist, and wipes their data.
 */
export const clearGuestApps = async (ip: string): Promise<void> => {
  if (activeClears.has(ip)) {
    console.log(`[ADB] Clear already in progress for ${ip}, skipping duplicate request.`);
    return;
  }

  activeClears.add(ip);
  console.log(`[ADB] Starting dynamic app clearing for ${ip}...`);

  try {
    // Ensure we are connected first
    const connected = await connectAdb(ip);
    if (!connected) {
      return;
    }

    // Get all third-party packages (-3 flag)
    const { stdout: packageListOutput } = await execPromise(`${ADB_PATH} -s ${ip}:5555 shell pm list packages -3`, { timeout: 10000 });
    
    // If command succeeded, clear any previous unauthorized state
    unauthorizedIps.delete(ip);

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
      } catch (clearError: any) {
        console.error(`[ADB Error] Failed to wipe ${pkg} on ${ip}:`, clearError?.message || clearError);
      }
    }

    console.log(`[ADB] Finished clearing guest apps on ${ip}.`);

  } catch (error: any) {
    const errText = `${error?.stderr || ''} ${error?.message || ''}`.toLowerCase();
    if (errText.includes('unauthorized') || errText.includes('failed to authenticate')) {
      console.warn(`[ADB Warning] Process aborted on ${ip}: ADB device unauthorized. Suppressing further ADB attempts to avoid TV popup.`);
      markIpUnauthorized(ip);
    } else {
      console.error(`[ADB Error] Process failed while clearing guest apps on ${ip}:`, error?.stderr?.trim() || error?.message || error);
    }
  } finally {
    activeClears.delete(ip);
  }
};

/**
 * Sends a reboot command to the device.
 */
export const rebootDevice = async (ip: string): Promise<void> => {
  console.log(`[ADB] Triggering reboot for ${ip}...`);
  try {
    await connectAdb(ip);
    
    // Method 1: Direct ADB daemon reboot (Bypasses 'Not device owner' permission checks in Android)
    try {
      await execPromise(`${ADB_PATH} -s ${ip}:5555 reboot`, { timeout: 5000 });
      console.log(`[ADB] Direct ADB reboot command sent to ${ip} successfully.`);
      return;
    } catch (e) {
      console.warn(`[ADB Warning] Direct ADB reboot failed on ${ip}, trying fallback shell reboot...`);
    }

    // Method 2: Fallback shell reboot
    await execPromise(`${ADB_PATH} -s ${ip}:5555 shell reboot`, { timeout: 5000 });
    console.log(`[ADB] Fallback shell reboot sent to ${ip} successfully.`);
  } catch (error) {
    console.error(`[ADB Error] Failed to reboot ${ip}:`, error);
  }
};

/**
 * Wakes up the device screen and brings the portal app to the foreground.
 */
export const wakeUpDevice = async (ip: string): Promise<void> => {
  console.log(`[ADB] Triggering wake up for ${ip}...`);
  try {
    await connectAdb(ip);
    
    // Keyevent 224 (KEYCODE_WAKEUP) explicitly wakes up the screen
    await execPromise(`${ADB_PATH} -s ${ip}:5555 shell input keyevent KEYCODE_WAKEUP`, { timeout: 5000 });
    console.log(`[ADB] Wakeup keyevent sent to ${ip}.`);
    
    // Optional: Bring our app to front if it's not
    // await execPromise(`${ADB_PATH} -s ${ip}:5555 shell monkey -p com.hotel.tvapp -c android.intent.category.LAUNCHER 1`, { timeout: 5000 });
  } catch (error) {
    console.error(`[ADB Error] Failed to wake up ${ip}:`, error);
  }
};

/**
 * Sets the device name for casting and Bluetooth on the device.
 */
export const setDeviceName = async (ip: string, name: string): Promise<void> => {
  console.log(`[ADB] Setting device name to "${name}" for ${ip}...`);
  try {
    await connectAdb(ip);
    // Wrap the name in single quotes so Android shell preserves spaces correctly
    await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put global device_name "'${name}'"`, { timeout: 5000 });
    await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put system media_router_name "'${name}'"`, { timeout: 5000 });
    await execPromise(`${ADB_PATH} -s ${ip}:5555 shell settings put global bluetooth_name "'${name}'"`, { timeout: 5000 });
    console.log(`[ADB] Device name updated successfully to "${name}" on ${ip}`);
  } catch (error) {
    console.error(`[ADB Error] Failed to set device name on ${ip}:`, error);
  }
};
