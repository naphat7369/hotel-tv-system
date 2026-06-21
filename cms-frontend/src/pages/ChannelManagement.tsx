import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api, type Channel } from '../lib/api';
import { RefreshCw, Trash2, Power, Edit2, Play, Upload, MonitorPlay } from 'lucide-react';
import Hls from 'hls.js';

function HlsPreview({ url }: { url?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [url]);

  if (!url) return (
    <div style={{
      width: '100%', height: '160px',
      background: 'var(--color-surface-container-high)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '8px', border: '1px solid var(--color-outline-variant)',
      color: 'var(--color-on-surface-variant)', fontSize: '13px'
    }}>
      No Stream URL provided
    </div>
  );

  return (
    <div style={{ width: '100%', height: '160px', background: '#000', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-outline-variant)' }}>
      <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} controls autoPlay muted />
    </div>
  );
}

const CATEGORIES = ['Live TV', 'Movies', 'News', 'Sports', 'Kids', 'Music', 'Documentary', 'General'];

function ChannelManagement() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | 'preview' | null>(null);
  const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);
  const [bandwidthStats, setBandwidthStats] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState<Partial<Channel>>({
    name: '', category: 'Live TV', streamUrl: '', logoUrl: '', channelNumber: null, isActive: true,
    inputProtocol: 'UDP', inputIp: '', inputPort: null, inputEth: 'eth1',
    outputProtocol: 'UDP', outputIp: '', outputPort: null, outputEth: 'All'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await api.getChannels();
      const sortedData = data.sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999));
      setChannels(sortedData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchChannels(); }, []);

  // Bandwidth Monitor Simulation
  useEffect(() => {
    if (channels.length === 0) return;
    
    const interval = setInterval(() => {
      setBandwidthStats(prev => {
        const newStats = { ...prev };
        channels.forEach(ch => {
          if (ch.isActive && ch.streamUrl) {
            // Simulate 2.5 - 5.5 Mbps
            const base = newStats[ch.id] || (3.0 + Math.random() * 2);
            // Fluctuate by +/- 0.3
            const change = (Math.random() - 0.5) * 0.6;
            let current = base + change;
            if (current < 1.0) current = 1.5;
            if (current > 6.0) current = 5.8;
            newStats[ch.id] = parseFloat(current.toFixed(1));
          } else {
            newStats[ch.id] = 0;
          }
        });
        return newStats;
      });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [channels]);

  const handleToggleStatus = async (channel: Channel) => {
    setProcessingId(channel.id);
    const newStatus = !channel.isActive;
    try {
      await api.updateChannel(channel.id, { isActive: newStatus });
      setChannels(channels.map(c => c.id === channel.id ? { ...c, isActive: newStatus } : c));
    } catch (e) { console.error(e); }
    finally { setProcessingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    setProcessingId(id);
    try {
      await api.deleteChannel(id);
      setChannels(channels.filter(c => c.id !== id));
    } catch (e) { console.error(e); }
    finally { setProcessingId(null); }
  };

  const openAddModal = () => {
    setFormData({ name: '', category: 'Live TV', streamUrl: '', logoUrl: '', channelNumber: null, isActive: true, inputProtocol: 'UDP', inputIp: '', inputPort: null, inputEth: 'eth1', outputProtocol: 'UDP', outputIp: '', outputPort: null, outputEth: 'All' });
    setModalMode('add');
  };

  const openEditModal = (channel: Channel) => {
    setFormData({ ...channel });
    setModalMode('edit');
  };

  const submitModal = async () => {
    if (!formData.name?.trim()) return;
    setProcessingId('modal');
    try {
      if (modalMode === 'add') {
        const newChannel = await api.addChannel(formData);
        setChannels([...channels, newChannel].sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999)));
      } else if (modalMode === 'edit' && formData.id) {
        const updated = await api.updateChannel(formData.id, formData);
        setChannels(channels.map(c => c.id === updated.id ? updated : c).sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999)));
      }
      setModalMode(null);
    } catch (e) {
      console.error(e);
      alert('Failed to save channel. See console.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingLogo(true);
    try {
      const res = await api.uploadChannelLogo(file);
      setFormData(prev => ({ ...prev, logoUrl: res.url }));
    } catch (err) {
      console.error(err);
      alert('Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'var(--color-on-surface)'
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Channel Management</h2>
          <p className="text-on-surface-variant">Manage Live TV streams and assignments</p>
        </div>
        <Button onClick={fetchChannels} variant="outline" size="icon" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-surface-container-high bg-surface-container-low">
          <CardTitle className="text-lg">📺 Channel Fleet</CardTitle>
          <Button size="sm" onClick={openAddModal} disabled={processingId === 'modal'}>+ Add Channel</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">CH</TableHead>
                <TableHead>Channel Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bandwidth</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-on-surface-variant">Loading channels...</TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-on-surface-variant">No channels found.</TableCell>
                </TableRow>
              ) : (
                channels.map((ch) => (
                  <TableRow key={ch.id} className={processingId === ch.id ? 'opacity-50 pointer-events-none' : ''}>
                    <TableCell className="font-mono text-on-surface-variant">{ch.channelNumber || '-'}</TableCell>
                    <TableCell className="font-bold">
                      {ch.name}
                      {ch.streamUrl && <Play className="w-3 h-3 inline-block ml-2 text-primary" />}
                    </TableCell>
                    <TableCell>
                      <span className="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-xs">{ch.category}</span>
                    </TableCell>
                    <TableCell className="text-xs text-on-surface-variant">
                      {ch.inputIp ? (
                        <div>
                          <div><span className="font-semibold">{ch.inputProtocol}</span> {ch.inputEth}</div>
                          <div>{ch.inputIp}:{ch.inputPort}</div>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-on-surface-variant">
                      {ch.outputIp ? (
                        <div>
                          <div><span className="font-semibold">{ch.outputProtocol}</span> {ch.outputEth}</div>
                          <div>{ch.outputIp}:{ch.outputPort}</div>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {ch.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="error">Inactive</Badge>}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const bw = bandwidthStats[ch.id] || 0;
                        let colorClass = "text-on-surface-variant";
                        let progressColor = "var(--color-outline-variant)";
                        let percent = 0;
                        if (bw > 3.0) {
                          colorClass = "text-success font-bold";
                          progressColor = "var(--color-success, #10B981)";
                          percent = Math.min((bw / 6.0) * 100, 100);
                        } else if (bw > 1.0) {
                          colorClass = "text-warning font-bold";
                          progressColor = "var(--color-warning, #F59E0B)";
                          percent = Math.min((bw / 6.0) * 100, 100);
                        } else if (bw > 0) {
                          colorClass = "text-error font-bold";
                          progressColor = "var(--color-error, #EF4444)";
                          percent = Math.min((bw / 6.0) * 100, 100);
                        }

                        return (
                          <div className="flex flex-col gap-1 w-24">
                            <span className={`text-sm ${colorClass}`}>{bw.toFixed(1)} Mbps</span>
                            <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden border border-outline-variant">
                              <div 
                                className="h-full rounded-full transition-all duration-500" 
                                style={{ width: `${percent}%`, backgroundColor: progressColor }} 
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => { setPreviewChannel(ch); setModalMode('preview'); }} title="Preview">
                        <MonitorPlay className="w-4 h-4 text-secondary" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(ch)} title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(ch)} title={ch.isActive ? 'Deactivate' : 'Activate'}>
                        <Power className={`w-4 h-4 ${ch.isActive ? 'text-success' : 'text-on-surface-variant'}`} />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-error hover:text-error hover:bg-error/10" onClick={() => handleDelete(ch.id)}>
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

      {/* ── Modal ── */}
      {modalMode && createPortal(
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
            width: '560px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '12px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)'
          }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-low)', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                {modalMode === 'add' ? '📺 Add New Channel' : '✏️ Edit Channel'}
              </h3>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>

              {/* CH# + Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>CH #</label>
                  <input type="number" style={inputStyle}
                    value={formData.channelNumber || ''}
                    onChange={e => setFormData({...formData, channelNumber: parseInt(e.target.value) || null})}
                    placeholder="1" />
                </div>
                <div>
                  <label style={labelStyle}>Channel Name *</label>
                  <input type="text" style={inputStyle}
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. HBO Asia" />
                </div>
              </div>

              {/* Category + Logo URL */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select style={inputStyle}
                    value={formData.category || 'Live TV'}
                    onChange={e => setFormData({...formData, category: e.target.value})}>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Logo URL</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="url" style={{ ...inputStyle, fontSize: '13px', flex: 1 }}
                      value={formData.logoUrl || ''}
                      onChange={e => setFormData({...formData, logoUrl: e.target.value})}
                      placeholder="https://example.com/logo.png" />
                    
                    <input 
                      type="file" 
                      accept="image/*" 
                      ref={fileInputRef} 
                      onChange={handleLogoUpload} 
                      style={{ display: 'none' }} 
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon" 
                      style={{ height: '36px', width: '36px', flexShrink: 0, padding: 0 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      title="Upload Image"
                    >
                      {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Headend Configuration */}
              <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-container-high)', borderRadius: '8px', border: '1px solid var(--color-outline-variant)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface)' }}>Headend Configuration</h4>
                
                {/* Input Config */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{...labelStyle, color: 'var(--color-on-surface-variant)'}}>Input Configuration (For CMS Documentation Only)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Protocol</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>IP Address</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Port</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Eth</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px', gap: '8px' }}>
                    <select style={{...inputStyle, fontSize: '13px'}} value={formData.inputProtocol || 'UDP'} onChange={e => setFormData({...formData, inputProtocol: e.target.value})}>
                      <option value="UDP">UDP</option>
                      <option value="RTP">RTP</option>
                    </select>
                    <input type="text" style={{...inputStyle, fontSize: '13px'}} placeholder="IP (e.g. 224.1.1.1)" value={formData.inputIp || ''} onChange={e => setFormData({...formData, inputIp: e.target.value})} />
                    <input type="number" style={{...inputStyle, fontSize: '13px'}} placeholder="Port" value={formData.inputPort || ''} onChange={e => setFormData({...formData, inputPort: parseInt(e.target.value) || null})} />
                    <select style={{...inputStyle, fontSize: '13px'}} value={formData.inputEth || 'eth1'} onChange={e => setFormData({...formData, inputEth: e.target.value})}>
                      <option value="All">All</option>
                      <option value="eth1">eth1</option>
                      <option value="eth2">eth2</option>
                      <option value="eth3">eth3</option>
                      <option value="eth4">eth4</option>
                      <option value="eth5">eth5</option>
                    </select>
                  </div>
                </div>

                {/* Output Config */}
                <div>
                  <label style={{...labelStyle, color: 'var(--color-on-surface-variant)'}}>Output Configuration (Used to auto-generate HLS Stream URL)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Protocol</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>IP Address</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Port</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Eth</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 80px', gap: '8px' }}>
                    <select style={{...inputStyle, fontSize: '13px'}} value={formData.outputProtocol || 'UDP'} onChange={e => setFormData({...formData, outputProtocol: e.target.value})}>
                      <option value="UDP">UDP</option>
                      <option value="HLS">HLS</option>
                      <option value="DASH">DASH</option>
                    </select>
                    <input type="text" style={{...inputStyle, fontSize: '13px'}} placeholder="IP (e.g. 10.0.101.2)" value={formData.outputIp || ''} onChange={e => setFormData({...formData, outputIp: e.target.value})} />
                    <input type="number" style={{...inputStyle, fontSize: '13px'}} placeholder="Port" value={formData.outputPort || ''} onChange={e => setFormData({...formData, outputPort: parseInt(e.target.value) || null})} />
                    <select style={{...inputStyle, fontSize: '13px'}} value={formData.outputEth || 'All'} onChange={e => setFormData({...formData, outputEth: e.target.value})}>
                      <option value="All">All</option>
                      <option value="eth1">eth1</option>
                      <option value="eth2">eth2</option>
                      <option value="eth3">eth3</option>
                      <option value="eth4">eth4</option>
                      <option value="eth5">eth5</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Stream URL */}
              <div>
                <label style={{...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span>Stream URL (HLS or UDP for Android TV) *</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                      onClick={() => {
                        const ip = formData.inputIp;
                        const port = formData.inputPort;
                        if (!ip || !port) {
                          alert('Please fill in IP Address and Port in the Input Configuration first.');
                          return;
                        }
                        setFormData({...formData, streamUrl: `udp://@${ip}:${port}`});
                      }}
                    >
                      Auto-Generate UDP
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                      onClick={() => {
                        const ip = formData.outputIp || '10.0.101.254';
                        const chId = prompt('Enter Wellav Row/Stream ID (e.g., 1, 2, 3):', String(formData.channelNumber || '1'));
                        if (chId) {
                          const paddedId = String(chId).padStart(4, '0');
                          setFormData({...formData, streamUrl: `http://${ip}/live/${paddedId}/index.m3u8`});
                        }
                      }}
                    >
                      Auto-Generate HLS
                    </Button>
                  </div>
                </label>
                <input type="url" style={{ ...inputStyle, fontSize: '13px', backgroundColor: 'var(--color-surface-container)' }}
                  value={formData.streamUrl || ''}
                  onChange={e => setFormData({...formData, streamUrl: e.target.value})}
                  placeholder="e.g. http://... or udp://@..." />
              </div>

              {/* Stream Preview */}
              <div>
                <label style={labelStyle}>Preview Stream</label>
                <HlsPreview url={formData.streamUrl} />
                {formData.streamUrl?.startsWith('udp://') && (
                  <p style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '8px' }}>
                    ⚠️ Browser cannot preview UDP multicast streams directly. You must test UDP streams on the actual Android TV box.
                  </p>
                )}
              </div>

              {/* Active */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData({...formData, isActive: e.target.checked})}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="isActive" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                  Active (Visible to guests)
                </label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid var(--color-outline-variant)', borderRadius: '0 0 12px 12px', backgroundColor: 'var(--color-surface-container-low)' }}>
              <Button variant="ghost" onClick={() => setModalMode(null)}>Cancel</Button>
              <Button onClick={submitModal} disabled={!formData.name?.trim() || processingId === 'modal'}>
                {processingId === 'modal' ? 'Saving...' : 'Save Channel'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Preview Modal ── */}
      {modalMode === 'preview' && previewChannel && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            width: '800px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '12px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-low)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                📺 Preview: {previewChannel.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setModalMode(null); setPreviewChannel(null); }}>Close</Button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--color-surface-container-high)', borderRadius: '8px', fontSize: '13px', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
                <strong>Stream URL:</strong> {previewChannel.streamUrl || 'N/A'}
              </div>
              
              <div style={{ height: '400px' }}>
                 <HlsPreview url={previewChannel.streamUrl} />
              </div>

              {previewChannel.streamUrl?.startsWith('udp://') && (
                <p style={{ fontSize: '13px', color: 'var(--color-warning)', marginTop: '8px', textAlign: 'center' }}>
                  ⚠️ Browser cannot preview UDP multicast streams directly. You must test UDP streams on the actual Android TV box.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ChannelManagement;
