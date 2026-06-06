import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api, type StreamingApp } from '../lib/api';
import { RefreshCw, Trash2, Power } from 'lucide-react';

function AppManagement() {
  const [apps, setApps] = useState<StreamingApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');

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

  const handleToggleStatus = async (app: StreamingApp) => {
    setProcessingId(app.id);
    const newStatus = app.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.updateAppStatus(app.id, newStatus);
      setApps(apps.map(a => a.id === app.id ? { ...a, status: newStatus } : a));
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this app?')) return;
    setProcessingId(id);
    try {
      await api.deleteApp(id);
      setApps(apps.filter(a => a.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddClick = () => {
    setNewName('');
    setNewCategory('');
    setIsAddModalOpen(true);
  };

  const submitAddApp = async () => {
    if (!newName.trim()) return;
    setProcessingId('new');
    try {
      const newApp = await api.addApp({ name: newName, category: newCategory || 'App' });
      setApps([...apps, newApp]);
      setIsAddModalOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
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
          <CardTitle className="text-lg">🎬 App Catalog</CardTitle>
          <Button size="sm" onClick={handleAddClick} disabled={processingId === 'new'}>+ Add App</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
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
                  <TableCell colSpan={4} className="text-center py-8 text-on-surface-variant">No apps found.</TableCell>
                </TableRow>
              ) : (
                apps.map((app) => (
                  <TableRow key={app.id} className={processingId === app.id ? 'opacity-50 pointer-events-none' : ''}>
                    <TableCell className="font-bold">{app.name}</TableCell>
                    <TableCell>
                      <span className="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-xs">
                        {app.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      {app.status === 'Active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : app.status === 'Warning' ? (
                        <Badge variant="warning">Warning</Badge>
                      ) : (
                        <Badge variant="error">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleToggleStatus(app)}
                        title={app.status === 'Active' ? 'Deactivate' : 'Activate'}
                      >
                        <Power className={`w-4 h-4 ${app.status === 'Active' ? 'text-success' : 'text-on-surface-variant'}`} />
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

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
              <CardTitle>Add New App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">App Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Spotify"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">Category</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g. Streaming"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button onClick={submitAddApp} disabled={!newName.trim() || processingId === 'new'}>
                  {processingId === 'new' ? 'Adding...' : 'Add App'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AppManagement;
