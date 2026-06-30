import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Save, Upload, Image as ImageIcon, Plus, X, Type } from 'lucide-react';

interface BackgroundImage {
  tag: string;
  url: string;
  message?: string;
  file?: File;
  previewUrl?: string;
}

export default function PortalSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [portalMainTitle, setPortalMainTitle] = useState('LUXE');
  const [portalSubtitle, setPortalSubtitle] = useState('Concierge');
  
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setPortalMainTitle(data.portal_main_title || 'LUXE');
      setPortalSubtitle(data.portal_subtitle || 'Concierge');

      const defaultMessages: Record<string, string> = {
        'Default': 'Welcome to a sanctuary of elegance, {name}. We wish you a truly exceptional stay.',
        'VIP': 'An exquisite experience awaits you, {name}. Welcome to your private haven of luxury.',
        'Honeymoon': 'A timeless romantic escape begins here. Wishing you endless joy and unforgettable memories, {name}.'
      };

      const bgs = data.backgroundImages || [];
      const requiredTags = ['Default', 'VIP', 'Honeymoon'];
      const mergedBgs = [...bgs];
      requiredTags.forEach(tag => {
        let existing = mergedBgs.find((b: any) => b.tag === tag);
        if (!existing) {
          mergedBgs.push({ tag, url: '', message: defaultMessages[tag] || '' });
        } else if (!existing.message) {
          existing.message = defaultMessages[tag] || '';
        }
      });
      setBackgroundImages(mergedBgs);
    } catch (err) {
      console.error(err);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('portal_main_title', portalMainTitle);
      formData.append('portal_subtitle', portalSubtitle);
      
      const bgData = backgroundImages.map(bg => ({ tag: bg.tag, url: bg.url, message: bg.message || '' }));
      formData.append('backgroundImages', JSON.stringify(bgData));

      backgroundImages.forEach((bg) => {
        if (bg.file) {
          formData.append(`bgImage_${bg.tag}`, bg.file);
        }
      });

      await api.updateSettings(formData);
      alert('Portal settings saved successfully!');
      fetchSettings(); // Refresh
    } catch (err) {
      console.error(err);
      alert('Failed to save portal settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-on-surface">Loading portal settings...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-on-surface mb-2">Portal Settings</h1>
          <p className="text-on-surface-variant">Configure background images for the TV Portal based on guest tags.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          <Save size={20} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm mb-6">
        <div className="flex items-center space-x-3 mb-6">
          <Type className="text-secondary" size={24} />
          <h2 className="text-xl font-semibold text-on-surface">Portal Header Text</h2>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Main Title (e.g. LUXE)</label>
            <input
              type="text"
              value={portalMainTitle}
              onChange={e => setPortalMainTitle(e.target.value)}
              className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="e.g. LUXE"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">Subtitle (e.g. Concierge)</label>
            <input
              type="text"
              value={portalSubtitle}
              onChange={e => setPortalSubtitle(e.target.value)}
              className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              placeholder="e.g. Concierge"
            />
          </div>
        </div>
      </div>

      <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <ImageIcon className="text-pink-400" size={24} />
            <h2 className="text-xl font-semibold text-on-surface">Portal Background Images</h2>
          </div>
          <button
            onClick={() => {
                if (backgroundImages.length < 5) {
                  setBackgroundImages([...backgroundImages, { tag: `Tag ${backgroundImages.length + 1}`, url: '' }]);
                }
            }}
            disabled={backgroundImages.length >= 5}
            className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2 border border-outline-variant"
          >
            <Plus size={16} /> Add New Tag
          </button>
        </div>
        
        <div className="space-y-6">
          {backgroundImages.map((bg, index) => (
            <div key={index} className="flex items-start space-x-6 border-b border-outline-variant pb-6 last:border-0 last:pb-0">
              <div className="flex-1">
                <div className="mb-4 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                        type="text"
                        value={bg.tag}
                        onChange={e => {
                          const newBgs = [...backgroundImages];
                          newBgs[index].tag = e.target.value;
                          setBackgroundImages(newBgs);
                        }}
                        disabled={['Default', 'VIP', 'Honeymoon'].includes(bg.tag)}
                        className="bg-surface border border-outline rounded-lg px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary disabled:opacity-70"
                    />
                    {!['Default', 'VIP', 'Honeymoon'].includes(bg.tag) && (
                      <button onClick={() => {
                        const newBgs = [...backgroundImages];
                        newBgs.splice(index, 1);
                        setBackgroundImages(newBgs);
                      }} className="text-error hover:text-error/80 p-1 flex items-center justify-center rounded hover:bg-error/10 transition-colors">
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={bg.message || ''}
                    onChange={e => {
                      const newBgs = [...backgroundImages];
                      newBgs[index].message = e.target.value;
                      setBackgroundImages(newBgs);
                    }}
                    placeholder="Welcome message (e.g. Please check in at the front desk)"
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="relative border-2 border-dashed border-outline-variant rounded-xl p-4 hover:bg-surface-container-high transition-colors group text-center h-24 flex flex-col justify-center">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const newBgs = [...backgroundImages];
                          newBgs[index].file = file;
                          newBgs[index].previewUrl = reader.result as string;
                          setBackgroundImages(newBgs);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <Upload className="mx-auto h-6 w-6 text-on-surface-variant group-hover:text-primary mb-1" />
                  <p className="text-xs text-on-surface-variant">Click to upload (JPEG, PNG, WebP)</p>
                </div>
              </div>
              
              <div className="w-48 h-32 rounded-lg overflow-hidden border border-outline shadow-lg relative bg-black shrink-0">
                {(bg.previewUrl || bg.url) ? (
                  <img src={bg.previewUrl || (bg.url.startsWith('http') ? bg.url : `http://${window.location.hostname}:3000${bg.url}`)} alt="Preview" className="w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-outline text-sm">No Image</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 pointer-events-none">
                  <span className="text-xs text-white font-medium">{bg.tag}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
