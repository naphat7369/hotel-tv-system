import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { api, type Channel, type StreamingApp } from '../lib/api';
import { RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';

function Dashboard() {
  const [stats, setStats] = useState<{
    activeDevices: number;
    totalDevices: number;
    avgWatchTime: number;
    roomServiceOrders: number;
    topChannels: Channel[];
    topApps: StreamingApp[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, []);

  if (loading && !stats) {
    return <div className="p-8 text-center text-on-surface-variant flex items-center justify-center gap-2">
      <RefreshCw className="w-5 h-5 animate-spin" /> Loading Dashboard...
    </div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Analytics Dashboard</h2>
          <p className="text-on-surface-variant">System overview and usage metrics</p>
        </div>
        <div className="flex gap-2">
          <select className="bg-surface-container border border-outline-variant rounded p-2 text-sm text-on-surface focus:outline-none focus:border-primary w-fit">
            <option>This Month</option>
            <option>Last 30 Days</option>
          </select>
          <Button variant="outline" size="icon" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-surface-container border-t-4 border-t-primary border-x-surface-container-high border-b-surface-container-high">
          <CardContent className="p-6">
            <p className="text-sm font-semibold tracking-wide text-on-surface-variant uppercase">Active Devices</p>
            <p className="text-4xl font-bold text-on-surface mt-2">
              {stats?.activeDevices || 0} <span className="text-lg font-normal text-on-surface-variant">/ {stats?.totalDevices || 0}</span>
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-surface-container border-t-4 border-t-secondary border-x-surface-container-high border-b-surface-container-high">
          <CardContent className="p-6">
            <p className="text-sm font-semibold tracking-wide text-on-surface-variant uppercase">Avg Watch Time</p>
            <p className="text-4xl font-bold text-on-surface mt-2">
              {stats?.avgWatchTime || 0} <span className="text-lg font-normal text-on-surface-variant">hrs/day</span>
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-surface-container border-t-4 border-t-tertiary border-x-surface-container-high border-b-surface-container-high">
          <CardContent className="p-6">
            <p className="text-sm font-semibold tracking-wide text-on-surface-variant uppercase">Room Service</p>
            <p className="text-4xl font-bold text-on-surface mt-2">
              {stats?.roomServiceOrders || 0} <span className="text-lg font-normal text-on-surface-variant">orders</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
            <CardTitle className="text-lg">📺 Top Channels</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {stats?.topChannels.map(ch => (
              <div key={ch.id}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-bold text-on-surface">{ch.name}</span>
                  <span className="text-on-surface-variant font-mono">{Math.floor(Math.random() * 100)}%</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-2 rounded-full transition-all duration-1000" style={{width: `${Math.floor(Math.random() * 100)}%`}}></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
            <CardTitle className="text-lg">🎬 Top Apps</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {stats?.topApps.map(app => (
              <div key={app.id}>
                <div className="flex justify-between text-sm mb-2"><span className="font-bold text-on-surface">{app.name}</span><span className="text-on-surface-variant font-mono">{app.engagement}%</span></div>
                <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden"><div className="bg-secondary h-2 rounded-full transition-all duration-1000" style={{width: `${app.engagement}%`}}></div></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
