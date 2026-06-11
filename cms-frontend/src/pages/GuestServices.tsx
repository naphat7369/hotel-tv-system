import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui/Button';
import { api, type GuestMenuItem, type DisplayType } from '../lib/api';
import { RefreshCw, Trash2, Plus, Edit2, Upload, X } from 'lucide-react';

type Section = 'services' | 'dining' | 'local_guide';

const SECTIONS: { key: Section; label: string; icon: string; desc: string }[] = [
  { key: 'services', label: 'Services', icon: '🛡️', desc: 'Hotel service cards (Spa, Housekeeping, etc.)' },
  { key: 'dining', label: 'Dining', icon: '🍽️', desc: 'In-room dining, buffet, bar promotions' },
  { key: 'local_guide', label: 'Local Guide', icon: '📍', desc: 'Nearby attractions, shopping, transit' },
];

const DISPLAY_TYPES: { value: DisplayType; label: string; color: string; hint: string }[] = [
  { value: 'IMAGE_ONLY', label: 'Image Only', color: 'text-purple-600 bg-purple-50', hint: 'Full-screen image URL' },
  { value: 'QR_CODE', label: 'QR Code', color: 'text-blue-600 bg-blue-50', hint: 'URL to encode as QR code' },
  { value: 'TEXT_INFO', label: 'Text Info', color: 'text-amber-600 bg-amber-50', hint: 'JSON: { "key": "value", ... }' },
  { value: 'SERVICE_REQUEST', label: 'Service Request', color: 'text-green-600 bg-green-50', hint: 'JSON array: [{ "id":"h1","name":"Towel","icon":"dry_cleaning" }, ...]' },
];

const EMPTY_FORM: Omit<GuestMenuItem, 'id' | 'hotelId' | 'createdAt' | 'updatedAt'> = {
  section: 'services',
  name: '',
  subtitle: '',
  icon: '',
  color: 'bg-gradient-to-br from-[#1a2a4a] to-[#2a3a6a]',
  displayType: 'IMAGE_ONLY',
  displayContent: '',
  bgImage: '',
  sortOrder: 0,
  isActive: true,
  activeFrom: null,
  activeUntil: null,
};

function GuestServices() {
  const [activeSection, setActiveSection] = useState<Section>('services');
  const [items, setItems] = useState<GuestMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GuestMenuItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadField, setActiveUploadField] = useState<'bgImage' | 'displayContent'>('bgImage');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await api.getGuestMenuItems();
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const sectionItems = items.filter(i => i.section === activeSection && i.isActive !== false);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ ...EMPTY_FORM, section: activeSection });
    setModalOpen(true);
  };

  const openEdit = (item: GuestMenuItem) => {
    setEditingItem(item);
    setForm({
      section: item.section,
      name: item.name,
      subtitle: item.subtitle || '',
      icon: item.icon || '',
      color: item.color || EMPTY_FORM.color,
      displayType: item.displayType as DisplayType,
      displayContent: item.displayContent,
      bgImage: item.bgImage || '',
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      activeFrom: item.activeFrom ? new Date(item.activeFrom).toISOString().slice(0, 16) : '',
      activeUntil: item.activeUntil ? new Date(item.activeUntil).toISOString().slice(0, 16) : '',
    });
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingItem(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.displayContent.trim()) return;
    setSaving(true);
    try {
      if (editingItem) {
        const updated = await api.updateGuestMenuItem(editingItem.id, form);
        setItems(prev => prev.map(i => i.id === editingItem.id ? updated : i));
      } else {
        const created = await api.createGuestMenuItem(form as any);
        setItems(prev => [...prev, created]);
      }
      closeModal();
    } catch (e) {
      console.error(e);
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: GuestMenuItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.deleteGuestMenuItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (e) {
      alert('Delete failed');
    }
  };

  const triggerUpload = (field: 'bgImage' | 'displayContent') => {
    setActiveUploadField(field);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(activeUploadField);
    try {
      const { url } = await api.uploadMenuImage(file);
      setForm(prev => ({ ...prev, [activeUploadField]: url }));
    } catch {
      alert('Upload failed');
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const displayTypeInfo = (type: string) =>
    DISPLAY_TYPES.find(d => d.value === type) ?? DISPLAY_TYPES[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Guest Menu Builder</h2>
          <p className="text-on-surface-variant text-sm">
            Manage content cards displayed on Hotel TV — Services, Dining, and Local Guide
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchItems} variant="outline" size="icon" disabled={loading} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-2 bg-surface-container-low p-1.5 rounded-xl border border-outline-variant">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeSection === s.key
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <span>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Section description */}
      <p className="text-xs text-on-surface-variant -mt-2 px-1">
        {SECTIONS.find(s => s.key === activeSection)?.desc}
      </p>

      {/* Cards grid */}
      {loading && items.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant">Loading...</div>
      ) : sectionItems.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-outline-variant rounded-xl">
          <div className="text-4xl mb-3">{SECTIONS.find(s => s.key === activeSection)?.icon}</div>
          <p className="text-on-surface-variant font-medium">No items yet</p>
          <Button onClick={openAdd} className="mt-4"><Plus className="w-4 h-4 mr-1" />Add First Item</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionItems.map(item => {
            const dt = displayTypeInfo(item.displayType);
            return (
              <div key={item.id} className="group relative bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
                {/* Image area */}
                <div className="relative h-40 overflow-hidden">
                  {item.bgImage ? (
                    <img
                      src={item.bgImage}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-4xl ${item.color || 'bg-surface-container'}`}>
                      {item.icon || '🎯'}
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {/* Icon + name overlay */}
                  <div className="absolute bottom-0 left-0 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl drop-shadow-lg">{item.icon}</span>
                      <span className="text-white font-bold text-sm drop-shadow-lg line-clamp-1">{item.name}</span>
                    </div>
                    {item.subtitle && (
                      <p className="text-white/70 text-xs mt-0.5">{item.subtitle}</p>
                    )}
                  </div>
                  {/* Quick actions overlay */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(item)}
                      className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center text-gray-700 hover:bg-white shadow-md transition-all hover:scale-110"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center text-red-600 hover:bg-white shadow-md transition-all hover:scale-110"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card body */}
                <div className="p-3 flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dt.color}`}>
                    {dt.label}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error hover:text-error hover:bg-error/10"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add card */}
          <button
            onClick={openAdd}
            className="h-40 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-outline-variant rounded-xl text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="w-8 h-8" />
            <span className="text-sm font-semibold">Add Item</span>
          </button>
        </div>
      )}

      {/* ── MODAL ── */}
      {modalOpen && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99999,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div 
            className="bg-surface-container-lowest overflow-hidden flex flex-col"
            style={{ 
              width: '560px', 
              maxWidth: 'calc(100vw - 32px)', 
              maxHeight: '92vh',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '12px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              flexShrink: 0
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low">
              <h3 className="text-lg font-bold text-on-surface">
                {editingItem ? '✏️ Edit Item' : '➕ Add New Item'}
              </h3>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

              {/* Background image preview + upload */}
              <div className="relative rounded-xl overflow-hidden border border-outline-variant bg-surface-container" style={{ height: 160 }}>
                {form.bgImage ? (
                  <img src={form.bgImage} alt="bg" className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-5xl ${form.color || 'bg-surface-container'}`}>
                    {form.icon || '🎯'}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-3 opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => triggerUpload('bgImage')}
                    className="flex items-center gap-1.5 bg-white text-gray-800 font-semibold text-xs px-3 py-1.5 rounded-lg shadow hover:bg-gray-100 transition"
                  >
                    {uploadingId === 'bgImage' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {form.bgImage ? 'Change Image' : 'Upload Image'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Section (read-only if editing) */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">Section</label>
                  <select
                    value={form.section}
                    onChange={e => setForm(p => ({ ...p, section: e.target.value as Section }))}
                    disabled={!!editingItem}
                    className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                  >
                    {SECTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Display Type */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">Display Type</label>
                  <select
                    value={form.displayType}
                    onChange={e => setForm(p => ({ ...p, displayType: e.target.value as DisplayType }))}
                    className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                  >
                    {DISPLAY_TYPES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. In-Room Dining"
                  className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">Subtitle</label>
                <input
                  type="text"
                  value={form.subtitle || ''}
                  onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))}
                  placeholder="e.g. Available 24 hours"
                  className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Icon */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">Icon (Emoji)</label>
                  <input
                    type="text"
                    value={form.icon || ''}
                    onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                    placeholder="e.g. 🍽️"
                    className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-on-surface">Color (Tailwind)</label>
                  <input
                    type="text"
                    value={form.color || ''}
                    onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    placeholder="bg-gradient-to-br from-..."
                    className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* BG Image URL */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">Background Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.bgImage || ''}
                    onChange={e => setForm(p => ({ ...p, bgImage: e.target.value }))}
                    placeholder="https://... or upload above"
                    className="flex-1 p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => triggerUpload('bgImage')}
                    className="px-3 py-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-xs flex items-center gap-1 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingId === 'bgImage' ? '...' : 'Upload'}
                  </button>
                </div>
              </div>

              {/* Display Content */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-on-surface">
                  Display Content *
                  <span className={`ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full ${displayTypeInfo(form.displayType).color}`}>
                    {displayTypeInfo(form.displayType).hint}
                  </span>
                </label>
                {form.displayType === 'IMAGE_ONLY' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.displayContent}
                      onChange={e => setForm(p => ({ ...p, displayContent: e.target.value }))}
                      placeholder="https://image-url.jpg"
                      className="flex-1 p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={() => triggerUpload('displayContent')}
                      className="px-3 py-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-xs flex items-center gap-1 transition"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingId === 'displayContent' ? '...' : 'Upload'}
                    </button>
                  </div>
                ) : form.displayType === 'SERVICE_REQUEST' ? (
                  <div className="space-y-2">
                    {(() => {
                      let items: any[] = [];
                      try {
                        items = JSON.parse(form.displayContent || '[]');
                        if (!Array.isArray(items)) items = [];
                      } catch(e) {
                        items = [];
                      }
                      return (
                        <>
                          {items.length > 0 && (
                            <div className="flex gap-2 items-center px-2 pb-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                              <div className="w-24">รหัส (ID)</div>
                              <div className="flex-1">ชื่อบริการ (Item Name)</div>
                              <div className="w-36">ไอคอน (Icon Code)</div>
                              <div className="w-7"></div>
                            </div>
                          )}
                          {items.map((item, index) => (
                            <div key={index} className="flex gap-2 items-center bg-surface-container p-2 rounded-lg border border-outline-variant">
                              <input 
                                type="text" 
                                placeholder="ID (e.g. h1)" 
                                value={item.id || ''} 
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[index] = { ...newItems[index], id: e.target.value };
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                }} 
                                className="w-24 p-1.5 border border-outline-variant rounded text-xs bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                              />
                              <input 
                                type="text" 
                                placeholder="Item Name (e.g. Fresh Towel)" 
                                value={item.name || ''} 
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[index] = { ...newItems[index], name: e.target.value };
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                }} 
                                className="flex-1 p-1.5 border border-outline-variant rounded text-xs bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                              />
                              <input 
                                type="text" 
                                placeholder="Material Icon (e.g. dry_cleaning)" 
                                value={item.icon || ''} 
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[index] = { ...newItems[index], icon: e.target.value };
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                }} 
                                className="w-36 p-1.5 border border-outline-variant rounded text-xs bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const newItems = items.filter((_, i) => i !== index);
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                }} 
                                className="p-1.5 text-error hover:bg-error/10 rounded transition-colors"
                                title="Remove Item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button 
                            type="button"
                            onClick={() => {
                              const newItems = [...items, { id: 'item_' + Date.now(), name: '', icon: '' }];
                              setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                            }}
                            className="w-full py-2 border-2 border-dashed border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            + Add Request Item
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : form.displayType === 'TEXT_INFO' ? (
                  <div className="space-y-2">
                    {(() => {
                      let kvMap: Record<string, string> = {};
                      try {
                        const parsed = JSON.parse(form.displayContent || '{}');
                        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                          kvMap = parsed;
                        }
                      } catch(e) {
                        kvMap = {};
                      }
                      const entries = Object.entries(kvMap);

                      return (
                        <>
                          {entries.length > 0 && (
                            <div className="flex gap-2 items-center px-2 pb-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                              <div className="w-1/3">หัวข้อ (Label)</div>
                              <div className="flex-1">รายละเอียด (Details)</div>
                              <div className="w-7"></div>
                            </div>
                          )}
                          {entries.map(([key, value], index) => (
                            <div key={index} className="flex gap-2 items-center bg-surface-container p-2 rounded-lg border border-outline-variant">
                              <input 
                                type="text" 
                                placeholder="Label (e.g. Opening Hours)" 
                                value={key} 
                                onChange={e => {
                                  const newKey = e.target.value;
                                  const newObj: Record<string, string> = {};
                                  entries.forEach(([k, v], i) => {
                                    if (i === index) newObj[newKey] = v;
                                    else newObj[k] = v;
                                  });
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                                }} 
                                className="w-1/3 p-1.5 border border-outline-variant rounded text-xs bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                              />
                              <input 
                                type="text" 
                                placeholder="Details (e.g. 10:00 - 22:00)" 
                                value={value} 
                                onChange={e => {
                                  const newValue = e.target.value;
                                  const newObj = { ...kvMap, [key]: newValue };
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                                }} 
                                className="flex-1 p-1.5 border border-outline-variant rounded text-xs bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const newObj = { ...kvMap };
                                  delete newObj[key];
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                                }} 
                                className="p-1.5 text-error hover:bg-error/10 rounded transition-colors"
                                title="Remove Row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button 
                            type="button"
                            onClick={() => {
                              const newKey = 'New Field ' + (entries.length + 1);
                              const newObj = { ...kvMap, [newKey]: '' };
                              setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                            }}
                            className="w-full py-2 border-2 border-dashed border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            + Add Information Row
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    value={form.displayContent}
                    onChange={e => setForm(p => ({ ...p, displayContent: e.target.value }))}
                    placeholder={displayTypeInfo(form.displayType).hint}
                    className="w-full p-2 border border-outline-variant rounded-lg bg-surface-container text-on-surface text-sm focus:border-primary focus:outline-none font-mono"
                  />
                )}
              </div>

              {/* Scheduling Fields */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-primary">Active From (Schedule)</label>
                  <input
                    type="datetime-local"
                    value={form.activeFrom || ''}
                    onChange={e => setForm(p => ({ ...p, activeFrom: e.target.value }))}
                    className="w-full p-2 border border-outline-variant rounded-lg bg-white text-on-surface text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">Leave empty to activate immediately</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-primary">Active Until (Expiry)</label>
                  <input
                    type="datetime-local"
                    value={form.activeUntil || ''}
                    onChange={e => setForm(p => ({ ...p, activeUntil: e.target.value }))}
                    className="w-full p-2 border border-outline-variant rounded-lg bg-white text-on-surface text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">Leave empty for no expiry</p>
                </div>
              </div>

              {/* Helper templates */}
              {form.displayType === 'TEXT_INFO' && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline text-left"
                  onClick={() => setForm(p => ({ ...p, displayContent: JSON.stringify({ hours: '09:00 – 22:00', info: 'Your info here', contact: 'Ext. 400' }, null, 2) }))}
                >
                  📋 Insert TEXT_INFO template
                </button>
              )}
              {form.displayType === 'SERVICE_REQUEST' && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline text-left"
                  onClick={() => setForm(p => ({ ...p, displayContent: JSON.stringify([{ id: 'item1', name: 'Fresh Towel', icon: 'dry_cleaning' }, { id: 'item2', name: 'Water', icon: 'water_drop' }], null, 2) }))}
                >
                  📋 Insert SERVICE_REQUEST template
                </button>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.displayContent.trim() || saving}
              >
                {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}

export default GuestServices;
