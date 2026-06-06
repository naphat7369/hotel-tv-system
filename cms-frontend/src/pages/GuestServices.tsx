import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { api, type ServiceCategory } from '../lib/api';
import { RefreshCw, Trash2 } from 'lucide-react';

function GuestServices() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal State
  const [addModalCategoryId, setAddModalCategoryId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    try {
      const data = await api.getServices();
      setCategories(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchServices();
  }, []);

  const handleAddClick = (categoryId: string) => {
    setNewItemName('');
    setNewItemPrice('');
    setAddModalCategoryId(categoryId);
  };

  const submitAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice || !addModalCategoryId) return;
    
    setProcessingId(addModalCategoryId);
    try {
      const price = parseFloat(newItemPrice) || 0;
      const newItem = await api.addServiceItem(addModalCategoryId, { name: newItemName, price, status: 'Available' });
      setCategories(categories.map(cat => 
        cat.id === addModalCategoryId ? { ...cat, items: [...cat.items, newItem] } : cat
      ));
      setAddModalCategoryId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteItem = async (categoryId: string, itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    setProcessingId(itemId);
    try {
      await api.deleteServiceItem(categoryId, itemId);
      setCategories(categories.map(cat => 
        cat.id === categoryId ? { ...cat, items: cat.items.filter(i => i.id !== itemId) } : cat
      ));
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
          <h2 className="text-2xl font-bold text-on-surface">Guest Services Menu</h2>
          <p className="text-on-surface-variant">Manage food and beverage offerings</p>
        </div>
        <Button onClick={fetchServices} variant="outline" size="icon" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      <div className="space-y-6">
        {loading && categories.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant">Loading services...</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant">No categories found.</div>
        ) : (
          categories.map(category => (
            <Card key={category.id}>
              <CardHeader className="flex flex-row items-center justify-between border-b border-surface-container-high bg-surface-container-low">
                <div>
                  <CardTitle className="text-lg">{category.name}</CardTitle>
                  <p className="text-xs text-on-surface-variant">{category.timeRange}</p>
                </div>
                <div className="space-x-2">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => handleAddClick(category.id)}
                    disabled={processingId === category.id}
                  >
                    + Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Price (THB)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-on-surface-variant italic">
                          No items in this category yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      category.items.map(item => (
                        <TableRow key={item.id} className={processingId === item.id ? 'opacity-50 pointer-events-none' : ''}>
                          <TableCell className="font-bold">{item.name}</TableCell>
                          <TableCell className="font-mono">{item.price}</TableCell>
                          <TableCell>
                            {item.status === 'Available' ? (
                              <Badge variant="success">Available</Badge>
                            ) : (
                              <Badge variant="error">Sold Out</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-error hover:text-error hover:bg-error/10"
                              onClick={() => handleDeleteItem(category.id, item.id)}
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
          ))
        )}
      </div>

      {addModalCategoryId && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader className="border-b border-surface-container-high bg-surface-container-low">
              <CardTitle>Add Menu Item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">Item Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Club Sandwich"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-on-surface">Price (THB)</label>
                <input 
                  type="number" 
                  className="w-full p-2 border border-outline-variant rounded bg-surface-container text-on-surface focus:border-primary focus:outline-none" 
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(e.target.value)}
                  placeholder="e.g. 250"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setAddModalCategoryId(null)}>Cancel</Button>
                <Button onClick={submitAddItem} disabled={!newItemName.trim() || !newItemPrice || processingId === addModalCategoryId}>
                  {processingId === addModalCategoryId ? 'Adding...' : 'Add Item'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default GuestServices;
