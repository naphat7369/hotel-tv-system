import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { io, Socket } from 'socket.io-client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Tv,
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle,
  Radio,
  Users,
  ChevronUp,
  ChevronDown,
  Minus,
  Signal,
  Server,
  BarChart2,
  Table as TableIcon,
  Filter,
  Download,
  Utensils,
  ArrowRight
} from 'lucide-react';

type AnalyticsData = Awaited<ReturnType<typeof api.getAnalyticsOverview>>;
type TimeSlotPreset = 'all' | 'morning' | 'afternoon' | 'evening' | 'late_night' | 'custom';
type DashboardTab = 'system' | 'media' | 'services';

function SlotSummaryBanner({ slotSummary }: { slotSummary: any }) {
  if (!slotSummary) return null;
  const slotLabel = slotSummary.slot || `${String(slotSummary.startHour).padStart(2, '0')}:00 - ${String(slotSummary.endHour).padStart(2, '0')}:00`;
  const totalMinutes = slotSummary.totalWatchMinutes ?? slotSummary.totalWatchTimeMinutes ?? 0;

  return (
    <div className="mb-6 bg-gradient-to-r from-primary/10 via-surface-container-high to-surface-container border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary">Time Slot Filter</span>
            <span className="text-xs text-on-surface-variant">Asia/Bangkok (UTC+7)</span>
          </div>
          <p className="text-sm font-bold text-on-surface mt-0.5">
            Slot Range: <span className="text-primary">{slotLabel}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs sm:text-sm">
        <div className="bg-surface-container px-3.5 py-2 rounded-xl border border-outline-variant/60">
          <span className="text-on-surface-variant block text-xs font-medium">Total Watch Time in Slot</span>
          <span className="font-bold text-on-surface font-mono text-base">
            {totalMinutes.toLocaleString()} <span className="text-xs font-normal text-on-surface-variant">min</span>
          </span>
        </div>
        <div className="bg-surface-container px-3.5 py-2 rounded-xl border border-outline-variant/60">
          <span className="text-on-surface-variant block text-xs font-medium">Peak Traffic Hour</span>
          <span className="font-bold text-primary font-mono text-base">
            {slotSummary.peakHour !== null ? `${String(slotSummary.peakHour).padStart(2, '0')}:00` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalyticsToolbar({
  title,
  subtitle,
  icon,
  reportTimeFilter,
  setReportTimeFilter,
  timeSlotPreset,
  setTimeSlotPreset,
  customStartHour,
  setCustomStartHour,
  customEndHour,
  setCustomEndHour,
  reportViewMode,
  setReportViewMode,
  onExportCsv
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  reportTimeFilter: number | 'all';
  setReportTimeFilter: (val: number | 'all') => void;
  timeSlotPreset: TimeSlotPreset;
  setTimeSlotPreset: (val: TimeSlotPreset) => void;
  customStartHour: number;
  setCustomStartHour: (val: number) => void;
  customEndHour: number;
  setCustomEndHour: (val: number) => void;
  reportViewMode: 'chart' | 'table';
  setReportViewMode: (val: 'chart' | 'table') => void;
  onExportCsv: () => void;
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mt-2 mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">{title}</h2>
          <p className="text-xs text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Date Filter */}
        <div className="flex items-center bg-surface-container-high rounded-lg p-1 border border-outline-variant">
          <Filter className="w-4 h-4 text-on-surface-variant ml-2" />
          <select 
            className="bg-transparent border-none text-xs font-semibold text-on-surface focus:ring-0 cursor-pointer pl-1 pr-6 py-1"
            value={reportTimeFilter.toString()}
            onChange={(e) => setReportTimeFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
          >
            <option value="1" className="bg-surface-container text-on-surface">Last 24 Hours</option>
            <option value="7" className="bg-surface-container text-on-surface">Last 7 Days</option>
            <option value="30" className="bg-surface-container text-on-surface">Last 30 Days</option>
            <option value="all" className="bg-surface-container text-on-surface">All Time</option>
          </select>
        </div>

        {/* Time Slot Filter */}
        <div className="flex items-center bg-surface-container-high rounded-lg p-1 border border-outline-variant">
          <Clock className="w-4 h-4 text-on-surface-variant ml-2" />
          <select 
            className="bg-transparent border-none text-xs font-semibold text-on-surface focus:ring-0 cursor-pointer pl-1 pr-6 py-1"
            value={timeSlotPreset}
            onChange={(e) => setTimeSlotPreset(e.target.value as TimeSlotPreset)}
          >
            <option value="all" className="bg-surface-container text-on-surface">All Hours (24h)</option>
            <option value="morning" className="bg-surface-container text-on-surface">Morning (06:00 - 12:00)</option>
            <option value="afternoon" className="bg-surface-container text-on-surface">Afternoon (12:00 - 18:00)</option>
            <option value="evening" className="bg-surface-container text-on-surface">Evening (18:00 - 24:00)</option>
            <option value="late_night" className="bg-surface-container text-on-surface">Late Night (00:00 - 06:00)</option>
            <option value="custom" className="bg-surface-container text-on-surface">Custom Time...</option>
          </select>
        </div>

        {/* Custom Hours inputs */}
        {timeSlotPreset === 'custom' && (
          <div className="flex items-center gap-1.5 bg-surface-container-high rounded-lg px-2.5 py-1 border border-outline-variant text-xs">
            <span className="text-on-surface-variant font-medium">From</span>
            <select
              value={customStartHour}
              onChange={(e) => setCustomStartHour(parseInt(e.target.value))}
              className="bg-surface-container text-xs text-on-surface rounded px-1.5 py-0.5 border border-outline-variant/60"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span className="text-on-surface-variant font-medium">to</span>
            <select
              value={customEndHour}
              onChange={(e) => setCustomEndHour(parseInt(e.target.value))}
              className="bg-surface-container text-xs text-on-surface rounded px-1.5 py-0.5 border border-outline-variant/60"
            >
              {Array.from({ length: 25 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center bg-surface-container-high rounded-lg p-1 border border-outline-variant">
          <button
            onClick={() => setReportViewMode('chart')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              reportViewMode === 'chart' 
                ? 'bg-primary text-on-primary shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
            title="View Charts"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Charts
          </button>
          <button
            onClick={() => setReportViewMode('table')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              reportViewMode === 'table' 
                ? 'bg-primary text-on-primary shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
            title="View Tables"
          >
            <TableIcon className="w-3.5 h-3.5" />
            Tables
          </button>
        </div>

        {/* Export CSV Button */}
        <button
          onClick={onExportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant hover:bg-surface-container-highest text-xs font-semibold text-on-surface hover:text-primary transition-colors shadow-sm"
          title="Export analytics report to CSV"
        >
          <Download className="w-3.5 h-3.5 text-primary" />
          <span>Export CSV</span>
        </button>
      </div>
    </div>
  );
}

function SignalBars({ strength }: { strength?: number }) {
  const pct = strength ?? 0;
  const bars = [
    pct >= 20,
    pct >= 40,
    pct >= 60,
    pct >= 80,
  ];
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className={`flex items-end gap-[2px] ${color}`} title={`${pct}%`}>
      {bars.map((on, i) => (
        <div
          key={i}
          className={`rounded-sm transition-all ${on ? 'opacity-100' : 'opacity-20 bg-current'}`}
          style={{ width: 3, height: 4 + i * 3, background: on ? 'currentColor' : undefined }}
        />
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className={`relative bg-surface-container rounded-2xl p-5 border border-outline-variant overflow-hidden group hover:border-current transition-all duration-300 ${accent}`}>
      {/* Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-current" />
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl bg-current/10 ${accent}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' :
            trend === 'down' ? 'bg-red-500/10 text-red-400' :
            'bg-surface-container-high text-on-surface-variant'
          }`}>
            {trend === 'up' ? <ChevronUp className="w-3 h-3" /> : trend === 'down' ? <ChevronDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            Live
          </div>
        )}
      </div>
      <p className="text-xs font-semibold tracking-widest uppercase text-on-surface-variant mb-1">{label}</p>
      <p className="text-3xl font-bold text-on-surface leading-none">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-1.5">{sub}</p>}
    </div>
  );
}

function DeviceRow({ device, index }: { device: AnalyticsData['devices']['list'][0]; index: number }) {
  const timeSince = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/50 hover:bg-surface-container-high transition-colors group"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Status Dot */}
      <div className="relative flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${device.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
        {device.isOnline && (
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-60" />
        )}
      </div>

      {/* Room */}
      <div className="w-14 flex-shrink-0">
        <span className="text-xs font-bold text-on-surface-variant tracking-wider">RM</span>
        <span className="ml-1 text-sm font-bold text-on-surface">{device.roomNumber === 'Unassigned' ? '—' : device.roomNumber}</span>
      </div>

      {/* Device ID */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-on-surface font-mono truncate">{device.deviceName || device.deviceId}</p>
        <p className="text-xs text-on-surface-variant">{device.ipAddress || 'No IP'}</p>
      </div>

      {/* Signal */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <SignalBars strength={device.wifiSignal} />
        {device.wifiSignal !== undefined && (
          <span className="text-xs text-on-surface-variant">{device.wifiSignal}%</span>
        )}
      </div>

      {/* Last seen */}
      <div className="flex-shrink-0 text-right w-20">
        <span className={`text-xs ${device.isOnline ? 'text-emerald-400' : 'text-on-surface-variant'}`}>
          {device.isOnline ? 'Online' : timeSince(device.lastSeen)}
        </span>
      </div>
    </div>
  );
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('system');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [reports, setReports] = useState<any | null>(null);
  const [reportViewMode, setReportViewMode] = useState<'chart' | 'table'>('chart');
  const [reportTimeFilter, setReportTimeFilter] = useState<number | 'all'>('all');
  const [timeSlotPreset, setTimeSlotPreset] = useState<TimeSlotPreset>('all');
  const [customStartHour, setCustomStartHour] = useState<number>(8);
  const [customEndHour, setCustomEndHour] = useState<number>(12);
  const [servicesSubTab, setServicesSubTab] = useState<'all' | 'services' | 'dining'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const socketRef = useRef<Socket | null>(null);

  let startHour: number | undefined;
  let endHour: number | undefined;
  if (timeSlotPreset === 'morning') {
    startHour = 6;
    endHour = 12;
  } else if (timeSlotPreset === 'afternoon') {
    startHour = 12;
    endHour = 18;
  } else if (timeSlotPreset === 'evening') {
    startHour = 18;
    endHour = 24;
  } else if (timeSlotPreset === 'late_night') {
    startHour = 0;
    endHour = 6;
  } else if (timeSlotPreset === 'custom') {
    startHour = customStartHour;
    endHour = customEndHour;
  }

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const [overview, rep] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getAnalyticsReports(reportTimeFilter, startHour, endHour)
      ]);
      setData(overview);
      setReports(rep);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [reportTimeFilter, startHour, endHour]);

  useEffect(() => {
    fetchData();

    // Connect Socket.IO for real-time device updates
    const serverHost = `http://${window.location.hostname}:3000`;
    const socket = io(serverHost);
    socketRef.current = socket;

    socket.on('device_status_update', () => {
      // Silently refresh analytics when device list changes
      fetchData(true);
    });

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchData(true), 30000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [fetchData]);

  const filteredDevices = data?.devices.list.filter(d => {
    const matchSearch = !deviceSearch ||
      d.roomNumber.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.deviceId.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      (d.ipAddress || '').includes(deviceSearch) ||
      (d.deviceName || '').toLowerCase().includes(deviceSearch.toLowerCase());
    const matchFilter =
      deviceFilter === 'all' ||
      (deviceFilter === 'online' && d.isOnline) ||
      (deviceFilter === 'offline' && !d.isOnline);
    return matchSearch && matchFilter;
  }) ?? [];

  // Sort: online first, then by room number
  const sortedDevices = [...filteredDevices].sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.roomNumber.localeCompare(b.roomNumber);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-on-surface-variant">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading live data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-on-surface-variant">{error}</p>
        <button
          onClick={() => fetchData()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  const onlinePct = data && data.devices.total > 0
    ? Math.round((data.devices.online / data.devices.total) * 100)
    : 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Analytics Dashboard
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Live system status · Last updated{' '}
            <span className="text-primary font-medium">{lastRefresh.toLocaleTimeString()}</span>
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
            activeTab === 'system'
              ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
              : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>System & Live Devices</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'system' ? 'bg-black/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
          }`}>
            {data?.devices.online ?? 0}/{data?.devices.total ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('media')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
            activeTab === 'media'
              ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
              : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Media & Entertainment</span>
          {reports?.topChannels && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'media' ? 'bg-black/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
            }`}>
              {reports.topChannels.length} Channels
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
            activeTab === 'services'
              ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
              : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Services & Dining</span>
          {reports && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'services' ? 'bg-black/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
            }`}>
              {(reports.topServices?.length || 0) + (reports.topDining?.length || 0)} Items
            </span>
          )}
        </button>
      </div>

      {/* ── TAB 1: System & Live Devices ─────────────────────────────────── */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Wifi className="w-5 h-5" />}
              label="Online Devices"
              value={data?.devices.online ?? 0}
              sub={`${onlinePct}% of ${data?.devices.total ?? 0} total`}
              accent="text-emerald-400"
              trend="up"
            />
            <StatCard
              icon={<WifiOff className="w-5 h-5" />}
              label="Offline Devices"
              value={data?.devices.offline ?? 0}
              sub={data?.devices.offline === 0 ? 'All systems nominal' : 'Check device status'}
              accent={data?.devices.offline === 0 ? 'text-on-surface-variant' : 'text-red-400'}
              trend={data?.devices.offline === 0 ? 'neutral' : 'down'}
            />
            <StatCard
              icon={<Radio className="w-5 h-5" />}
              label="Active Channels"
              value={data?.channels.active ?? 0}
              sub={`${data?.channels.total ?? 0} total configured`}
              accent="text-blue-400"
              trend="neutral"
            />
            <StatCard
              icon={<CheckCircle className="w-5 h-5" />}
              label="Pending Requests"
              value={data?.requests.pending ?? 0}
              sub={`${data?.requests.total ?? 0} total · ${data?.requests.completed ?? 0} done`}
              accent={data?.requests.pending && data.requests.pending > 0 ? 'text-amber-400' : 'text-emerald-400'}
              trend={data?.requests.pending && data.requests.pending > 0 ? 'down' : 'neutral'}
            />
          </div>

          {/* Online Rate Bar */}
          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-on-surface-variant" />
                <span className="text-sm font-semibold text-on-surface">Device Health Overview</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{onlinePct}% Online</span>
            </div>
            <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${onlinePct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {data?.devices.online ?? 0} Online
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                {data?.devices.offline ?? 0} Offline
              </span>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Live Device Table - takes 2 cols */}
            <div className="xl:col-span-2 bg-surface-container rounded-2xl border border-outline-variant overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-on-surface">Live TV Boxes</h3>
                  <span className="ml-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full">
                    {data?.devices.total ?? 0}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search room / IP..."
                    value={deviceSearch}
                    onChange={e => setDeviceSearch(e.target.value)}
                    className="bg-surface-container-high border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary w-40 transition-all"
                  />
                  <select
                    value={deviceFilter}
                    onChange={e => setDeviceFilter(e.target.value as any)}
                    className="bg-surface-container-high border border-outline-variant rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="all">All</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              </div>

              <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
                {sortedDevices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant gap-3">
                    <Tv className="w-10 h-10 opacity-30" />
                    <p className="text-sm">
                      {data?.devices.total === 0
                        ? 'No TV boxes connected yet. They will appear here automatically when they connect.'
                        : 'No devices match your search.'}
                    </p>
                  </div>
                ) : (
                  sortedDevices.map((device, i) => (
                    <DeviceRow key={device.deviceId} device={device} index={i} />
                  ))
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-4">
              {/* Top Channels Preview */}
              <div className="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden flex-1">
                <div className="flex items-center justify-between p-5 border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-blue-400" />
                    <h3 className="font-bold text-on-surface">Configured Channels</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('media')}
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                  >
                    View Stats <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {!data?.channels.topChannels.length ? (
                    <p className="text-sm text-on-surface-variant text-center py-6 opacity-60">No channels configured</p>
                  ) : (
                    data.channels.topChannels.map((ch, i) => (
                      <div key={ch.id} className="flex items-center gap-3">
                        <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-on-surface-variant flex-shrink-0">
                          {ch.channelNumber ?? i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{ch.name}</p>
                          <p className="text-xs text-on-surface-variant">{ch.category || 'Uncategorized'}</p>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Request Summary */}
              <div className="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-on-surface">Room Service Requests</h3>
                  </div>
                  <Link
                    to="/requests"
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { label: 'Pending', value: data?.requests.pending ?? 0, color: 'bg-amber-400', textColor: 'text-amber-400' },
                    { label: 'In Progress', value: data?.requests.inProgress ?? 0, color: 'bg-blue-400', textColor: 'text-blue-400' },
                    { label: 'Completed', value: data?.requests.completed ?? 0, color: 'bg-emerald-400', textColor: 'text-emerald-400' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.color}`} />
                        <span className="text-sm text-on-surface-variant">{row.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${row.textColor}`}>{row.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-outline-variant pt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-on-surface">Total</span>
                    <span className="text-sm font-bold text-on-surface">{data?.requests.total ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Media & Entertainment ─────────────────────────────────── */}
      {activeTab === 'media' && reports && (
        <div className="space-y-6">
          <AnalyticsToolbar
            title="Media & Entertainment Analytics"
            subtitle="TV channels watch time, streaming app opens, and main menu category usage"
            icon={<Tv className="w-5 h-5" />}
            reportTimeFilter={reportTimeFilter}
            setReportTimeFilter={setReportTimeFilter}
            timeSlotPreset={timeSlotPreset}
            setTimeSlotPreset={setTimeSlotPreset}
            customStartHour={customStartHour}
            setCustomStartHour={setCustomStartHour}
            customEndHour={customEndHour}
            setCustomEndHour={setCustomEndHour}
            reportViewMode={reportViewMode}
            setReportViewMode={setReportViewMode}
            onExportCsv={() => api.exportAnalyticsReport(reportTimeFilter, startHour, endHour)}
          />

          <SlotSummaryBanner slotSummary={reports.slotSummary} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Channels by Watch Time - takes full width */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-on-surface">Top Channels by Total Watch Time</h3>
                  <p className="text-xs text-on-surface-variant">Live broadcast viewership ranked by duration</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {reports.topChannels?.length || 0} Channels Active
                </span>
              </div>
              {reports.topChannels?.length > 0 ? (
                <div className="h-64">
                  {reportViewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reports.topChannels.map((c:any) => ({...c, minutes: Math.round(c.duration/60)}))} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                        <YAxis hide />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                          itemStyle={{ color: '#e4e4e7' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="minutes" radius={[4, 4, 0, 0]} minPointSize={5}>
                          {reports.topChannels.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#eab308', '#f97316', '#ef4444', '#8b5cf6', '#3b82f6'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-auto h-full pr-2">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-on-surface-variant uppercase bg-surface-container-high sticky top-0">
                          <tr>
                            <th className="px-4 py-3 rounded-tl-lg w-16 text-center">#</th>
                            <th className="px-4 py-3">Channel Name</th>
                            <th className="px-4 py-3 text-right">Watch Time (Minutes)</th>
                            <th className="px-4 py-3 text-right rounded-tr-lg">Watch Time (Hours)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.topChannels.map((ch: any, idx: number) => {
                            const minutes = Math.round(ch.duration / 60);
                            const hours = (ch.duration / 3600).toFixed(1);
                            return (
                              <tr key={idx} className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-high transition-colors">
                                <td className="px-4 py-3 font-bold text-on-surface-variant text-center">{idx + 1}</td>
                                <td className="px-4 py-3 font-medium text-on-surface">{ch.name}</td>
                                <td className="px-4 py-3 text-right text-eab308 font-mono">{minutes}</td>
                                <td className="px-4 py-3 text-right text-on-surface-variant font-mono">{hours}h</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant text-center py-10 opacity-60">No channel watch data for this period</p>
              )}
            </div>

            {/* Top Apps */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant">
              <h3 className="font-bold text-on-surface mb-6">Most Opened Apps</h3>
              {reports.topApps?.length > 0 ? (
                <div className="h-64">
                  {reportViewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reports.topApps} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                          itemStyle={{ color: '#e4e4e7' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {reports.topApps.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-auto h-full pr-2">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-on-surface-variant uppercase bg-surface-container-high sticky top-0">
                          <tr>
                            <th className="px-4 py-3 rounded-tl-lg">App Name</th>
                            <th className="px-4 py-3 text-right rounded-tr-lg">Opens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.topApps.map((app: any, idx: number) => (
                            <tr key={idx} className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-high transition-colors">
                              <td className="px-4 py-3 font-medium text-on-surface">{app.name}</td>
                              <td className="px-4 py-3 text-right text-on-surface-variant font-mono">{app.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant text-center py-10 opacity-60">No app usage data yet</p>
              )}
            </div>

            {/* Menu Interaction */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant">
              <h3 className="font-bold text-on-surface mb-6">Popular Menu Categories</h3>
              {reports.topMenus?.length > 0 ? (
                <div className="h-64">
                  {reportViewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reports.topMenus} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                        <YAxis hide />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                          itemStyle={{ color: '#e4e4e7' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {reports.topMenus.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#06b6d4', '#eab308'][index % 4]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-auto h-full pr-2">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-on-surface-variant uppercase bg-surface-container-high sticky top-0">
                          <tr>
                            <th className="px-4 py-3 rounded-tl-lg">Category</th>
                            <th className="px-4 py-3 text-right rounded-tr-lg">Clicks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.topMenus.map((menu: any, idx: number) => (
                            <tr key={idx} className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-high transition-colors">
                              <td className="px-4 py-3 font-medium text-on-surface">{menu.name}</td>
                              <td className="px-4 py-3 text-right text-on-surface-variant font-mono">{menu.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant text-center py-10 opacity-60">No menu interaction data yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Services & Dining ─────────────────────────────────────── */}
      {activeTab === 'services' && reports && (
        <div className="space-y-6">
          <AnalyticsToolbar
            title="Services & Dining Analytics"
            subtitle="Spa, laundry, room dining, and guest service request performance"
            icon={<Utensils className="w-5 h-5 text-emerald-400" />}
            reportTimeFilter={reportTimeFilter}
            setReportTimeFilter={setReportTimeFilter}
            timeSlotPreset={timeSlotPreset}
            setTimeSlotPreset={setTimeSlotPreset}
            customStartHour={customStartHour}
            setCustomStartHour={setCustomStartHour}
            customEndHour={customEndHour}
            setCustomEndHour={setCustomEndHour}
            reportViewMode={reportViewMode}
            setReportViewMode={setReportViewMode}
            onExportCsv={() => api.exportAnalyticsReport(reportTimeFilter, startHour, endHour)}
          />

          <SlotSummaryBanner slotSummary={reports.slotSummary} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Popular Services & Dining Card - takes 2 cols on wide screens */}
            {(() => {
              const servicesData = reports.topServices || [];
              const diningData = reports.topDining || [];
              const displayServicesData = (
                servicesSubTab === 'services'
                  ? servicesData.map((s: any) => ({ ...s, type: 'Service' }))
                  : servicesSubTab === 'dining'
                  ? diningData.map((d: any) => ({ ...d, type: 'Dining' }))
                  : [
                      ...servicesData.map((s: any) => ({ ...s, type: 'Service' })),
                      ...diningData.map((d: any) => ({ ...d, type: 'Dining' }))
                    ].sort((a: any, b: any) => b.count - a.count)
              ).slice(0, 10);

              return (
                <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant lg:col-span-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-2">
                      <Utensils className="w-5 h-5 text-emerald-400" />
                      <div>
                        <h3 className="font-bold text-on-surface">Popular Services & Dining</h3>
                        <p className="text-xs text-on-surface-variant">Sub-menu clicks & views</p>
                      </div>
                    </div>
                    {/* Sub-tabs: All | Services | Dining */}
                    <div className="flex items-center bg-surface-container-high rounded-lg p-1 border border-outline-variant">
                      <button
                        onClick={() => setServicesSubTab('all')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                          servicesSubTab === 'all'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        All ({servicesData.length + diningData.length})
                      </button>
                      <button
                        onClick={() => setServicesSubTab('services')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                          servicesSubTab === 'services'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Services ({servicesData.length})
                      </button>
                      <button
                        onClick={() => setServicesSubTab('dining')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                          servicesSubTab === 'dining'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Dining ({diningData.length})
                      </button>
                    </div>
                  </div>

                  {displayServicesData.length > 0 ? (
                    <div className="h-64">
                      {reportViewMode === 'chart' ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={displayServicesData} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                            <Tooltip 
                              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                              itemStyle={{ color: '#e4e4e7' }}
                              labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                              formatter={(value: any, _name: any, item: any) => [`${value} views`, item.payload.type || 'Item']}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                              {displayServicesData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.type === 'Dining' ? '#f59e0b' : '#10b981'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="overflow-auto h-full pr-2">
                          <table className="w-full text-sm text-left">
                            <thead className="text-xs text-on-surface-variant uppercase bg-surface-container-high sticky top-0">
                              <tr>
                                <th className="px-4 py-3 rounded-tl-lg w-16 text-center">#</th>
                                <th className="px-4 py-3">Item / Service Name</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3 text-right rounded-tr-lg">Clicks / Views</th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayServicesData.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-high transition-colors">
                                  <td className="px-4 py-3 font-bold text-on-surface-variant text-center">{idx + 1}</td>
                                  <td className="px-4 py-3 font-medium text-on-surface">{item.name}</td>
                                  <td className="px-4 py-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      item.type === 'Dining' 
                                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}>
                                      {item.type}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-emerald-400 font-mono font-semibold">{item.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant text-center py-10 opacity-60">No service or dining interaction data yet</p>
                  )}
                </div>
              );
            })()}

            {/* Room Service Requests Breakdown & Operations */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-on-surface">Room Requests Status</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono">
                    Live
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mb-5">
                  Guest requests for room cleaning, amenities, and service delivery
                </p>

                <div className="space-y-3">
                  {[
                    { label: 'Pending Fulfillment', value: data?.requests.pending ?? 0, color: 'bg-amber-400', textColor: 'text-amber-400' },
                    { label: 'In Progress', value: data?.requests.inProgress ?? 0, color: 'bg-blue-400', textColor: 'text-blue-400' },
                    { label: 'Completed', value: data?.requests.completed ?? 0, color: 'bg-emerald-400', textColor: 'text-emerald-400' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-high/50 border border-outline-variant/40">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${row.color}`} />
                        <span className="text-xs font-medium text-on-surface">{row.label}</span>
                      </div>
                      <span className={`text-sm font-bold font-mono ${row.textColor}`}>{row.value}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between text-xs text-on-surface-variant px-1">
                    <span>Total Requests Logged:</span>
                    <span className="font-bold text-on-surface font-mono">{data?.requests.total ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-outline-variant/60 mt-6">
                <Link
                  to="/requests"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold transition-colors"
                >
                  <span>Open Guest Requests Console</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
