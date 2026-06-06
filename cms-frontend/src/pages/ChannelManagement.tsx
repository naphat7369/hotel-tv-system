import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api, type Channel } from '../lib/api';
import { RefreshCw, Trash2, Power } from 'lucide-react';

function ChannelManagement() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await api.getChannels();
      setChannels(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchChannels();
  }, []);

  const handleToggleStatus = async (channel: Channel) => {
    setProcessingId(channel.id);
    const newStatus = channel.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.updateChannelStatus(channel.id, newStatus);
      setChannels(channels.map(c => c.id === channel.id ? { ...c, status: newStatus } : c));
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    setProcessingId(id);
    try {
      await api.deleteChannel(id);
      setChannels(channels.filter(c => c.id !== id));
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

  const submitAddChannel = async () => {
    if (!newName.trim()) return;
    setProcessingId('new');
    try {
      const newChannel = await api.addChannel({ name: newName, category: newCategory || 'General' });
      setChannels([...channels, newChannel]);
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
          <h2 className="text-2xl font-bold text-on-surface">Channel Management</h2>
          <p className="text-on-surface-variant">Manage your hotel's digital experience</p>
        </div>
        <Button onClick={fetchChannels} variant="outline" size="icon" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-surface-container-high bg-surface-container-low">
          <CardTitle className="text-lg">📺 Channel Fleet</CardTitle>
          <Button size="sm" onClick={handleAddClick} disabled={processingId === 'new'}>+ Add Channel</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-on-surface-variant">Loading channels...</TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-on-surface-variant">No channels found.</TableCell>
                </TableRow>
              ) : (
                channels.map((ch) => (
                  <TableRow key={ch.id} className={processingId === ch.id ? 'opacity-50 pointer-events-none' : ''}>
                    <TableCell className="font-bold">{ch.name}</TableCell>
                    <TableCell>
                      <span className="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-xs">
                        {ch.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      {ch.status === 'Active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : ch.status === 'Warning' ? (
                        <Badge variant="warning">Warning</Badge>
                      ) : (
                        <Badge variant="error">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleToggleStatus(ch)}
                        title={ch.status === 'Active' ? 'Deactivate' : 'Activate'}
                      >
                        <Power className={`w-4 h-4 ${ch.status === 'Active' ? 'text-success' : 'text-on-surface-variant'}`} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-error hover:text-error hover:bg-error/10"
                        onClick={() => handleDelete(ch.id)}
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
              <CardTitle>Add New Channel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">Channel Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. HBO Asia"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">Category</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g. Movies"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button onClick={submitAddChannel} disabled={!newName.trim() || processingId === 'new'}>
                  {processingId === 'new' ? 'Adding...' : 'Add Channel'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ChannelManagement;
