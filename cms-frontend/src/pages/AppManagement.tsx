import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api } from '../lib/api';
import { RefreshCw, Trash2, Upload, Send, Edit2 } from 'lucide-react';
import { createPortal } from 'react-dom';

import type { StreamingApp } from '../lib/api';

function AppManagement() {
  const [apps, setApps] = useState<StreamingApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editApp, setEditApp] = useState<StreamingApp | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<StreamingApp>>({});
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

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

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const res = await api.uploadImage(file);
      setEditFormData(prev => ({ ...prev, iconUrl: res.url }));
    } catch (err) {
      console.error(err);
      alert('Failed to upload icon.');
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = '';
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const res = await api.uploadImage(file);
      setEditFormData(prev => ({ ...prev, bgImage: res.url }));
    } catch (err) {
      console.error(err);
      alert('Failed to upload background image.');
    } finally {
      setUploadingBg(false);
      if (bgInputRef.current) bgInputRef.current.value = '';
    }
  };

  const handleEditSave = async () => {
    if (!editApp) return;
    try {
      await api.updateApp(editApp.id, editFormData);
      alert('App updated successfully!');
      setEditApp(null);
      fetchApps();
    } catch (err) {
      console.error(err);
      alert('Failed to update app.');
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
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setEditApp(app);
                          setEditFormData({ ...app });
                        }}
                        title="Edit App"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
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

      {/* Edit App Modal */}
      {editApp && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            width: '500px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '12px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-low)', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                ✏️ Edit Streaming App: {editApp.name}
              </h3>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
              <div>
                <label style={labelStyle}>App Name *</label>
                <input type="text" style={inputStyle}
                  value={editFormData.name || ''}
                  onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="e.g. Netflix" />
              </div>

              <div>
                <label style={labelStyle}>Package Name *</label>
                <input type="text" style={inputStyle}
                  value={editFormData.packageName || ''}
                  onChange={e => setEditFormData({ ...editFormData, packageName: e.target.value })}
                  placeholder="e.g. com.netflix.ninja" />
              </div>

              {/* Icon URL + Upload */}
              <div>
                <label style={labelStyle}>Icon URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="url" style={{ ...inputStyle, fontSize: '13px', flex: 1 }}
                    value={editFormData.iconUrl || ''}
                    onChange={e => setEditFormData({ ...editFormData, iconUrl: e.target.value })}
                    placeholder="https://example.com/icon.png" />
                  
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={iconInputRef} 
                    onChange={handleIconUpload} 
                    style={{ display: 'none' }} 
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    style={{ height: '36px', width: '36px', flexShrink: 0, padding: 0 }}
                    onClick={() => iconInputRef.current?.click()}
                    disabled={uploadingIcon}
                    title="Upload Icon"
                  >
                    {uploadingIcon ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Background Image URL + Upload */}
              <div>
                <label style={labelStyle}>Background Image</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="url" style={{ ...inputStyle, fontSize: '13px', flex: 1 }}
                    value={editFormData.bgImage || ''}
                    onChange={e => setEditFormData({ ...editFormData, bgImage: e.target.value })}
                    placeholder="e.g. /uploads/images/bg.webp" />
                  
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={bgInputRef} 
                    onChange={handleBgUpload} 
                    style={{ display: 'none' }} 
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon" 
                    style={{ height: '36px', width: '36px', flexShrink: 0, padding: 0 }}
                    onClick={() => bgInputRef.current?.click()}
                    disabled={uploadingBg}
                    title="Upload Background"
                  >
                    {uploadingBg ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Active Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="editAppActive"
                  checked={editFormData.isActive}
                  onChange={e => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="editAppActive" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                  Active (Visible to guests)
                </label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid var(--color-outline-variant)', borderRadius: '0 0 12px 12px', backgroundColor: 'var(--color-surface-container-low)' }}>
              <Button variant="ghost" onClick={() => setEditApp(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={!editFormData.name?.trim() || !editFormData.packageName?.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

// Inline styles mirroring ChannelManagement.tsx for modal compatibility
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '6px',
  color: 'var(--color-on-surface)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '6px',
  background: 'var(--color-surface-container-high)',
  color: 'var(--color-on-surface)',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none'
};

export default AppManagement;
