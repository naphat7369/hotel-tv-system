import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api } from '../lib/api';
import { RefreshCw, Trash2, Upload, Send } from 'lucide-react';

import type { StreamingApp } from '../lib/api';

function AppManagement() {
  const [apps, setApps] = useState<StreamingApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const data = await api.getApps();
      setApps(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApps();
  }, []);

  const handleDelete = async (appId: string) => {
    if (!confirm('Are you sure you want to delete this app?')) return;
    try {
      await api.deleteApp(appId);
      setApps(apps.filter(a => a.id !== appId));
    } catch (e) {
      console.error(e);
      alert('Failed to delete app');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      await api.uploadApp(file);
      await fetchApps();
    } catch (e) {
      console.error(e);
      alert('Failed to upload APK');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePush = async (app: StreamingApp) => {
    if (!app.deepLink) {
      alert('No APK URL available for this app.');
      return;
    }
    if (!confirm(`Are you sure you want to push ${app.name} to all online TVs?`)) return;
    setPushing(app.id);
    try {
      await api.pushInstallToAll(app.deepLink);
      alert('Push command sent to all online TVs!');
    } catch (e) {
      console.error(e);
      alert('Failed to push APK to TVs');
    } finally {
      setPushing(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Streaming Apps</h2>
          <p className="text-on-surface-variant">Manage third-party streaming applications on hotel TVs</p>
        </div>
        <Button onClick={fetchApps} variant="outline" size="icon" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-surface-container-high bg-surface-container-low">
          <CardTitle className="text-lg">🎬 App Catalog (APKs)</CardTitle>
          <div>
            <input 
              type="file" 
              accept=".apk" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload APK'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Icon</TableHead>
                <TableHead>App Name</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && apps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">Loading apps...</TableCell>
                </TableRow>
              ) : apps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant">No apps found. Upload an APK to get started.</TableCell>
                </TableRow>
              ) : (
                apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      {app.iconUrl ? (
                        <img src={`http://${window.location.hostname}:3000${app.iconUrl}`} alt={app.name} className="w-10 h-10 object-contain rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-surface-container flex items-center justify-center rounded">
                          <span className="material-symbols-outlined text-on-surface-variant">android</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-bold">{app.name}</TableCell>
                    <TableCell className="text-sm text-on-surface-variant">{app.packageName}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs rounded-full ${app.isActive ? 'bg-success/20 text-success' : 'bg-on-surface/10 text-on-surface-variant'}`}>
                        {app.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="primary" 
                        size="sm"
                        onClick={() => handlePush(app)}
                        disabled={pushing === app.id || !app.deepLink}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {pushing === app.id ? 'Pushing...' : 'Push to TVs'}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-error hover:text-error hover:bg-error/10"
                        onClick={() => handleDelete(app.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>


    </div>
  );
}

export default AppManagement;
