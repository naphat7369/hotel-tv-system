# Hotel IPTV & MDM System

An end-to-end IPTV, Digital Signage, and Mobile Device Management (MDM) solution designed for modern hospitality and hotels. The system allows hotels to manage their Android TV boxes, display customized welcome screens tied to their PMS (Property Management System), offer in-room services, and control TVs remotely.

## 🏗️ Architecture & Components

The repository is divided into 4 main components:

### 1. `server` (Node.js / Express / Socket.io)
The central backend that orchestrates everything.
- **PMS Integration API**: Receives check-in / check-out webhooks (`/api/v1/pms/checkin`).
- **MDM Controller**: Sends ADB commands (`reboot`, `clear_cache`, `set_device_name`, `wake_on_lan`) to the Android TV boxes.
- **WebSocket Server**: Maintains real-time connections with all online TVs for instant UI updates, live messaging, and network status reporting.

### 2. `android-tv-app` (Native Kotlin App)
The native Android TV application that acts as a Kiosk wrapper.
- **ExoPlayer Integration**: Hardware-accelerated UDP multicast and IPTV streaming.
- **WebView Portal**: Renders the React `portal-frontend` over the video stream.
- **MDM Bridge**: Executes root/device-owner ADB commands (reboot, clear app data) and reports local IP/MAC addresses.
- **Kiosk Mode**: Locks the TV into the hotel experience.

### 3. `portal-frontend` (React / Vite / Tailwind)
The interactive web UI that guests interact with via their TV remote.
- Displays Guest Name & VIP status dynamically upon check-in.
- Live TV Channel menu with Picture-in-Picture capability.
- In-Room Dining & Housekeeping request system.
- Real-time scrolling marquees and alert messages pushed from the CMS.

### 4. `cms-frontend` (React / Vite / Tailwind)
The admin portal for the hotel IT team and reception.
- **Device Management**: View all online TVs, their IP, Wi-Fi signal (dBm), and MAC address.
- **Room Mapping**: Assign TVs to specific Room Numbers dynamically.
- **Remote Control**: Wake, sleep, reboot, or clear cache of any TV instantly.
- **Messaging**: Send targeted alert popups to specific rooms.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Android Studio (for compiling the TV APK)
- ADB installed and configured in your PATH (for MDM features)

### Running Locally

1. **Start the Backend Server**
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **Start the Admin CMS**
   ```bash
   cd cms-frontend
   npm install
   npm run dev
   ```

3. **Start the TV Web Portal**
   ```bash
   cd portal-frontend
   npm install
   npm run dev
   ```

4. **Testing PMS Integration**
   You can mock a hotel check-in/out event using the provided script:
   ```bash
   node test-pms.js checkin
   node test-pms.js checkout
   ```

---

## 📡 PMS Integration Flow

1. Receptionist checks in a guest on Oracle OPERA / Cloudbeds.
2. PMS sends a POST request with `{"roomNumber": "1101", "guestName": "John Doe"}` to our Server.
3. Server looks up which `deviceId` is currently mapped to `1101`.
4. Server emits a WebSocket event to that specific TV.
5. TV UI instantly transitions from generic screensaver to "Welcome Mr. John Doe".

## 🛡️ Security & MDM
For full MDM features (Reboot, Wipe Data), the Android App must be set as a **Device Owner**:
```bash
adb shell dpm set-device-owner com.hotel.tvapp/.KioskAdminReceiver
```
