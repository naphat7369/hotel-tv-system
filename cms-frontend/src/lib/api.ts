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
  channelNumber?: number | null;
  isActive: boolean;
  sortOrder?: number | null;
}

export interface ServiceItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  status: 'Available' | 'Sold Out';
}

export interface ServiceCategory {
  id: string;
  name: string;
  timeRange: string;
  items: ServiceItem[];
}

// Generate 500 mock devices
const generateMockDevices = (): Device[] => {
  const devices: Device[] = [];
  const floors = 10;
  const roomsPerFloor = 50;

  for (let f = 1; f <= floors; f++) {
    for (let r = 1; r <= roomsPerFloor; r++) {
      const roomNum = `${f}${r.toString().padStart(2, '0')}`;
      const isOffline = Math.random() < 0.1;
      const isMaintenance = !isOffline && Math.random() < 0.05;
      
      let status: DeviceStatus = 'Online';
      if (isOffline) status = 'Offline';
      if (isMaintenance) status = 'Maintenance';

      devices.push({
        id: `dev_${roomNum}`,
        roomNumber: roomNum,
        ipAddress: `192.168.10.${Math.floor(Math.random() * 255)}`,
        status,
        lastActive: new Date(Date.now() - Math.random() * 10000000).toISOString(),
      });
    }
  }
  return devices;
};

// In-memory mock database
let mockDevices = generateMockDevices();

export interface StreamingApp {
  id: string;
  name: string;
  category: string;
  status: 'Active' | 'Warning' | 'Inactive';
  engagement: number;
}

// Removed mockChannels

let mockApps: StreamingApp[] = [
  { id: 'a1', name: 'Netflix', category: 'Streaming', status: 'Active', engagement: 52 },
  { id: 'a2', name: 'YouTube', category: 'Streaming', status: 'Active', engagement: 35 },
  { id: 'a3', name: 'Disney+', category: 'Streaming', status: 'Active', engagement: 13 },
];

let mockServices: ServiceCategory[] = [
  {
    id: 'cat1',
    name: 'Breakfast',
    timeRange: '06:00 - 10:30',
    items: [
      { id: 'item1', categoryId: 'cat1', name: 'American Breakfast Set', price: 350, status: 'Available' },
      { id: 'item2', categoryId: 'cat1', name: 'Continental Breakfast', price: 280, status: 'Available' },
    ]
  },
  {
    id: 'cat2',
    name: 'All-Day Dining',
    timeRange: '11:00 - 23:00',
    items: [
      { id: 'item3', categoryId: 'cat2', name: 'Pad Thai Goong Sod', price: 250, status: 'Available' },
      { id: 'item4', categoryId: 'cat2', name: 'Club Sandwich', price: 220, status: 'Sold Out' },
    ]
  }
];

// Helper to simulate network latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // DASHBOARD
  getDashboardStats: async () => {
    await delay(300);
    const onlineDevices = mockDevices.filter(d => d.status === 'Online').length;
    return {
      activeDevices: onlineDevices,
      totalDevices: mockDevices.length,
      avgWatchTime: 3.2,
      roomServiceOrders: 142,
      topChannels: [],
      topApps: mockApps.sort((a, b) => b.engagement - a.engagement).slice(0, 3)
    };
  },

  // DEVICES
  getDevices: async (
    page: number = 1,
    limit: number = 20,
    filterStatus: DeviceStatus | 'All' = 'All',
    sortBy: 'roomNumber' | 'status' | 'ipAddress' | 'lastActive' = 'roomNumber',
    sortDesc: boolean = false
  ) => {
    await delay(400);
    let filtered = mockDevices;
    if (filterStatus !== 'All') {
      filtered = filtered.filter(d => d.status === filterStatus);
    }
    
    filtered.sort((a, b) => {
      let cmp = 0;
      if (a[sortBy] < b[sortBy]) cmp = -1;
      if (a[sortBy] > b[sortBy]) cmp = 1;
      return sortDesc ? -cmp : cmp;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  },

  updateDeviceStatus: async (id: string, newStatus: DeviceStatus) => {
    await delay(300);
    mockDevices = mockDevices.map(d => d.id === id ? { ...d, status: newStatus } : d);
    return true;
  },

  // CHANNELS (Real Backend Integration)
  getChannels: async () => {
    const res = await fetch(`http://${window.location.hostname}:3000/api/v1/channels`);
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

  // APPS (Real Backend Integration)
  getApps: async () => {
    const res = await fetch('http://localhost:3000/api/v1/apps');
    if (!res.ok) throw new Error('Failed to fetch apps');
    return res.json();
  },

  uploadApp: async (file: File) => {
    const formData = new FormData();
    formData.append('apkFile', file);
    const res = await fetch('http://localhost:3000/api/v1/apps/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload app');
    return res.json();
  },

  deleteApp: async (filename: string) => {
    const res = await fetch(`http://localhost:3000/api/v1/apps/${filename}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete app');
    return res.json();
  },

  pushInstallToAll: async (apkUrl: string) => {
    const res = await fetch('http://localhost:3000/api/v1/mdm/devices');
    const devices = await res.json();
    for (const d of devices) {
      if (d.isOnline) {
        await fetch(`http://localhost:3000/api/v1/mdm/devices/${d.deviceId}/command`, {
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

  // SERVICES
  getServices: async () => {
    await delay(300);
    // Deep clone to simulate server fetch
    return JSON.parse(JSON.stringify(mockServices)) as ServiceCategory[];
  },

  addServiceItem: async (categoryId: string, item: Omit<ServiceItem, 'id' | 'categoryId'>) => {
    await delay(300);
    const newItem: ServiceItem = {
      ...item,
      id: `item_${Date.now()}`,
      categoryId
    };
    mockServices = mockServices.map(cat => {
      if (cat.id === categoryId) {
        return { ...cat, items: [...cat.items, newItem] };
      }
      return cat;
    });
    return newItem;
  },

  deleteServiceItem: async (categoryId: string, itemId: string) => {
    await delay(300);
    mockServices = mockServices.map(cat => {
      if (cat.id === categoryId) {
        return { ...cat, items: cat.items.filter(i => i.id !== itemId) };
      }
      return cat;
    });
    return true;
  }
};
