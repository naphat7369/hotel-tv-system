import { useEffect, useRef, useState, useCallback } from 'react'
import LiveTVPlayer from './components/LiveTVPlayer'
import LoadingScreen from './components/LoadingScreen'
import { io } from 'socket.io-client'
import { trackEvent } from './lib/analytics'

export interface BackendChannel {
  id: string;
  name: string;
  channelNumber: number | null;
  category: string | null;
  streamUrl: string | null;
  logoUrl: string | null;
  bgImage?: string | null;
  isActive: boolean;
  sortOrder: number | null;
}

type DisplayType = 'IMAGE_ONLY' | 'QR_CODE' | 'TEXT_INFO' | 'SERVICE_REQUEST'

interface MenuItem {
  id: string
  name: string
  subtitle?: string
  icon: string
  color: string
  displayType: DisplayType
  displayContent: string
  bgImage?: string
}





function App() {
  // Use localStorage so the CMS can dynamically rename this device without an Android app
  // Stored in refs to prevent socket useEffect from re-running on every render
  const deviceIdRef = useRef(localStorage.getItem('device_id') || 'BOX-101-A');
  const roomNumberRef = useRef(localStorage.getItem('room_number') || 'Unassigned');
  const deviceId = deviceIdRef.current;
  const roomNumber = roomNumberRef.current;
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const [time, setTime] = useState(new Date())
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const [appLoading, setAppLoading] = useState(true)
  const [appsMenu, setAppsMenu] = useState<any[]>([])
  const [appSettings, setAppSettings] = useState({
    hotelName: 'S31 SUKUMVIT HOTEL',
    hotelStars: '★★★★★',
    title: 'PREPARING YOUR EXPERIENCE',
    subtitle: 'Establishing secure connection to the hotel network...',
    bgImage: 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]',
    backgroundImages: [] as { tag: string, url: string, message?: string }[],
    portalMainTitle: 'S31',
    portalSubtitle: 'Hotel Sukumvit'
  })

  // Dynamic menu items from CMS with localStorage offline caching fallback
  const [servicesMenu, setServicesMenu] = useState<MenuItem[]>(() => {
    const cached = localStorage.getItem('services_menu_cache');
    return cached ? JSON.parse(cached) : [];
  })
  const [diningMenu, setDiningMenu] = useState<MenuItem[]>(() => {
    const cached = localStorage.getItem('dining_menu_cache');
    return cached ? JSON.parse(cached) : [];
  })
  const [guideMenu, setGuideMenu] = useState<MenuItem[]>(() => {
    const cached = localStorage.getItem('guide_menu_cache');
    return cached ? JSON.parse(cached) : [];
  })
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  
  // Live TV State
  const [isPlayingLiveTV, setIsPlayingLiveTV] = useState(false)
  const [currentChannelIndex, setCurrentChannelIndex] = useState(0)

  // Guest State (Phase 2 dynamic UI)
  const [guestData, setGuestData] = useState<{ isCheckedIn: boolean, name: string | null, tag: string | null }>({
    isCheckedIn: false,
    name: null,
    tag: null
  });

  
  // Marquee State
  const [marquee, setMarquee] = useState({
    message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸',
    type: 'default'
  });

  // Alert Modal State
  const [alertModal, setAlertModal] = useState({
    active: false,
    message: ''
  });
  
  // Inbox Messages State
  const [inboxMessages, setInboxMessages] = useState<{id: string, text: string, time: Date}[]>([]);
  
  // Dynamic Channels State
  const [liveChannels, setLiveChannels] = useState<BackendChannel[]>(() => {
    const cached = localStorage.getItem('channels_cache');
    if (cached) {
      try {
        const parsed: BackendChannel[] = JSON.parse(cached);
        return parsed.sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const fetchChannels = useCallback(async () => {
    try {
      const serverHost = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${serverHost}/api/v1/channels?t=${Date.now()}`);
      if (res.ok) {
        const data: BackendChannel[] = await res.json();
        const activeChannels = data.filter(c => c.isActive);
        activeChannels.sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999));
        console.log('[fetchChannels] Fetched channels:', JSON.stringify(activeChannels));
        setLiveChannels(activeChannels);
        localStorage.setItem('channels_cache', JSON.stringify(activeChannels));
      }
    } catch (err) {
      console.error('Failed to fetch channels, using cache', err);
    }
  }, []);

  // Fetch dynamic menu items from CMS backend
  const fetchMenuItems = useCallback(async () => {
    try {
      const serverHost = `http://${window.location.hostname}:3000`;
      // Fetch with ?scheduled=true so backend filters out items outside their activeFrom/activeUntil window
      const res = await fetch(`${serverHost}/api/v1/services/menu-items?scheduled=true`, { cache: 'no-store' });
      if (res.ok) {
        const data: any[] = await res.json();
        const toMenuItem = (item: any): MenuItem => ({
          id: item.id,
          name: item.name,
          subtitle: item.subtitle,
          icon: item.icon || '🎯',
          color: item.color || 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]',
          displayType: item.displayType as DisplayType,
          displayContent: item.displayContent,
          bgImage: item.bgImage,
        });
        
        const services = data.filter((i: any) => i.section === 'services').map(toMenuItem);
        const dining = data.filter((i: any) => i.section === 'dining').map(toMenuItem);
        const guide = data.filter((i: any) => i.section === 'local_guide').map(toMenuItem);

        setServicesMenu(services);
        setDiningMenu(dining);
        setGuideMenu(guide);

        // Fetch streaming apps
        try {
          const appsRes = await fetch(`${serverHost}/api/v1/streaming-apps`, { cache: 'no-store' });
          if (appsRes.ok) {
            const appsData = await appsRes.json();
            setAppsMenu(appsData.filter((a: any) => a.isActive));
          }
        } catch (e) {
          console.error('Failed to fetch streaming apps', e);
        }

        // Offline caching
        localStorage.setItem('services_menu_cache', JSON.stringify(services));
        localStorage.setItem('dining_menu_cache', JSON.stringify(dining));
        localStorage.setItem('guide_menu_cache', JSON.stringify(guide));
      }
    } catch (err) {
      console.error('Failed to fetch menu items, falling back to cache', err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const serverHost = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${serverHost}/api/v1/settings?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setAppSettings({
          hotelName: data.hotel_name || 'S31 SUKUMVIT HOTEL',
          hotelStars: data.hotel_stars || '★★★★★',
          title: data.loading_title || 'PREPARING YOUR EXPERIENCE',
          subtitle: data.loading_subtitle || 'Establishing secure connection to the hotel network...',
          // loading_bg_image is from Brand Settings page (separate from Portal bg images)
          bgImage: data.loading_bg_image || 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]',
          backgroundImages: data.backgroundImages || [],
          portalMainTitle: data.portal_main_title || 'S31',
          portalSubtitle: data.portal_subtitle || 'Hotel Sukumvit'
        });
      }
    } catch (e) {
      console.error('Failed to fetch settings', e);
    }
  }, []);

  useEffect(() => {
    const bootApp = async () => {
      // Ensure the loading screen shows for at least 2.5 seconds for the premium feel
      const minDelay = new Promise(resolve => setTimeout(resolve, 2500));
      await Promise.all([fetchChannels(), fetchMenuItems(), fetchSettings(), minDelay]);
      setAppLoading(false);
    };
    bootApp();

    const serverHost = `http://${window.location.hostname}:3000`;
    
    // Prevent duplicate socket connections if already connected
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const socket = io(serverHost, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });
    socketRef.current = socket;
    
    const _deviceId = deviceIdRef.current;
    const _roomNumber = roomNumberRef.current;
    
    socket.on('connect', () => {
      console.log(`WebSocket connected, registering device as ${_deviceId} for room ${_roomNumber}...`);
      socket.emit('register_device', { deviceId: _deviceId, roomNumber: _roomNumber });
    });

    // Heartbeat every 30 seconds to keep MDM status Online
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { deviceId: _deviceId });
      }
    }, 30000);
    
    // Listen for MDM commands (like rename, set room, reload, clear cache)
    socket.on('mdm_command', (data: any) => {
      console.log('Received MDM command:', data);
      if (data.command === 'set_room_number' && data.payload && data.payload.roomNumber) {
        localStorage.setItem('room_number', data.payload.roomNumber);
        window.location.reload(); // Reload to re-register with new room
      } else if (data.command === 'reload_portal') {
        window.location.reload();
      } else if (data.command === 'clear_cache') {
        const savedDeviceId = localStorage.getItem('device_id');
        const savedRoomNumber = localStorage.getItem('room_number');
        localStorage.clear();
        sessionStorage.clear();
        if (savedDeviceId) localStorage.setItem('device_id', savedDeviceId);
        if (savedRoomNumber) localStorage.setItem('room_number', savedRoomNumber);
        window.location.reload();
      }
    });

    // Network status is now handled exclusively by the Native Android App.

    socket.on('guest_update', (data: any) => {
      console.log('Received guest_update:', data);
      if (data.status === 'checked_in') {
        setGuestData({ isCheckedIn: true, name: data.guestName, tag: data.guestTag });
      } else {
        setGuestData({ isCheckedIn: false, name: null, tag: null });
      }
    });

    socket.on('refresh_channels', () => {
      fetchChannels();
    });

    socket.on('refresh_streaming_apps', () => {
      console.log('Received refresh_streaming_apps event, fetching latest apps...');
      fetchMenuItems();
    });
    
    // Listen for realtime menu changes from CMS
    socket.on('refresh_guest_menu', (data: any) => {
      console.log('Received refresh_guest_menu:', data);
      fetchMenuItems();
    });
    
    // Listen for realtime settings changes from CMS
    socket.on('refresh_settings', () => {
      console.log('Received refresh_settings');
      fetchSettings();
    });
    socket.on('show_marquee', (data: any) => {
      if (data && data.message) {
        setMarquee({ message: data.message, type: data.type || 'default' });
      }
    });
    socket.on('hide_marquee', () => {
      setMarquee({ message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸', type: 'default' });
    });
    socket.on('show_modal', (data: any) => {
      if (data && data.message) {
        setAlertModal({ active: true, message: data.message });
      }
    });
    socket.on('hide_modal', () => {
      setAlertModal({ active: false, message: '' });
    });
    socket.on('hide_broadcast', () => {
      setMarquee({ message: 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸', type: 'default' });
      setAlertModal({ active: false, message: '' });
      setInboxMessages([]);
    });
    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [fetchChannels, fetchMenuItems, fetchSettings]);
  // Used to prevent double-back button presses when exiting third party apps
  const lastFocusTimeRef = useRef<number>(Date.now());
  const subMenuRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const alertModalRef = useRef<(HTMLButtonElement | null)[]>([]);
  const mainMenuRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // App Wake-up / Visibility Change Recovery Fetch
  const fetchStatus = useCallback(async () => {
    try {
      // In production, get IP from Android Bridge. Using actual box IP for dev.
      let deviceIp = '192.168.1.62';
      if (typeof (window as any).AndroidTVBridge !== 'undefined') {
        deviceIp = (window as any).AndroidTVBridge.getIpAddress();
      } else if (typeof (window as any).AndroidTV !== 'undefined' && typeof (window as any).AndroidTV.getIpAddress === 'function') {
        deviceIp = (window as any).AndroidTV.getIpAddress();
      }
      const serverHost = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${serverHost}/api/v1/pms/status/${deviceIp}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'checked_in') {
          setGuestData({ isCheckedIn: true, name: data.guestName, tag: data.guestTag });
        } else {
          setGuestData({ isCheckedIn: false, name: null, tag: null });
        }
      }
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  }, []);

  useEffect(() => {
    // Fetch initial status on load
    fetchStatus();

    // Listen for wake up / visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('App became visible, fetching latest PMS status...');
        fetchStatus();
      }
    };
    
    const handleFocus = () => {
      console.log('Window focused, fetching latest PMS status...');
      lastFocusTimeRef.current = Date.now();
      fetchStatus();
    };

    const handleAndroidResume = () => {
      console.log('Explicit Android resume detected, updating focus time...');
      lastFocusTimeRef.current = Date.now();
      fetchStatus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('android_resume', handleAndroidResume);

    // Initial fetch
    fetchStatus();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('android_resume', handleAndroidResume);
    };
  }, [fetchStatus]);

  // State for Service Request Form
  const [formQuantities, setFormQuantities] = useState<Record<string, number>>({})
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // ── Analytics: Hardware Metrics Interval ─────────────────────────────
  useEffect(() => {
    const hardwareTimer = setInterval(() => {
      let memory = undefined;
      // @ts-ignore
      if (performance && performance.memory) {
        // @ts-ignore
        memory = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      }
      trackEvent('HARDWARE_METRIC', {
        uptimeSeconds: Math.floor(performance.now() / 1000),
        memoryMB: memory
      });
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(hardwareTimer);
  }, []);

  // Auto-dismiss success message after 3 seconds
  useEffect(() => {
    if (showSuccess) {
      const timeout = setTimeout(() => {
        setShowSuccess(false)
        setSelectedItem(null)
        setFormQuantities({})
      }, 3000)
      return () => clearTimeout(timeout)
    }
  }, [showSuccess])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // GLOBAL: Home button takes priority over everything
      if (e.key === 'Home') {
        setIsPlayingLiveTV(false)
        setSelectedItem(null)
        setActiveMenu(null)
        e.preventDefault()
        return
      }

      // If Live TV is playing, let the LiveTVPlayer handle all other keys
      if (isPlayingLiveTV) return;

      const activeElement = document.activeElement as HTMLElement

      // Close Modals / Menus on Escape or Back
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4) {
        // Prevent accidental menu closing if user spammed the Back button to exit an app
        if (Date.now() - lastFocusTimeRef.current < 2500) {
          console.log("Ignoring Back button to prevent accidental menu close right after resuming");
          e.preventDefault();
          return;
        }
        if (selectedItem) {
          setSelectedItem(null)
          setShowSuccess(false)
          e.preventDefault()
          return
        }
        if (activeMenu) {
          setActiveMenu(null)
          e.preventDefault()
          return
        }
      }

      // Android TV's Chromium WebView native spatial navigation handles D-Pad perfectly out-of-the-box.
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        activeElement.click()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [activeMenu, selectedItem, isPlayingLiveTV])

  // Auto-focus the first item in the sub-menu when a menu opens
  useEffect(() => {
    if (activeMenu) {
      setTimeout(() => {
        const firstFocusable = subMenuRefs.current.find(ref => ref !== null);
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }, 50);
    } else {
      // Clear refs when menu closes so old ones don't linger
      subMenuRefs.current = [];
    }
  }, [activeMenu]);

  // Auto-focus Channel TV on initial load or when returning to main menu
  useEffect(() => {
    if (!appLoading && !activeMenu && !selectedItem && !isPlayingLiveTV) {
      setTimeout(() => {
        mainMenuRefs.current[0]?.focus();
      }, 300);
    }
  }, [appLoading, activeMenu, selectedItem, isPlayingLiveTV]);

  const renderModalContent = () => {
    if (!selectedItem) return null

    switch (selectedItem.displayType) {
      case 'IMAGE_ONLY':
        return (
          <div className="relative w-[80vw] max-h-[85vh] rounded-[20px] overflow-hidden shadow-2xl bg-surface">
            <img loading="lazy" src={selectedItem.displayContent} alt={selectedItem.name} className="w-full h-[75vh] object-cover block" />
            <div className="absolute bottom-0 left-0 right-0 p-[3vh_3vw] bg-gradient-to-t from-black/90 to-transparent">
              <h3 className="font-display-lg text-[3vw] text-white leading-none">{selectedItem.name}</h3>
              <p className="text-on-surface-variant text-[1.2vw] mt-[1vh]">{selectedItem.subtitle}</p>
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
          </div>
        )
      
      case 'QR_CODE':
        return (
          <div className="relative flex w-[82vw] rounded-[20px] overflow-hidden shadow-2xl bg-surface">
             <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="flex-1 relative min-h-[65vh] bg-gradient-to-tr from-slate-900 to-slate-800">
              <div className="absolute inset-0 bg-gradient-to-tr from-black/70 to-black/30 flex flex-col justify-end p-[3vh_3vw]">
                <h3 className="font-display-lg text-[3vw] text-white leading-none mb-[1vh]">{selectedItem.name}</h3>
                <p className="text-white/80 text-[1.2vw]">{selectedItem.subtitle}</p>
              </div>
            </div>
            <div className="w-[26vw] bg-surface2 flex flex-col items-center justify-center p-[4vh_3vw] gap-[2.5vh] border-l border-white/10">
              <div className="w-[14vw] h-[14vw] bg-white rounded-2xl flex items-center justify-center p-[1vw] shadow-[0_8px_32px_rgba(201,168,76,0.2)]">
                {/* Fallback mock QR image */}
                <img loading="lazy" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selectedItem.displayContent)}&bgcolor=ffffff`} alt="QR" className="w-full h-full" />
              </div>
              <div className="text-center">
                <strong className="block text-secondary text-[1.4vw] mb-[0.5vh]">📱 Scan with Phone</strong>
                <span className="text-on-surface-variant text-[1.1vw] leading-relaxed">Point your smartphone camera at the QR code to open on your device.</span>
              </div>
              <div className="bg-white/5 px-[1vw] py-[0.6vh] rounded-lg border border-white/10 text-on-surface-variant text-[0.85vw] break-all text-center w-full">
                {selectedItem.displayContent.replace('https://', '')}
              </div>
            </div>
          </div>
        )
      
      case 'TEXT_INFO':
        const infoData = JSON.parse(selectedItem.displayContent)
        return (
          <div className="w-[55vw] rounded-[20px] bg-surface overflow-hidden shadow-2xl relative">
             <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="p-[3vh_3vw] bg-surface2 border-b border-white/10 flex items-center gap-[1.5vw]">
              <div className={`w-[5vw] h-[5vw] rounded-2xl flex items-center justify-center ${selectedItem.color} text-[2.2vw] shadow-lg`}>
                {selectedItem.icon}
              </div>
              <div>
                <h3 className="font-display-lg text-[2.5vw] text-white leading-none">{selectedItem.name}</h3>
                <p className="text-on-surface-variant text-[1vw] mt-[0.5vh] uppercase tracking-wider">{activeMenu} · Information</p>
              </div>
            </div>
            <div className="p-[3vh_3vw] flex flex-col gap-[1.5vh]">
              {Object.entries(infoData).map(([key, val], idx) => (
                <div key={key} className={`flex gap-[1.5vw] py-[1vh] ${idx !== Object.keys(infoData).length - 1 ? 'border-b border-white/5' : ''}`}>
                  <span className="material-symbols-outlined text-secondary text-[1.5vw] mt-[0.2vh]">info</span>
                  <div>
                    <div className="text-on-surface-variant text-[0.9vw] uppercase tracking-widest mb-[0.4vh]">{key}</div>
                    <div className="text-white text-[1.2vw] leading-relaxed whitespace-pre-wrap">{val as string}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-[2vh_3vw] bg-surface2 flex justify-end">
               <button
                 onClick={() => setSelectedItem(null)}
                 className="px-[2vw] py-[1.2vh] rounded-lg border border-white/10 bg-white/5 text-white font-semibold text-[1.1vw] focus:bg-white/10 focus:border-secondary focus:text-secondary outline-none transition-colors"
               >
                 Close
               </button>
            </div>
          </div>
        )
      
      case 'SERVICE_REQUEST':
        if (showSuccess) {
          return (
            <div className="w-[40vw] rounded-[24px] bg-surface overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative text-center p-[6vh_3vw] animate-in zoom-in-95 duration-300">
              <div className="w-[8vw] h-[8vw] bg-[#4ade80]/20 text-[#4ade80] rounded-full flex items-center justify-center mx-auto mb-[3vh] shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                <span className="material-symbols-outlined" style={{ fontSize: '4vw' }}>check_circle</span>
              </div>
              <h3 className="font-display-lg text-[2.5vw] text-white mb-[1vh]">Request Received!</h3>
              <p className="text-on-surface-variant text-[1.2vw] mb-[4vh] leading-relaxed">
                Our housekeeping team has been notified and will be with you shortly.
              </p>
              <button
                onClick={() => {
                  setShowSuccess(false);
                  setSelectedItem(null);
                  setFormQuantities({});
                }}
                className="px-[3vw] py-[1.5vh] rounded-xl bg-white/10 text-white font-bold text-[1.2vw] hover:bg-white/20 focus:bg-white/20 focus:border-secondary outline-none border-2 border-transparent transition-all glow-focus"
              >
                Close
              </button>
            </div>
          )
        }

        const formItems = JSON.parse(selectedItem.displayContent) as any[]
        return (
          <div className="w-[50vw] rounded-[20px] bg-surface overflow-hidden shadow-2xl relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-[2vh] right-[2vw] z-50 w-[3.5vw] h-[3.5vw] rounded-full border border-white/20 bg-black/50 flex items-center justify-center text-white focus:bg-white/20 focus:border-secondary focus:text-secondary outline-none transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>close</span>
            </button>
            <div className="p-[3vh_3vw] bg-surface2 border-b border-white/10 flex items-center gap-[1.5vw]">
              <div className={`w-[5vw] h-[5vw] rounded-2xl flex items-center justify-center ${selectedItem.color} text-[2.2vw] shadow-lg`}>
                {selectedItem.icon}
              </div>
              <div>
                <h3 className="font-display-lg text-[2.5vw] text-white leading-none">{selectedItem.name}</h3>
                <p className="text-on-surface-variant text-[1vw] mt-[0.5vh] uppercase tracking-wider">Select items and quantity</p>
              </div>
            </div>
            <div className="p-[3vh_3vw] flex flex-col gap-[1.5vh]">
              {formItems.map((item) => {
                const qty = formQuantities[item.id] || 0
                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-[1.5vh_1.5vw] bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:border-secondary focus:scale-[1.02] outline-none transition-all cursor-pointer"
                    onClick={() => {
                       setFormQuantities(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))
                    }}
                  >
                    <div className="flex items-center gap-[1vw] text-[1.2vw] font-medium text-white">
                      <span className="material-symbols-outlined text-[1.8vw] text-on-surface-variant">{item.icon}</span>
                      {item.name}
                    </div>
                    <div className="flex items-center gap-[1vw] bg-black/30 p-[0.5vh_1vw] rounded-lg">
                      <span className="text-[1.2vw] font-bold w-[2vw] text-center text-white">{qty}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-[2vh_3vw] bg-surface2 border-t border-white/10 flex justify-end gap-[1vw]">
               <button
                 onClick={() => setSelectedItem(null)}
                 className="px-[2vw] py-[1.2vh] rounded-lg border border-white/10 bg-transparent text-white font-semibold text-[1.1vw] focus:bg-white/10 focus:border-secondary focus:text-secondary outline-none transition-colors"
               >
                 Cancel
               </button>
               <button
                 onClick={async () => {
                    const requested = Object.entries(formQuantities).filter(([_, q]) => q > 0).map(([id, quantity]) => {
                      const itemDef = formItems.find(i => i.id === id);
                      return { id, name: itemDef?.name, quantity };
                    })
                    
                    if (requested.length === 0) return alert("Please select at least one item.")
                    
                    try {
                      const backendUrl = `http://${window.location.hostname}:3000/api/v1/requests`;
                      const response = await fetch(backendUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          hotelId: 'hotel-1',
                          roomId: `room-${roomNumber}`,
                          requestType: 'HOUSEKEEPING',
                          items: requested
                        })
                      })
                      
                      if (response.ok) {
                        setShowSuccess(true)
                        trackEvent('ORDER_SUBMITTED', { items: requested })
                      } else {
                        alert("Failed to submit request. Please call the front desk.")
                      }
                    } catch (e) {
                      console.error("Error submitting request:", e)
                      alert("Network error. Please try again.")
                    }
                 }}
                 className="flex items-center gap-[0.5vw] px-[2vw] py-[1.2vh] rounded-lg bg-secondary text-on-secondary font-bold text-[1.1vw] focus:ring-4 focus:ring-secondary/50 outline-none transition-all hover:bg-opacity-90"
               >
                 <span className="material-symbols-outlined">send</span> Submit
               </button>
            </div>
          </div>
        )
    }
  }

  const renderSubMenuHorizontalCards = (items: MenuItem[]) => {
    return items.map((item, index) => {
        const typeStyles = 
            item.displayType === 'QR_CODE' ? 'text-[#63b3ed] border-[#63b3ed]' :
            item.displayType === 'IMAGE_ONLY' ? 'text-[#9a75ff] border-[#9a75ff]' :
            item.displayType === 'TEXT_INFO' ? 'text-secondary border-secondary' :
            'text-[#ed8936] border-[#ed8936]';
            
        const iconName = 
            item.displayType === 'QR_CODE' ? 'qr_code' :
            item.displayType === 'IMAGE_ONLY' ? 'image' :
            item.displayType === 'TEXT_INFO' ? 'info' : 'checklist';

        return (
          <button
            key={item.id}
            ref={el => { if (el) subMenuRefs.current[index] = el }}
            onClick={() => {
              setSelectedItem(item);
              trackEvent('ITEM_VIEW', { itemId: item.id, name: item.name });
            }}
            className="flex-shrink-0 w-[24vw] h-[35vh] rounded-[24px] overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.02] glow-focus outline-none bg-gradient-to-br from-slate-800 to-slate-900"
          >
            {item.bgImage && (
              <img src={item.bgImage.startsWith('http') ? item.bgImage : `http://${window.location.hostname}:3000${item.bgImage}`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 flex flex-col justify-between p-[1.5vw] text-left">
              <div>
                <span className={`inline-block px-[0.8vw] py-[0.4vh] text-[0.7vw] font-bold rounded-full tracking-widest flex items-center gap-1 w-fit border bg-black/50 backdrop-blur-md ${typeStyles}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1vw' }}>{iconName}</span> {item.displayType.replace('_', ' ')}
                </span>
              </div>
              <div className="transform translate-y-[1vh] group-hover:translate-y-0 transition-transform duration-300">
                <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white drop-shadow-lg">{item.name}</h3>
                {item.subtitle && <p className="text-on-surface-variant text-[1vw] line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.subtitle}</p>}
              </div>
            </div>
          </button>
        )
    })
  }

  // Compute Welcome Message dynamically
  const getWelcomeMessage = () => {
    const currentTag = guestData.isCheckedIn ? (guestData.tag || 'Default') : 'Default';
    const bgs = appSettings.backgroundImages || [];
    let msg = '';
    
    // 1. Try to find message for current tag
    const tagMatch = bgs.find((bg:any) => bg.tag === currentTag);
    if (tagMatch && tagMatch.message && tagMatch.message.trim() !== '') {
      msg = tagMatch.message;
    } else {
      // 2. Fallback to default tag message
      const defaultMatch = bgs.find((bg:any) => bg.tag === 'Default');
      if (defaultMatch && defaultMatch.message && defaultMatch.message.trim() !== '') {
        msg = defaultMatch.message;
      } else {
        // 3. Ultimate fallback
        msg = guestData.isCheckedIn ? 'Experience unparalleled luxury tailored specifically for your stay, {name}.' : 'Please check in at the front desk to begin your luxurious stay.';
      }
    }
    
    // Replace {name} placeholder
    return msg.replace('{name}', guestData.name || 'Valued Guest');
  };

  const getBackgroundImage = () => {
    const currentTag = guestData.isCheckedIn ? (guestData.tag || 'Default') : 'Default';
    const bgs = appSettings.backgroundImages || [];
    
    // 1. Try to find background for current tag
    const tagMatch = bgs.find((bg:any) => bg.tag === currentTag);
    if (tagMatch && tagMatch.url && tagMatch.url.trim() !== '') {
      return tagMatch.url;
    }
    
    // 2. Fallback to default tag background
    const defaultMatch = bgs.find((bg:any) => bg.tag === 'Default');
    if (defaultMatch && defaultMatch.url && defaultMatch.url.trim() !== '') {
      return defaultMatch.url;
    }
    
    // 3. Ultimate fallback
    return 'bg-gradient-to-br from-slate-900 to-black';
  };

  const currentBgImage = getBackgroundImage();

  return (
    <div className="font-body-md text-on-surface">
      {appLoading && (
        <LoadingScreen 
          hotelName={appSettings.hotelName}
          hotelStars={appSettings.hotelStars}
          title={appSettings.title}
          subtitle={appSettings.subtitle}
          bgImage={currentBgImage}
        />
      )}
      
      {/* Background Cinematic Image */}
      <div 
        className={`fixed inset-0 z-0 ${currentBgImage.startsWith('bg-') ? currentBgImage : 'bg-black'}`}
        style={{ display: isPlayingLiveTV ? 'none' : 'block' }}
      >
        {!currentBgImage.startsWith('bg-') && (
          <img src={currentBgImage.startsWith('/') ? `http://${window.location.hostname}:3000${currentBgImage}` : currentBgImage} alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-100" />
        )}
        {/* Ambient protective gradient overlays for Option 2: Bottom-Left Layout readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none z-1"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/45 to-transparent pointer-events-none z-1"></div>
      </div>

      <main 
        className="fixed inset-0 w-full h-full flex flex-col z-10 overflow-hidden"
        style={{ display: isPlayingLiveTV ? 'none' : 'flex' }}
      >
        
        {/* Safe Area Container */}
        <div className="flex flex-col flex-1 px-[4vw] py-[3vh]">
           {/* Top App Bar */}
           <header
             className="flex justify-between items-start transition-opacity duration-500"
             style={{ opacity: activeMenu ? 0 : 1 }}
           >
             <div className="flex flex-col gap-[0.5vh]">
               <div className="flex items-baseline gap-[1.5vw] mb-[0.5vh]">
                 <h1 className="font-display-lg text-[3.5vw] text-secondary tracking-widest leading-none">{appSettings.portalMainTitle ? appSettings.portalMainTitle.toUpperCase() : 'LUXE'}</h1>
                 <p className="font-label-sm text-[0.9vw] text-secondary tracking-[0.2em] uppercase opacity-70">{appSettings.portalSubtitle || 'Concierge'}</p>
               </div>
               <div className="flex items-center gap-[2vw]">
                 <span className="flex items-center gap-[0.5vw] text-on-surface-variant text-[1.2vw]">
                   <span className="material-symbols-outlined text-secondary" style={{ fontSize: '1.8vw' }}>wb_sunny</span>
                   72°F Sunny
                 </span>
                 <span className="w-[0.4vw] h-[0.4vw] rounded-full bg-outline-variant"></span>
                 <span className="flex items-center gap-[0.5vw] text-on-surface-variant text-[1.2vw]">
                   <span className="material-symbols-outlined text-secondary" style={{ fontSize: '1.8vw' }}>schedule</span>
                   {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                 </span>
               </div>
             </div>

              {/* Style 1: Royal Gold & Champagne Guest Card */}
              <div className="flex items-center gap-[1.5vw] transition-all">
                <div className="text-right flex flex-col items-end">
                  {guestData.isCheckedIn && (
                    <span className="inline-flex items-center gap-[0.3vw] px-[0.8vw] py-[0.3vh] text-[0.75vw] font-extrabold tracking-widest text-[#0a0c0c] bg-gradient-to-r from-[#ffdea5] via-[#e9c176] to-[#b89047] rounded-md uppercase shadow-lg mb-[0.5vh]">
                      <span className="material-symbols-outlined text-[1vw] text-black">star</span>
                      {guestData.tag || 'VIP GOLD MEMBER'}
                    </span>
                  )}
                  <p className="font-sans text-[0.95vw] text-white/80 font-normal tracking-[0.05em] mt-[0.5vh]">
                    Room {roomNumber}
                  </p>
                </div>
                <div className="w-[5vw] h-[5vw] rounded-full border-2 border-[#e9c176] bg-gradient-to-br from-[#e9c176]/20 to-black/80 flex items-center justify-center shadow-[0_0_20px_rgba(233,193,118,0.25)] transition-all" style={{ opacity: guestData.isCheckedIn ? 1 : 0.4 }}>
                  <span className="material-symbols-outlined text-[#e9c176]" style={{ fontSize: '2.2vw' }}>crown</span>
                </div>
              </div>
           </header>

           {/* Central Welcome Message - Option 2: Bottom-Left Layout (Style 1: Royal Gold & Champagne) */}
           <div
             className="flex-1 flex flex-col items-start justify-end text-left transition-opacity duration-500 pb-[4vh] z-10"
             style={{ opacity: activeMenu ? 0 : 1 }}
           >
             <span className="font-sans font-extralight text-[1.8vw] tracking-[0.25em] text-white/90 mb-[4px] uppercase" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {guestData.isCheckedIn ? 'WELCOME' : 'WELCOME TO'}
             </span>
             <h2 className="text-[8.5vw] font-normal text-[#e9c176] leading-[0.95] mb-[10px] drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]" style={{ fontFamily: "'Pinyon Script', cursive", paddingRight: "0.5vw" }}>
                {guestData.isCheckedIn && guestData.name ? guestData.name : `${appSettings.portalMainTitle || 'S31'} Sukumvit`}
             </h2>
             <p className="font-sans text-[1.4vw] text-white/80 max-w-[46vw] font-light leading-relaxed border-t border-white/10 pt-[15px]">
                {(() => {
                  const rawMsg = getWelcomeMessage();
                  const guestName = guestData.isCheckedIn && guestData.name ? guestData.name : 'Valued Guest';
                  let subtext = rawMsg;
                  if (guestData.isCheckedIn && guestData.name) {
                    // Clean up the text by removing the name and dangling commas
                    subtext = rawMsg
                      .replace(guestName, '')
                      .replace(/Dear\s*,?\s*/i, '')
                      .replace(/,\s*\./g, '.')
                      .replace(/\s+,/g, ',')
                      .replace(/\s{2,}/g, ' ')
                      .trim();
                    if (subtext.startsWith(',')) subtext = subtext.substring(1).trim();
                  }
                  return subtext || 'We are deeply honored by your presence. Experience unparalleled luxury tailored specifically for your stay.';
                })()}
             </p>
           </div>
        </div>

        {/* ─── SCROLLING ANNOUNCEMENT TICKER (MARQUEE) ─── */}
        <div 
          className={`w-full backdrop-blur-md border-t border-b overflow-hidden flex items-center transition-all duration-500 ${marquee.type === 'alert' ? 'bg-gradient-to-r from-[#1f1104]/80 via-[#45270b]/80 to-[#1f1104]/80 border-[#c9a84c]/30 shadow-[0_0_20px_rgba(201,168,76,0.25)]' : 'bg-black/40 border-white/5'}`}
          style={{ height: '6vh', opacity: activeMenu ? 0 : 1 }}
        >
          <div className={`animate-marquee font-label-lg font-semibold drop-shadow-lg ${marquee.type === 'alert' ? 'text-[#fde68a]' : 'text-white'}`} style={{ fontSize: '1.4vw', letterSpacing: marquee.type === 'alert' ? '0.05em' : 'normal' }}>
            {marquee.type === 'alert' && <span className="mr-4 material-symbols-outlined align-middle animate-pulse text-[#fbbf24]">campaign</span>}
            {marquee.message}
          </div>
        </div>

        {/* Horizontal Bottom Navigation Bar */}
        <div
          className="flex items-center justify-center gap-[1.5vw] py-[2vh] overflow-x-auto no-scrollbar transition-opacity duration-500 bg-gradient-to-t from-black/60 to-transparent"
          style={{ opacity: activeMenu ? 0 : 1 }}
        >
          {[
            { id: 'Channel TV', icon: 'tv', label: 'Channel TV' },
            { id: 'Entertainment', icon: 'styler', label: 'Entertainment' },
            { id: 'Services', icon: 'room_service', label: 'Services' },
            { id: 'Dining', icon: 'restaurant', label: 'Dining' },
            { divider: true },
            { id: 'Messages', icon: 'mail', label: 'Messages', badge: inboxMessages.length > 0 ? String(inboxMessages.length) : undefined },
            { id: 'Local Guide', icon: 'explore', label: 'Local Guide', badge: 'NEW' }
          ].map((item, index) => {
            if (item.divider) {
              return <div key={`divider-${index}`} className="w-px bg-white/20 mx-[0.5vw]" style={{ height: '6vh' }}></div>
            }

            return (
              <button
                key={item.id}
                ref={el => { if (el) mainMenuRefs.current[index] = el }}
                onClick={() => {
                  setActiveMenu(item.id!);
                  trackEvent('MENU_CLICK', { menu: item.id });
                }}
                onKeyDown={(e) => {
                  // Implement wrap-around looping for main menu
                  if (e.key === 'ArrowRight' && index === 6) {
                    e.preventDefault();
                    mainMenuRefs.current[0]?.focus();
                  } else if (e.key === 'ArrowLeft' && index === 0) {
                    e.preventDefault();
                    mainMenuRefs.current[6]?.focus();
                  }
                }}
                className="nav-item-glow group relative flex flex-col items-center gap-[0.8vh] transition-all duration-300 rounded-xl hover:bg-white/10 focus:bg-white/10"
                style={{ padding: '1.5vh 2vw', minWidth: '9vw' }}
              >
                <div
                  className={`flex items-center justify-center rounded-full border border-white/20 group-hover:border-secondary group-hover:text-secondary group-focus:border-secondary group-focus:text-secondary transition-colors ${item.id === 'Local Guide' ? 'border-secondary text-secondary' : 'text-white'}`}
                  style={{ width: '5vw', height: '5vw' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '2.2vw' }}>{item.icon}</span>
                </div>
                <span
                  className={`font-label-lg transition-colors whitespace-nowrap ${item.id === 'Local Guide' ? 'text-secondary' : 'text-white group-hover:text-secondary group-focus:text-secondary'}`}
                  style={{ fontSize: '1.1vw' }}
                >
                  {item.label}
                </span>
                {item.badge && (
                   <div className={`absolute flex items-center justify-center top-[1vh] right-[1vw] font-bold ${item.id === 'Messages' ? 'bg-red-600 text-white rounded-full w-[1.2vw] h-[1.2vw] -mt-[0.5vh] -mr-[0.5vw]' : 'bg-secondary text-black rounded-md px-[0.4vw] py-[0.1vh]'}`} style={{ fontSize: item.id === 'Messages' ? '0.7vw' : '0.7vw', letterSpacing: item.id === 'Messages' ? '0' : '0.05em' }}>
                      {item.badge}
                   </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer Help Prompt */}
        <footer
          className="flex justify-between items-center border-t border-white/10 transition-opacity duration-500 bg-black/50 backdrop-blur-sm"
          style={{ opacity: activeMenu ? 0 : 1, padding: '1.5vh 4vw' }}
        >
          <div className="flex items-center gap-[1vw]">
            <div className="flex items-center justify-center rounded-full bg-secondary/10 text-secondary border border-secondary/20" style={{ width: '2.5vw', height: '2.5vw' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2vw' }}>info</span>
            </div>
            <p className="font-body-md text-on-surface-variant" style={{ fontSize: '1.1vw' }}>
              Use the <span className="text-secondary font-bold">Directional Keys</span> to explore and <span className="text-secondary font-bold">OK</span> to select.
            </p>
          </div>
        </footer>

        {/* ── Sub-menu Overlay ── */}
        {activeMenu && (
          <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-md flex flex-col transition-all duration-300" style={{ padding: '6vh 4vw' }}>
            
            <button
              onClick={() => setActiveMenu(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  subMenuRefs.current[0]?.focus();
                }
              }}
              className="w-fit flex items-center gap-[0.8vw] bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 hover:border-secondary hover:text-secondary transition-all mb-[3vh] outline-none focus:border-secondary focus:text-secondary"
              style={{ padding: '1vh 1.5vw' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.6vw' }}>arrow_back</span>
              <span className="font-label-lg" style={{ fontSize: '1.2vw' }}>Back</span>
            </button>

            {['Services', 'Dining', 'Local Guide'].includes(activeMenu) ? (
              // --- HORIZONTAL LAYOUT ---
              <div className="flex flex-col flex-1 min-h-0">
                <div className="mb-[4vh] flex-none">
                  <h2 className="font-display-lg text-[4vw] mb-4 text-white leading-tight">
                    {activeMenu === 'Services' ? 'Hotel Services' : activeMenu}
                  </h2>
                  <div className="w-[6vw] h-1 bg-secondary mb-[2vh]"></div>
                  <p className="text-[1.4vw] text-outline leading-relaxed max-w-[60%]">
                    {activeMenu === 'Services' ? 'Curated experiences designed for your absolute comfort. From world-class spa treatments to hospitality services.' : 
                     activeMenu === 'Dining' ? 'Explore our signature dining options, from in-room delivery to Michelin-starred restaurants.' :
                     'Discover the best local attractions, shopping, and transit options around the hotel.'}
                  </p>
                </div>
                <div className="flex gap-[2vw] overflow-x-auto no-scrollbar pb-[5vh] items-stretch flex-1">
                  {activeMenu === 'Dining' && renderSubMenuHorizontalCards(diningMenu)}
                  {activeMenu === 'Services' && renderSubMenuHorizontalCards(servicesMenu)}
                  {activeMenu === 'Local Guide' && renderSubMenuHorizontalCards(guideMenu)}
                </div>
              </div>
            ) : (
              // --- VERTICAL LAYOUT ---
              <div className="flex flex-1 min-h-0 gap-[4vw]">
                <div className="w-[35%] flex flex-col justify-center pr-[2vw] pb-[10vh]">
                  <h2 className="font-display-lg text-[4vw] mb-4 text-white leading-tight">{activeMenu}</h2>
                  <div className="w-[6vw] h-1 bg-secondary mb-[2vh]"></div>
                  <p className="text-[1.4vw] text-outline leading-relaxed">
                     Select an option to view details or press BACK to return to the home screen.
                  </p>
                </div>

                <div className="w-[65%] flex flex-col gap-[2vh] overflow-y-auto no-scrollbar pb-[10vh] items-center px-[1vw]">
                  {/* Live TV Channels */}
                  {activeMenu === 'Channel TV' && liveChannels.length === 0 && (
                    <div className="col-span-full py-10 text-center text-outline font-label-lg">
                      No channels available at the moment.
                    </div>
                  )}
                  {activeMenu === 'Channel TV' && liveChannels.map((channel, idx) => (
                    <button
                      key={channel.id}
                      ref={el => { if (el) subMenuRefs.current[idx] = el }}
                      onClick={() => {
                        const validChannels = liveChannels.filter(c => c.streamUrl);
                        const i = validChannels.findIndex(c => c.id === channel.id);
                        if (i !== -1) {
                          setCurrentChannelIndex(i);
                          setIsPlayingLiveTV(true);
                        }
                      }}
                      className="flex-shrink-0 w-full h-[22vh] rounded-2xl overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.01] glow-focus outline-none bg-gradient-to-br from-slate-800 to-slate-900"
                    >
                      {channel.bgImage ? (
                        <img src={channel.bgImage.startsWith('http') ? channel.bgImage : `http://${window.location.hostname}:3000${channel.bgImage}`} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-40 group-hover:opacity-60 transition-opacity duration-300" />
                      ) : (
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#1E293B] to-[#0F172A] opacity-90 group-hover:opacity-100 transition-opacity duration-300"></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-overlay-x flex items-center p-[2vw] text-left gap-[2vw]">
                        <div className={`w-[8vw] h-[8vw] bg-surface-container rounded-xl flex items-center justify-center text-white font-bold text-[2vw] shadow-2xl flex-shrink-0 overflow-hidden`}>
                          {channel.logoUrl ? (
                            <img src={channel.logoUrl.startsWith('http') ? channel.logoUrl : `http://${window.location.hostname}:3000${channel.logoUrl}`} alt={channel.name} className="w-full h-full object-contain p-2" />
                          ) : (
                            channel.name.substring(0,3).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1">
                          <span className="inline-block px-[1vw] py-[0.5vh] bg-secondary text-black text-[0.8vw] font-bold rounded-full mb-[1vh] tracking-widest flex items-center gap-1 w-fit"><span className="material-symbols-outlined" style={{fontSize:'1vw'}}>tv</span> CH {channel.channelNumber !== null && channel.channelNumber < 10 ? '0'+channel.channelNumber : channel.channelNumber || '-'}</span>
                          <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white">{channel.name}</h3>
                        </div>
                      </div>
                    </button>
                  ))}
                  
                  {activeMenu === 'Entertainment' && appsMenu.length === 0 && (
                    <div className="col-span-full py-10 text-center text-outline font-label-lg">
                      No streaming apps available.
                    </div>
                  )}
                  {activeMenu === 'Entertainment' && appsMenu.map((app, idx) => (
                    <button
                      key={app.id}
                      ref={el => { if (el) subMenuRefs.current[idx] = el }}
                      onClick={() => {
                        if (app.deepLink && (window as any).AndroidTV) {
                          // Try launching via deepLink intent or package name
                          if (app.deepLink.startsWith('intent://') || app.deepLink.includes('://')) {
                            // Needs native handling for complex intents, but package name works as fallback
                            (window as any).AndroidTV.launchApp(app.packageName);
                          } else {
                            (window as any).AndroidTV.launchApp(app.packageName);
                          }
                        } else if (app.packageName && (window as any).AndroidTV) {
                          (window as any).AndroidTV.launchApp(app.packageName);
                        } else {
                          console.log("Would launch:", app.packageName);
                        }
                        trackEvent('APP_OPEN', { appName: app.name, packageName: app.packageName });
                      }}
                      className="flex-shrink-0 w-full h-[22vh] rounded-2xl overflow-hidden relative group border-2 border-transparent transition-all duration-300 hover:scale-[1.01] glow-focus outline-none"
                    >
                      {app.bgImage ? (
                        <img src={app.bgImage.startsWith('http') ? app.bgImage : `http://${window.location.hostname}:3000${app.bgImage}`} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-40 group-hover:opacity-60 transition-opacity duration-300" />
                      ) : (
                        <div className={`absolute inset-0 w-full h-full bg-slate-800 opacity-40 group-hover:opacity-60 transition-opacity duration-300`}></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-overlay-x flex items-center p-[2vw] text-left gap-[2vw]">
                        <div className={`w-[8vw] h-[8vw] bg-surface-container rounded-2xl flex items-center justify-center text-white font-bold text-[3vw] shadow-2xl flex-shrink-0 overflow-hidden`}>
                          {app.iconUrl ? (
                            <img src={app.iconUrl.startsWith('http') ? app.iconUrl : `http://${window.location.hostname}:3000${app.iconUrl}`} alt={app.name} className="w-full h-full object-contain p-2" />
                          ) : (
                            app.name.substring(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1">
                           <h3 className="font-display-lg text-[2.5vw] leading-tight mb-[0.5vh] text-white">{app.name}</h3>
                           <p className="text-on-surface-variant text-[1vw] line-clamp-1">{app.packageName}</p>
                        </div>
                      </div>
                    </button>
                  ))}

                  {activeMenu === 'Messages' && (
                    <div className="w-full h-full flex flex-col items-center p-[4vw]">
                      <h2 className="font-display-lg text-white text-[3vw] mb-[4vh] flex items-center gap-[1vw] w-full max-w-3xl">
                        <span className="material-symbols-outlined text-secondary" style={{ fontSize: '3.5vw' }}>mail</span>
                        Inbox Messages
                      </h2>
                      
                      {inboxMessages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                          <span className="material-symbols-outlined text-white mb-[2vh]" style={{ fontSize: '6vw' }}>inbox_customize</span>
                          <p className="text-white text-[1.5vw] font-light">No new messages</p>
                          <button ref={el => { subMenuRefs.current[0] = el; }} onClick={() => setActiveMenu(null)} className="rounded-full bg-white/10 px-[3vw] py-[1.5vh] mt-[4vh] focus:border-secondary focus:bg-white/20 outline-none border border-transparent text-white font-bold transition-all hover:bg-white/20">Go Back</button>
                        </div>
                      ) : (
                        <div className="flex-1 w-full max-w-3xl overflow-y-auto space-y-[2vh] pr-[2vw]">
                          {inboxMessages.map((msg, idx) => (
                            <button 
                              key={msg.id}
                              ref={el => { if (el) subMenuRefs.current[idx] = el }}
                              onClick={() => {
                                setInboxMessages(prev => prev.filter(m => m.id !== msg.id));
                                if (inboxMessages.length === 1) {
                                  setTimeout(() => subMenuRefs.current[0]?.focus(), 50);
                                }
                              }}
                              className="w-full bg-black/60 border border-white/20 p-[2vw] rounded-3xl flex items-start justify-between text-left transition-all focus:border-secondary focus:scale-[1.02] hover:bg-black/80 hover:border-white/40 outline-none group shadow-lg"
                            >
                              <div className="flex-1">
                                <div className="text-secondary text-[1vw] mb-[1vh] font-bold tracking-widest uppercase flex items-center gap-[0.5vw]">
                                    <span className="material-symbols-outlined" style={{ fontSize: '1.2vw' }}>schedule</span>
                                    {msg.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                                <p className="text-white text-[1.5vw] font-light leading-relaxed">{msg.text}</p>
                              </div>
                              <div className="ml-[3vw] flex-shrink-0 flex flex-col items-center justify-center gap-2">
                                <div className="flex items-center justify-center bg-white/10 group-focus:bg-secondary group-focus:text-black group-hover:bg-secondary group-hover:text-black rounded-full w-[3.5vw] h-[3.5vw] text-white transition-colors shadow-md">
                                  <span className="material-symbols-outlined" style={{ fontSize: '1.8vw' }}>done</span>
                                </div>
                                <span className="text-[0.8vw] text-white/50 group-focus:text-white group-hover:text-white uppercase tracking-widest">Dismiss</span>
                              </div>
                            </button>
                          ))}
                          <div className="flex justify-center pt-[2vh]">
                            <button ref={el => { subMenuRefs.current[inboxMessages.length] = el; }} onClick={() => setActiveMenu(null)} className="rounded-full bg-white/10 px-[3vw] py-[1.5vh] focus:border-secondary focus:bg-white/20 outline-none border border-transparent text-white font-bold transition-all hover:bg-white/20">Go Back</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeMenu === 'Settings' && (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-50" style={{ padding: '15vh 0' }}>
                      <span className="material-symbols-outlined text-secondary" style={{ fontSize: '6vw', marginBottom: '2vh' }}>construction</span>
                      <h3 className="font-display-lg text-white" style={{ fontSize: '3vw', marginBottom: '1vh' }}>Under Construction</h3>
                      <button ref={el => { subMenuRefs.current[0] = el; }} onClick={() => setActiveMenu(null)} className="rounded-full bg-white/10 px-[2vw] py-[1vh] mt-[2vh] focus:border-secondary focus:bg-white/20 outline-none border border-transparent">Go Back</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Modal Overlay ── */}
        {selectedItem && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300">
             {renderModalContent()}
          </div>
        )}

      </main>

      {/* ── Live TV Player Overlay ── */}
      {isPlayingLiveTV && (
        <LiveTVPlayer
          channels={liveChannels.filter(c => c.streamUrl).map(c => ({
            id: c.id,
            name: c.name,
            number: c.channelNumber || 0,
            streamUrl: c.streamUrl!,
            logoUrl: c.logoUrl,
            category: c.category ?? 'Live TV',
          }))}
          initialChannelIndex={currentChannelIndex}
          onExit={() => setIsPlayingLiveTV(false)}
        />
      )}

      {/* ── Alert Modal Overlay ── */}
      {alertModal.active && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[4px] flex justify-center items-center p-8 animate-in fade-in duration-300">
          <div className="liquid-glass w-[40vw] max-w-2xl rounded-[28px] p-[6vh_3vw] text-center animate-in zoom-in-95 duration-500 shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto">
            
            {/* Premium Icon/Badge */}
            <div className="mx-auto w-[6vw] h-[6vw] rounded-full border border-[#e9c176]/40 bg-[#e9c176]/5 flex items-center justify-center mb-[3vh] shadow-[0_0_20px_rgba(233,193,118,0.15)] relative">
              <div className="absolute inset-0 rounded-full border border-[#e9c176]/20 animate-ping" style={{ animationDuration: '3s' }}></div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[3vw] w-[3vw] text-[#e9c176]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>

            {/* Title */}
            <h2 className="font-display-lg text-[2.5vw] text-white mb-[1.5vh] tracking-wide uppercase">
              Important Announcement
            </h2>

            {/* Message Content */}
            <p className="text-gray-300 font-light text-[1.2vw] tracking-[0.03em] leading-relaxed mb-[4vh] opacity-90 whitespace-pre-wrap">
                {alertModal.message}
            </p>

            {/* Actions */}
            <div className="flex gap-[1.5vw] w-full justify-center">
                <button 
                  ref={el => { alertModalRef.current[0] = el; }}
                  onClick={() => {
                    setAlertModal(prev => ({ ...prev, active: false }));
                    setInboxMessages(prev => [{ id: Date.now().toString(), text: alertModal.message, time: new Date() }, ...prev]);
                  }}
                  className="btn-ghost w-1/2 py-[1.5vh] rounded-xl font-bold tracking-widest uppercase text-[1vw]"
                >
                    Remind Later
                </button>
                <button 
                  ref={el => { alertModalRef.current[1] = el; }}
                  onClick={() => setAlertModal(prev => ({ ...prev, active: false }))}
                  className="btn-premium w-1/2 py-[1.5vh] rounded-xl font-bold tracking-widest uppercase text-[1vw]"
                >
                    Dismiss
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
