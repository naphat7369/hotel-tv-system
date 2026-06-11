import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api } from '../lib/api';
import { RefreshCw, Trash2, Upload, Send } from 'lucide-react';

interface RealApp {
  filename: string;
  size: number;
  url: string;
  createdAt: string;
}

function AppManagement() {
  const [apps, setApps] = useState<RealApp[]>([]);
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

  const handleDelete = async (filename: string) => {
    if (!confirm('Are you sure you want to delete this APK?')) return;
    try {
      await api.deleteApp(filename);
      setApps(apps.filter(a => a.filename !== filename));
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

  const handlePush = async (app: RealApp) => {
    if (!confirm(`Are you sure you want to push ${app.filename} to all online TVs?`)) return;
    setPushing(app.filename);
    try {
      // Must use the actual LAN IP of the Node.js server so the TV box can reach it!
      const fullUrl = `http://192.168.1.63:3000${app.url}`;
      await api.pushInstallToAll(fullUrl);
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
                <TableHead>Filename</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && apps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-on-surface-variant">Loading apps...</TableCell>
                </TableRow>
              ) : apps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-on-surface-variant">No APKs found. Upload one to get started.</TableCell>
                </TableRow>
              ) : (
                apps.map((app) => (
                  <TableRow key={app.filename}>
                    <TableCell className="font-bold">{app.filename}</TableCell>
                    <TableCell>{(app.size / (1024 * 1024)).toFixed(2)} MB</TableCell>
                    <TableCell>{new Date(app.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => handlePush(app)}
                        disabled={pushing === app.filename}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {pushing === app.filename ? 'Pushing...' : 'Push to TVs'}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-error hover:text-error hover:bg-error/10"
                        onClick={() => handleDelete(app.filename)}
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
