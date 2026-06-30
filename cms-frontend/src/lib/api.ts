// Mock API Layer for Hotel TV CMS

export type DeviceStatus = 'Online' | 'Offline' | 'Maintenance';

export interface Device {
  id: string;
  roomNumber: string;
  ipAddress: string;
  status: DeviceStatus;
  lastActive: string;
}

export interface Channel {
  id: string;
  name: string;
  category: string;
  streamUrl?: string | null;
  logoUrl?: string | null;
  bgImage?: string | null;
  channelNumber?: number | null;
  isActive: boolean;
  sortOrder?: number | null;
  inputProtocol?: string | null;
  inputIp?: string | null;
  inputPort?: number | null;
  inputEth?: string | null;
  outputProtocol?: string | null;
  outputIp?: string | null;
  outputPort?: number | null;
  outputEth?: string | null;
}

export interface ServiceItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  status: 'Available' | 'Sold Out';
}

export interface StreamingApp {
  id: string;
  name: string;
  packageName?: string | null;
  iconUrl?: string | null;
  bgImage?: string | null;
  deepLink?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceCategory {
  id: string;
  name: string;
  timeRange: string;
  items: ServiceItem[];
}

export type DisplayType = 'IMAGE_ONLY' | 'QR_CODE' | 'TEXT_INFO' | 'SERVICE_REQUEST';

export interface GuestMenuItem {
  id: string;
  hotelId: string;
  section: 'services' | 'dining' | 'local_guide';
  name: string;
  subtitle?: string | null;
  icon?: string | null;
  color?: string | null;
  displayType: DisplayType;
  displayContent: string;
  bgImage?: string | null;
  sortOrder: number;
  isActive: boolean;
  activeFrom?: string | null;
  activeUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// No mock devices anymore

// Helper to simulate network latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // DASHBOARD — real data from backend
  getDashboardStats: async () => {
    // This is legacy, the dashboard now uses getAnalyticsOverview
    return {
      activeDevices: 0,
      totalDevices: 0,
      avgWatchTime: 0,
      roomServiceOrders: 0,
      topChannels: [],
      topApps: []
    };
  },

  // ANALYTICS OVERVIEW — real data from backend
  getAnalyticsOverview: async () => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/analytics/overview`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch analytics overview');
    return res.json() as Promise<{
      devices: {
        online: number;
        offline: number;
        total: number;
        list: Array<{
          deviceId: string;
          roomNumber: string;
          isOnline: boolean;
          ipAddress?: string;
          wifiSignal?: number;
          lastSeen: string;
          deviceName?: string;
        }>;
      };
      channels: {
        total: number;
        active: number;
        topChannels: Array<{ id: string; name: string; channelNumber: number | null; category: string | null; logoUrl: string | null }>;
      };
      requests: {
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
      };
      timestamp: string;
    }>;
  },

  // DEVICES (Real Backend Integration)
  getDevices: async (
    page: number = 1,
    limit: number = 20,
    filterStatus: DeviceStatus | 'All' = 'All',
    sortBy: 'roomNumber' | 'status' | 'ipAddress' | 'lastActive' = 'roomNumber',
    sortDesc: boolean = false
  ) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/mdm/devices`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch devices');
    const rawDevices: any[] = await res.json();
    
    let mappedDevices: Device[] = rawDevices.map(d => ({
      id: d.deviceId,
      roomNumber: d.roomNumber || 'Unassigned',
      ipAddress: d.ipAddress || '',
      status: d.isOnline ? 'Online' : 'Offline',
      lastActive: d.lastSeen
    }));

    if (filterStatus !== 'All') {
      mappedDevices = mappedDevices.filter(d => d.status === filterStatus);
    }
    
    mappedDevices.sort((a: any, b: any) => {
      let cmp = 0;
      if (a[sortBy] < b[sortBy]) cmp = -1;
      if (a[sortBy] > b[sortBy]) cmp = 1;
      return sortDesc ? -cmp : cmp;
    });

    const total = mappedDevices.length;
    const start = (page - 1) * limit;
    const data = mappedDevices.slice(start, start + limit);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    };
  },

  updateDeviceStatus: async (id: string, newStatus: DeviceStatus) => {
    // CMS does not update status directly, it's driven by WebSockets.
    return true;
  },

  // CHANNELS (Real Backend Integration)
  getChannels: async () => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch channels');
    return res.json() as Promise<Channel[]>;
  },

  updateChannel: async (id: string, data: Partial<Channel>) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update channel');
    return res.json();
  },
  
  deleteChannel: async (id: string) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete channel');
    return res.json();
  },

  addChannel: async (data: Partial<Channel>) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to add channel');
    return res.json() as Promise<Channel>;
  },

  uploadChannelLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels/upload-logo`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload logo');
    return res.json() as Promise<{ url: string }>;
  },

  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/upload/image`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload image');
    return res.json() as Promise<{ url: string }>;
  },

  getApps: async () => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/streaming-apps`);
    if (!res.ok) throw new Error('Failed to fetch streaming apps');
    return res.json() as Promise<StreamingApp[]>;
  },

  uploadApp: async (file: File) => {
    const formData = new FormData();
    formData.append('apkFile', file);
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/apps/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload app');
    return res.json();
  },

  deleteApp: async (id: string) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/streaming-apps/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete app');
    return res.json();
  },

  updateApp: async (id: string, data: Partial<StreamingApp>) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/streaming-apps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update app');
    return res.json() as Promise<StreamingApp>;
  },

  pushInstallToAll: async (apkUrl: string) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/mdm/devices`);
    const devices = await res.json();
    for (const d of devices) {
      if (d.isOnline) {
        await fetch(`http://${window.location.hostname}:3000/api/v1/mdm/devices/${d.deviceId}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'install_apk',
            payload: { url: apkUrl }
          })
        });
      }
    }
  },

  // SERVICES (Legacy mock removed)
  getServices: async () => {
    return [] as ServiceCategory[];
  },

  addServiceItem: async (categoryId: string, item: Omit<ServiceItem, 'id' | 'categoryId'>) => {
    return { ...item, id: `item_${Date.now()}`, categoryId };
  },

  deleteServiceItem: async (categoryId: string, itemId: string) => {
    return true;
  },

  // ── GUEST MENU ITEMS (Real Backend) ──
  getGuestMenuItems: async (section?: string) => {
    const url = section
      ? `http://${window.location.hostname}:3000/api/v1/services/menu-items?section=${section}`
      : `http://${window.location.hostname}:3000/api/v1/services/menu-items`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch menu items');
    return res.json() as Promise<GuestMenuItem[]>;
  },

  createGuestMenuItem: async (data: Omit<GuestMenuItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/services/menu-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create menu item');
    return res.json() as Promise<GuestMenuItem>;
  },

  updateGuestMenuItem: async (id: string, data: Partial<GuestMenuItem>) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/services/menu-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update menu item');
    return res.json() as Promise<GuestMenuItem>;
  },

  deleteGuestMenuItem: async (id: string) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/services/menu-items/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete menu item');
    return res.json();
  },

  uploadMenuImage: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/services/upload-image`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to upload image');
    return res.json() as Promise<{ url: string }>;
  },

  // ── SETTINGS ──

  getAnalyticsReports: async (days: number | 'all' = 7) => {
    const url = days === 'all' 
      ? `http://${window.location.hostname}:3000/api/v1/analytics/reports?days=0`
      : `http://${window.location.hostname}:3000/api/v1/analytics/reports?days=${days}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch analytics reports');
    return res.json();
  },

  getSettings: async () => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  updateSettings: async (formData: FormData) => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/settings`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  }
};

