import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Save, Upload, Hotel, Type, Image as ImageIcon, MonitorPlay, Plus, X } from 'lucide-react';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [hotelName, setHotelName] = useState('');
  const [hotelStars, setHotelStars] = useState('');
  const [loadingTitle, setLoadingTitle] = useState('');
  const [loadingSubtitle, setLoadingSubtitle] = useState('');
  
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [bgImagePreview, setBgImagePreview] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setHotelName(data.hotel_name || '');
      setHotelStars(data.hotel_stars || '★★★★★');
      setLoadingTitle(data.loading_title || 'PREPARING YOUR EXPERIENCE');
      setLoadingSubtitle(data.loading_subtitle || 'Establishing secure connection to the hotel network...');
      if (data.loading_bg_image) {
        const bgUrl = data.loading_bg_image.startsWith('http') 
          ? data.loading_bg_image 
          : `http://${window.location.hostname}:3000${data.loading_bg_image}`;
        setBgImagePreview(bgUrl);
      }


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
      formData.append('hotel_name', hotelName);
      formData.append('hotel_stars', hotelStars);
      formData.append('loading_title', loadingTitle);
      formData.append('loading_subtitle', loadingSubtitle);
      
      if (bgImageFile) {
        formData.append('loading_bg_image', bgImageFile);
      }

      await api.updateSettings(formData);
      alert('Settings saved successfully!');
      fetchSettings(); // Refresh
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBgImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBgImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return <div className="p-8 text-on-surface">Loading settings...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-on-surface mb-2">Brand & Display Settings</h1>
          <p className="text-on-surface-variant">Configure your hotel's branding and the TV premium loading screen.</p>
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

      <div className="space-y-6">
        {/* Basic Brand Info */}
        <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <Hotel className="text-primary" size={24} />
            <h2 className="text-xl font-semibold text-on-surface">Hotel Information</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">Hotel Name (Displayed on TV)</label>
              <input
                type="text"
                value={hotelName}
                onChange={e => setHotelName(e.target.value)}
                className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                placeholder="e.g. GRAND HORIZON"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">Hotel Stars</label>
              <input
                type="text"
                value={hotelStars}
                onChange={e => setHotelStars(e.target.value)}
                className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                placeholder="e.g. ★★★★★"
              />
            </div>
          </div>
        </div>

        {/* Premium Loading Screen Settings */}
        <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <Type className="text-secondary" size={24} />
            <h2 className="text-xl font-semibold text-on-surface">Premium Loading Screen</h2>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-2">Loading Title</label>
                <input
                  type="text"
                  value={loadingTitle}
                  onChange={e => setLoadingTitle(e.target.value)}
                  className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="e.g. PREPARING YOUR EXPERIENCE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-2">Loading Subtitle</label>
                <input
                  type="text"
                  value={loadingSubtitle}
                  onChange={e => setLoadingSubtitle(e.target.value)}
                  className="w-full bg-surface border border-outline rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="e.g. Establishing secure connection..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2 flex items-center space-x-2">
                <ImageIcon size={16} />
                <span>Background Image (Optional)</span>
              </label>
              
              <div className="flex items-start space-x-6">
                <div className="flex-1">
                  <div className="relative border-2 border-dashed border-outline-variant rounded-xl p-8 hover:bg-surface-container-high transition-colors group text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <Upload className="mx-auto h-12 w-12 text-on-surface-variant group-hover:text-primary mb-3" />
                    <p className="text-sm text-on-surface-variant mb-1">Click or drag image to upload</p>
                    <p className="text-xs text-outline">1920x1080 recommended (JPG, PNG)</p>
                  </div>
                </div>

                {bgImagePreview && (
                  <div className="w-64 h-36 rounded-lg overflow-hidden border border-outline shadow-lg relative bg-black">
                    <img src={bgImagePreview} alt="Preview" className="w-full h-full object-cover opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                      <span className="text-xs text-white font-medium">Preview</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Panel */}
        <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="flex items-center space-x-3 mb-6">
            <MonitorPlay className="text-green-500" size={24} />
            <h2 className="text-xl font-semibold text-on-surface">Live Preview</h2>
          </div>
          
          <div className="relative w-full aspect-video bg-[#050505] rounded-xl overflow-hidden border border-gray-700 shadow-2xl flex flex-col items-center justify-center font-['Montserrat',sans-serif] text-white">
            {bgImagePreview ? (
              <div className="absolute inset-0 z-10">
                <img src={bgImagePreview} alt="Background" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30"></div>
              </div>
            ) : (
              <div 
                className="absolute inset-0 z-10"
                style={{ background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 70%)' }}
              ></div>
            )}

            <div className="relative z-20 flex flex-col items-center text-center scale-75 sm:scale-100 origin-center">
              {/* Hotel Brand */}
              <div 
                className="font-['Cinzel',serif] text-4xl sm:text-5xl font-semibold tracking-[0.2em] mb-2 drop-shadow-lg"
                style={{
                  background: 'linear-gradient(to right, #996515, #F3E5AB, #996515)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {hotelName || 'GRAND HORIZON'}
              </div>
              
              <div className="text-[#D4AF37] text-lg sm:text-xl tracking-[0.3em] mb-12 drop-shadow-md">
                {hotelStars || '★★★★★'}
              </div>

              {/* Elegant Loader (Static for preview to avoid excessive re-renders, or animated) */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 mb-6">
                <div 
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#D4AF37]"
                  style={{
                    borderLeftColor: 'rgba(212, 175, 55, 0.1)',
                    borderRightColor: 'rgba(212, 175, 55, 0.1)',
                    borderBottomColor: 'rgba(212, 175, 55, 0.1)',
                    animation: 'spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite'
                  }}
                ></div>
                <div 
                  className="absolute top-[8px] left-[8px] right-[8px] bottom-[8px] sm:top-[10px] sm:left-[10px] sm:right-[10px] sm:bottom-[10px] rounded-full border-2 border-transparent border-b-[#F3E5AB]"
                  style={{
                    borderLeftColor: 'rgba(212, 175, 55, 0.1)',
                    borderRightColor: 'rgba(212, 175, 55, 0.1)',
                    borderTopColor: 'rgba(212, 175, 55, 0.1)',
                    animation: 'spin-reverse 2s linear infinite'
                  }}
                ></div>
              </div>

              {/* Text */}
              <div className="text-lg sm:text-xl font-light tracking-[0.15em] text-[#e0e0e0] mb-2 animate-pulse">
                {loadingTitle || 'PREPARING YOUR EXPERIENCE'}
              </div>
              <div className="text-xs sm:text-sm font-light tracking-[0.05em] text-gray-400 max-w-2xl px-4 whitespace-nowrap sm:whitespace-normal">
                {loadingSubtitle || 'Establishing secure connection to the hotel network...'}
              </div>
            </div>

            <style>{`
              @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Montserrat:wght@300;400;600&display=swap');
              @keyframes spin { 100% { transform: rotate(360deg); } }
              @keyframes spin-reverse { 100% { transform: rotate(-360deg); } }
            `}</style>
          </div>
        </div>

      </div>
    </div>
  );
}
