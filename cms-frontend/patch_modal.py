import sys

with open('src/pages/GuestServices.tsx', 'r') as f:
    lines = f.readlines()

new_imports = """import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui/Button';
import { api, type GuestMenuItem, type DisplayType } from '../lib/api';
import { RefreshCw, Trash2, Plus, Edit2, Upload, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

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

const PREMIUM_GRADIENTS = [
  { name: 'Midnight Navy', value: 'bg-gradient-to-br from-[#0f2027] to-[#2c5364]', css: 'linear-gradient(to bottom right, #0f2027, #2c5364)' },
  { name: 'Champagne Gold', value: 'bg-gradient-to-br from-[#bf953f] via-[#fcf6ba] to-[#b38728]', css: 'linear-gradient(to bottom right, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)' },
  { name: 'Emerald Lux', value: 'bg-gradient-to-br from-[#004d40] to-[#009688]', css: 'linear-gradient(to bottom right, #004d40, #009688)' },
  { name: 'Ruby Red', value: 'bg-gradient-to-br from-[#4a0010] to-[#8b0000]', css: 'linear-gradient(to bottom right, #4a0010, #8b0000)' },
  { name: 'Royal Amethyst', value: 'bg-gradient-to-br from-[#30142b] to-[#8a2387]', css: 'linear-gradient(to bottom right, #30142b, #8a2387)' },
  { name: 'Onyx Black', value: 'bg-gradient-to-br from-[#141e30] to-[#243b55]', css: 'linear-gradient(to bottom right, #141e30, #243b55)' },
  { name: 'Rose Gold', value: 'bg-gradient-to-br from-[#b76e79] to-[#e0bfb8]', css: 'linear-gradient(to bottom right, #b76e79, #e0bfb8)' },
  { name: 'Icy Cyan', value: 'bg-gradient-to-br from-[#001f3f] to-[#0088a9]', css: 'linear-gradient(to bottom right, #001f3f, #0088a9)' },
];

const COMMON_EMOJIS = ['❄️', '🏊‍♂️', '🍽️', '🧖‍♀️', '🏋️‍♂️', '💆‍♀️', '🎾', '🛎️'];

"""

new_modal = """      {/* ── MODAL ── */}
      {modalOpen && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99999,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div 
            className="bg-[#0d1720] overflow-hidden flex flex-col text-[#e2e8f0] font-sans"
            style={{ 
              width: '100%', 
              maxWidth: '980px', 
              height: '85vh',
              maxHeight: '850px',
              border: '1px solid #1e2d3d',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-6 py-6 border-b border-[#1e2d3d]">
              <div className="text-[#e8b656] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white m-0 tracking-wide" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <div className="flex-1" />
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
              {/* Left Pane: Preview */}
              <div className="w-full md:w-[320px] md:min-w-[320px] p-8 px-6 bg-black/20 border-b md:border-b-0 md:border-r border-[#1e2d3d] flex flex-col items-center justify-start gap-6 overflow-y-auto">
                {/* Live Preview Card */}
                <div 
                  className="w-[250px] h-[335px] min-h-[335px] rounded-[20px] flex flex-col relative overflow-hidden transition-all duration-300 bg-cover bg-center shadow-[0_16px_32px_-8px_rgba(0,0,0,0.7)]"
                  style={{
                    background: form.bgImage ? `url(${form.bgImage}) center/cover` : (PREMIUM_GRADIENTS.find(g => g.value === form.color)?.css || 'linear-gradient(to bottom right, #1e293b, #0f172a)')
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none z-10"></div>
                  
                  <div className="relative z-20 h-full flex flex-col justify-between p-5">
                    {/* Top Badge */}
                    <div 
                      className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.1em] uppercase rounded-full bg-black/50 backdrop-blur-md border"
                      style={{
                        color: DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'purple' ? '#9a75ff' :
                               DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'amber' ? '#e9c176' :
                               DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'green' ? '#48bb78' : '#63b3ed',
                        borderColor: DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'purple' ? '#9a75ff' :
                                     DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'amber' ? '#e9c176' :
                                     DISPLAY_TYPES.find(d => d.value === form.displayType)?.color.match(/text-(\w+)-\d+/)?.[0].replace('text-', '') === 'green' ? '#48bb78' : '#63b3ed'
                      }}
                    >
                      {form.displayType === 'QR_CODE' && <span className="material-symbols-outlined text-[14px]">qr_code</span>}
                      {form.displayType === 'IMAGE_ONLY' && <span className="material-symbols-outlined text-[14px]">image</span>}
                      {form.displayType === 'TEXT_INFO' && <span className="material-symbols-outlined text-[14px]">info</span>}
                      {form.displayType === 'SERVICE_REQUEST' && <span className="material-symbols-outlined text-[14px]">checklist</span>}
                      {DISPLAY_TYPES.find(d => d.value === form.displayType)?.label || 'ITEM'}
                    </div>
                    
                    {/* Bottom Text */}
                    <div className="flex flex-col">
                      <h3 className="font-bold text-white m-0 mb-1.5 leading-[1.1] drop-shadow-md" style={{ fontFamily: '"Playfair Display", serif', fontSize: '1.8rem' }}>
                        {form.name || 'Untitled Item'}
                      </h3>
                      <p className="text-[#c6c6ce] m-0 leading-snug line-clamp-2" style={{ fontFamily: '"Manrope", sans-serif', fontSize: '0.85rem' }}>
                        {form.subtitle}
                      </p>
                    </div>
                  </div>
                </div>

                {/* QR PREVIEW */}
                {form.displayType === 'QR_CODE' && (
                  <div className="flex flex-col items-center w-full mb-3">
                    <div className="w-full flex justify-center pb-0.5 mb-2">
                      <span className="font-bold text-[0.65rem] text-[#94a3b8] tracking-wider uppercase font-sans">Scannable QR Preview</span>
                    </div>
                    <div className="w-[130px] h-[130px] bg-white rounded-2xl flex items-center justify-center shadow-lg p-2">
                      <QRCodeCanvas 
                        value={form.displayContent || 'https://example.com'} 
                        size={110} 
                        bgColor="#ffffff" 
                        fgColor="#1a202c" 
                        level="M" 
                      />
                    </div>
                  </div>
                )}

                {/* Meta Rows */}
                <div className="w-full flex flex-col gap-3 mt-auto bg-black/30 p-3 rounded-xl border border-white/5">
                  <div className="flex justify-between font-mono text-[0.75rem] text-[#94a3b8] pb-2 border-b border-[#1e2d3d]">
                    <span>SECTION</span>
                    <span className="text-[#5fd4f0]">{SECTIONS.find(s => s.key === form.section)?.label || 'Services'}</span>
                  </div>
                  <div className="flex justify-between font-mono text-[0.75rem] text-[#94a3b8]">
                    <span>TYPE</span>
                    <span className="text-[#5fd4f0]">{DISPLAY_TYPES.find(d => d.value === form.displayType)?.label || 'QR Code'}</span>
                  </div>
                </div>
              </div>

              {/* Right Pane: Edit Form */}
              <div className="flex-1 p-8 overflow-y-auto">
                
                {/* 1. Placement */}
                <div className="mb-9">
                  <div className="flex items-center mb-6">
                    <h4 className="text-[0.75rem] uppercase tracking-widest text-[#94a3b8] m-0 whitespace-nowrap" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Placement</h4>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#1e2d3d] to-transparent ml-4"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="flex flex-col gap-2">
                      <label className="font-semibold text-[0.875rem] text-white">Section</label>
                      <select
                        value={form.section}
                        onChange={e => setForm(p => ({ ...p, section: e.target.value as Section }))}
                        disabled={!!editingItem}
                        className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none appearance-none"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 14px center', backgroundRepeat: 'no-repeat', paddingRight: '40px' }}
                      >
                        {SECTIONS.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-semibold text-[0.875rem] text-white">Display Type</label>
                      <select
                        value={form.displayType}
                        onChange={e => setForm(p => ({ ...p, displayType: e.target.value as DisplayType }))}
                        className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none appearance-none"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 14px center', backgroundRepeat: 'no-repeat', paddingRight: '40px' }}
                      >
                        {DISPLAY_TYPES.map(d => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Item details */}
                <div className="mb-9">
                  <div className="flex items-center mb-6">
                    <h4 className="text-[0.75rem] uppercase tracking-widest text-[#94a3b8] m-0 whitespace-nowrap" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Item details</h4>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#1e2d3d] to-transparent ml-4"></div>
                  </div>
                  <div className="flex flex-col gap-2 mb-5">
                    <label className="font-semibold text-[0.875rem] text-white flex items-center gap-2">Name <span className="text-[#e8b656]">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Ice Bath & Sauna"
                      className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-semibold text-[0.875rem] text-white">Subtitle</label>
                    <input
                      type="text"
                      value={form.subtitle}
                      onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))}
                      placeholder="e.g. Health declaration"
                      className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none"
                    />
                  </div>
                </div>

                {/* 3. Appearance */}
                <div className="mb-9">
                  <div className="flex items-center mb-6">
                    <h4 className="text-[0.75rem] uppercase tracking-widest text-[#94a3b8] m-0 whitespace-nowrap" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>Appearance</h4>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#1e2d3d] to-transparent ml-4"></div>
                  </div>
                  
                  <div className="flex flex-col gap-2 mb-5">
                    <label className="font-semibold text-[0.875rem] text-white flex items-center gap-2">
                      Emoji Icon 
                      <span className="font-mono text-[0.65rem] bg-[#5fd4f0]/10 text-[#5fd4f0] px-2 py-0.5 rounded tracking-wide">Optional flair</span>
                    </label>
                    <div className="flex gap-3 flex-wrap">
                      {COMMON_EMOJIS.map(emoji => (
                        <div 
                          key={emoji}
                          onClick={() => {
                            const cleanName = form.name.replace(/^[\p{Emoji}\u200d\uFE0F]+\s*/u, '');
                            setForm(p => ({ ...p, name: `${emoji} ${cleanName}` }));
                          }}
                          className={`w-11 h-11 rounded-lg bg-[#131f2b] border ${form.name.startsWith(emoji) ? 'border-[#5fd4f0] bg-[#5fd4f0]/5 ring-2 ring-[#5fd4f0]/20' : 'border-[#1e2d3d] hover:border-[#5fd4f0]/50'} flex items-center justify-center text-xl cursor-pointer transition-all`}
                        >
                          {emoji}
                        </div>
                      ))}
                      <input 
                        type="text"
                        maxLength={2}
                        placeholder="+"
                        title="Type your own emoji"
                        onChange={(e) => {
                          const emoji = e.target.value.trim();
                          if (emoji) {
                            const cleanName = form.name.replace(/^[\p{Emoji}\u200d\uFE0F]+\s*/u, '');
                            setForm(p => ({ ...p, name: `${emoji} ${cleanName}` }));
                          }
                        }}
                        className="w-11 h-11 rounded-lg bg-white/5 border border-dashed border-[#1e2d3d] text-center text-xl text-white outline-none focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 transition-all placeholder-[#94a3b8]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mb-5">
                    <label className="font-semibold text-[0.875rem] text-white flex items-center gap-2">
                      Color 
                      <span className="font-mono text-[0.65rem] bg-[#5fd4f0]/10 text-[#5fd4f0] px-2 py-0.5 rounded tracking-wide">Premium Gradients</span>
                    </label>
                    <div className="flex gap-3 flex-wrap">
                      {PREMIUM_GRADIENTS.map(grad => (
                        <div 
                          key={grad.name}
                          onClick={() => setForm(p => ({ ...p, color: grad.value }))}
                          className={`w-11 h-11 rounded-lg border-2 cursor-pointer flex items-center justify-center transition-transform hover:scale-105 shadow-inner ${form.color === grad.value || (!PREMIUM_GRADIENTS.find(g => g.value === form.color) && grad.name === 'Midnight Navy') ? 'border-white shadow-[0_0_0_3px_rgba(255,255,255,0.15)]' : 'border-transparent'}`}
                          style={{ background: grad.css }}
                          title={grad.name}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 text-white transition-opacity ${form.color === grad.value || (!PREMIUM_GRADIENTS.find(g => g.value === form.color) && grad.name === 'Midnight Navy') ? 'opacity-100' : 'opacity-0'}`}>
                            <path d="M20 6L9 17l-5-5"/>
                          </svg>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-semibold text-[0.875rem] text-white">Background Image</label>
                    <div 
                      onClick={() => triggerUpload('bgImage')}
                      className="border border-dashed border-[#1e2d3d] bg-[#131f2b] rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-[#5fd4f0] hover:bg-[#5fd4f0]/[0.02]"
                    >
                      <div className="text-[#94a3b8] mb-3 flex justify-center">
                        {uploadingId === 'bgImage' ? (
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <Upload className="w-6 h-6" />
                        )}
                      </div>
                      <p className="text-[0.875rem] text-white font-medium m-0 mb-1">Click to upload or drag and drop</p>
                      <p className="text-[0.75rem] text-[#94a3b8] m-0">Recommended dimensions: 600x800px (JPG/PNG)</p>
                      {form.bgImage && (
                        <div className="mt-3 text-xs text-[#5fd4f0] break-all">{form.bgImage}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* DYNAMIC SECTIONS */}
                <div className="mb-9">
                  <div className="flex items-center mb-6">
                    <h4 className="text-[0.75rem] uppercase tracking-widest text-[#94a3b8] m-0 whitespace-nowrap" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
                      {form.displayType === 'QR_CODE' && 'QR Content'}
                      {form.displayType === 'IMAGE_ONLY' && 'Image Content'}
                      {form.displayType === 'TEXT_INFO' && 'Text Information'}
                      {form.displayType === 'SERVICE_REQUEST' && 'Service Items'}
                    </h4>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#1e2d3d] to-transparent ml-4"></div>
                  </div>

                  {/* Display Content Render */}
                  <div className="flex flex-col gap-2">
                    {form.displayType === 'QR_CODE' && (
                      <>
                        <label className="font-semibold text-[0.875rem] text-white flex items-center gap-2">
                          Destination URL
                          <span className="font-mono text-[0.65rem] bg-[#5fd4f0]/10 text-[#5fd4f0] px-2 py-0.5 rounded tracking-wide">URL to encode</span>
                        </label>
                        <textarea
                          value={form.displayContent}
                          onChange={e => setForm(p => ({ ...p, displayContent: e.target.value }))}
                          placeholder="https://forms.hotel.com/health-declaration"
                          className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none font-mono min-h-[80px]"
                        />
                      </>
                    )}

                    {form.displayType === 'IMAGE_ONLY' && (
                      <>
                        <label className="font-semibold text-[0.875rem] text-white">Full Screen Image</label>
                        <div 
                          onClick={() => triggerUpload('displayContent')}
                          className="border border-dashed border-[#1e2d3d] bg-[#131f2b] rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-[#5fd4f0] hover:bg-[#5fd4f0]/[0.02]"
                        >
                          <div className="text-[#94a3b8] mb-3 flex justify-center">
                            {uploadingId === 'displayContent' ? (
                              <RefreshCw className="w-6 h-6 animate-spin" />
                            ) : (
                              <Upload className="w-6 h-6" />
                            )}
                          </div>
                          <p className="text-[0.875rem] text-white font-medium m-0 mb-1">Click to upload image</p>
                          <p className="text-[0.75rem] text-[#94a3b8] m-0">Recommended dimensions: 1920x1080px</p>
                          {form.displayContent && !form.displayContent.startsWith('{') && !form.displayContent.startsWith('[') && (
                            <div className="mt-3 text-xs text-[#5fd4f0] break-all">{form.displayContent}</div>
                          )}
                        </div>
                        <p className="text-[0.75rem] text-[#94a3b8] text-center mt-3 mb-2">Or provide a URL directly:</p>
                        <input
                          type="text"
                          value={form.displayContent}
                          onChange={e => setForm(p => ({ ...p, displayContent: e.target.value }))}
                          placeholder="https://example.com/promotion.jpg"
                          className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none"
                        />
                      </>
                    )}

                    {form.displayType === 'TEXT_INFO' && (
                      <div className="space-y-3">
                        <label className="font-semibold text-[0.875rem] text-white">Information Rows</label>
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
                              <div id="text-info-list" className="space-y-3">
                                {entries.map(([key, value], index) => (
                                  <div key={index} className="flex gap-3 items-center">
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
                                      className="flex-1 bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] outline-none"
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
                                      className="flex-1 bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] outline-none"
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const newObj = { ...kvMap };
                                        delete newObj[key];
                                        setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                                      }} 
                                      className="text-[#94a3b8] hover:text-[#ef4444] hover:bg-[#ef4444]/10 p-2 rounded-lg flex items-center justify-center transition-all"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button 
                                type="button"
                                onClick={() => {
                                  const newKey = 'New Field ' + (entries.length + 1);
                                  const newObj = { ...kvMap, [newKey]: '' };
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newObj) }));
                                }}
                                className="w-full mt-2 py-3 border border-dashed border-[#1e2d3d] bg-transparent text-[#5fd4f0] font-semibold rounded-lg hover:border-[#5fd4f0] hover:bg-[#5fd4f0]/5 transition-colors"
                              >
                                + Add Information Row
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {form.displayType === 'SERVICE_REQUEST' && (
                      <div className="space-y-3">
                        <label className="font-semibold text-[0.875rem] text-white">Requestable Items</label>
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
                              <div id="service-item-list" className="space-y-3">
                                {items.map((item, index) => (
                                  <div key={index} className="flex gap-3 items-center">
                                    <select 
                                      value={item.icon || 'checkroom'} 
                                      onChange={e => {
                                        const newItems = [...items];
                                        newItems[index] = { ...newItems[index], icon: e.target.value };
                                        setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                      }} 
                                      className="w-40 bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] outline-none appearance-none"
                                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundPosition: 'right 14px center', backgroundRepeat: 'no-repeat', paddingRight: '30px' }}
                                    >
                                      <option value="checkroom">�� Checkroom</option>
                                      <option value="water_drop">💧 Water</option>
                                      <option value="restaurant">🍽️ Food</option>
                                      <option value="cleaning_services">🧹 Cleaning</option>
                                      <option value="dry_cleaning">👔 Dry Clean</option>
                                      <option value="spa">💆 Spa</option>
                                      <option value="health_and_safety">🏥 Health</option>
                                    </select>
                                    <input 
                                      type="text" 
                                      placeholder="Item Name (e.g. Extra Towel)" 
                                      value={item.name || ''} 
                                      onChange={e => {
                                        const newItems = [...items];
                                        newItems[index] = { ...newItems[index], name: e.target.value, id: item.id || 'req_' + Date.now() };
                                        setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                      }} 
                                      className="flex-1 bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] outline-none"
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const newItems = items.filter((_, i) => i !== index);
                                        setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                      }} 
                                      className="text-[#94a3b8] hover:text-[#ef4444] hover:bg-[#ef4444]/10 p-2 rounded-lg flex items-center justify-center transition-all"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button 
                                type="button"
                                onClick={() => {
                                  const newItems = [...items, { id: 'item_' + Date.now(), name: '', icon: 'checkroom' }];
                                  setForm(p => ({ ...p, displayContent: JSON.stringify(newItems) }));
                                }}
                                className="w-full mt-2 py-3 border border-dashed border-[#1e2d3d] bg-transparent text-[#5fd4f0] font-semibold rounded-lg hover:border-[#5fd4f0] hover:bg-[#5fd4f0]/5 transition-colors"
                              >
                                + Add Requestable Item
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Scheduling Fields */}
                  <div className="grid grid-cols-2 gap-5 p-5 bg-[#5fd4f0]/5 rounded-xl border border-[#5fd4f0]/20 mb-9">
                    <div className="flex flex-col gap-2">
                      <label className="font-semibold text-[0.875rem] text-[#5fd4f0]">Active From (Schedule)</label>
                      <input
                        type="datetime-local"
                        value={form.activeFrom || ''}
                        onChange={e => setForm(p => ({ ...p, activeFrom: e.target.value }))}
                        className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none"
                      />
                      <p className="text-[0.65rem] text-[#94a3b8] m-0">Leave empty to activate immediately</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-semibold text-[0.875rem] text-[#5fd4f0]">Active Until (Expiry)</label>
                      <input
                        type="datetime-local"
                        value={form.activeUntil || ''}
                        onChange={e => setForm(p => ({ ...p, activeUntil: e.target.value }))}
                        className="w-full bg-[#131f2b] border border-[#1e2d3d] text-white p-3 rounded-lg focus:border-[#5fd4f0] focus:ring-2 focus:ring-[#5fd4f0]/20 outline-none"
                      />
                      <p className="text-[0.65rem] text-[#94a3b8] m-0">Leave empty for no expiry</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-5 border-t border-[#1e2d3d] bg-[#0d1720] flex justify-end gap-3 z-10 relative shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
                <button 
                  onClick={closeModal}
                  className="font-semibold text-[0.875rem] px-5 py-2.5 rounded-lg text-[#94a3b8] bg-transparent hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim() || !form.displayContent.trim() || saving}
                  className="font-semibold text-[0.875rem] px-5 py-2.5 rounded-lg text-black bg-gradient-to-br from-[#5fd4f0] to-[#3b82f6] shadow-[0_4px_12px_rgba(95,212,240,0.2)] hover:shadow-[0_6px_16px_rgba(95,212,240,0.3)] hover:brightness-110 focus:ring-[3px] focus:ring-[#5fd4f0]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}"""

lines_to_keep_before = lines[:285] # up to line 285
lines_to_keep_after = lines[705:] # from line 706

# Find where to replace imports
first_import_idx = 0
for i, line in enumerate(lines_to_keep_before):
    if line.startswith('import '):
        first_import_idx = i
        break

empty_form_idx = 0
for i, line in enumerate(lines_to_keep_before):
    if line.startswith('const EMPTY_FORM'):
        empty_form_idx = i
        break

final_lines = [new_imports] + lines_to_keep_before[empty_form_idx:]

with open('src/pages/GuestServices.tsx', 'w') as f:
    f.writelines(final_lines)
    f.write(new_modal)
    f.writelines(lines_to_keep_after)
