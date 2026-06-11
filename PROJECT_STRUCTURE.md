# Project File Structure

Below is the high-level file and folder structure of the Hotel-TV system, outlining the responsibilities of each directory.

```text
hotel-tv-system/
├── README.md                  # Main project documentation
├── PROJECT_STRUCTURE.md       # This file
├── test-pms.js                # Mock script for testing PMS Check-in/Check-out webhooks
│
├── server/                    # Node.js Backend Server
│   ├── src/
│   │   ├── index.ts           # Main entry point (Express & Socket initialization)
│   │   ├── api/
│   │   │   ├── mdm.routes.ts  # REST APIs for Device Management commands
│   │   │   └── pms.routes.ts  # Webhooks for Hotel PMS Check-in/Check-out
│   │   ├── services/
│   │   │   ├── adb.service.ts # Executes Android ADB shell commands (Wipe, Reboot)
│   │   │   └── wol.service.ts # Magic Packet / Wake-on-LAN services
│   │   └── websocket/
│   │       └── socket.ts      # Real-time WebSockets (Status tracking, MDM relays)
│   ├── package.json
│   └── tsconfig.json
│
├── cms-frontend/              # Admin CMS (React/Vite)
│   ├── src/
│   │   ├── App.tsx            # Main layout and routing
│   │   ├── pages/
│   │   │   └── DeviceManagement.tsx # MDM Dashboard (Room mapping, remote controls)
│   │   └── index.css          # Tailwind configurations
│   ├── package.json
│   └── vite.config.ts
│
├── portal-frontend/           # TV Web UI (React/Vite)
│   ├── src/
│   │   ├── App.tsx            # Full TV experience (Channels, Marquee, WebSockets)
│   │   ├── index.css          # Custom styling for 1080p TV displays
│   │   └── assets/            # Fonts, icons, and placeholder images
│   ├── package.json
│   └── vite.config.ts
│
└── android-tv-app/            # Native Kotlin Android App
    ├── app/src/main/
    │   ├── AndroidManifest.xml # Permissions (Internet, Boot, Kiosk)
    │   ├── java/com/hotel/tvapp/
    │   │   ├── MainActivity.kt # Core wrapper (WebView + ExoPlayer)
    │   │   ├── KioskAdminReceiver.kt # Device Owner admin receiver
    │   │   └── network/
    │   │       └── WebSocketClient.kt # Native WebSocket for fetching local IPs
    │   └── res/
    │       ├── layout/
    │       │   └── activity_main.xml # Layered layout (PlayerView bottom, WebView top)
    │       └── values/
    └── build.gradle.kts
```

## Key Files to Know:

1. **`server/src/websocket/socket.ts`**
   Handles the mapping of `deviceId` and `roomNumber`. It tracks which TVs are online and acts as the bridge when the CMS wants to send a command to a specific TV.

2. **`portal-frontend/src/App.tsx`**
   The massive React file that controls everything the guest sees. It handles its own local storage (`device_id`, `room_number`) and listens for `guest_update` events from the server to toggle between the welcome screen and the generic screensaver.

3. **`android-tv-app/../MainActivity.kt`**
   The Kotlin code that makes the box act like a real hotel TV. It runs a transparent WebView on top of a hardware-accelerated UDP IPTV player. It also executes critical Android commands that a browser cannot do, like `reboot` and reading the MAC/IP address.
