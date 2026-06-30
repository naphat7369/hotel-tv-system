/**
 * LiveTVPlayer.tsx
 *
 * Architecture: Native ExoPlayer Bridge
 * ─────────────────────────────────────────────────────────────────────────
 * This component is now a PURE UI OVERLAY. It no longer handles any
 * video decoding or buffering. Instead:
 *
 *   1. When the user selects a channel, it calls:
 *        window.AndroidTVBridge.playStream("udp://@239.x.x.x:port")
 *      → The native ExoPlayer in Kotlin starts decoding the UDP stream
 *        and renders it on the PlayerView that sits BEHIND this WebView.
 *
 *   2. The React app sets the document body background to transparent,
 *      making the underlying native video visible through the WebView.
 *
 *   3. All OSD (channel info overlay), D-Pad navigation, and error state
 *      remain in React/WebView for maximum flexibility.
 *
 *   4. On exit, it calls window.AndroidTVBridge.stopStream() and
 *      restores the opaque background.
 *
 * Fallback: If window.AndroidTVBridge is NOT available (desktop browser
 * preview, development), the component falls back to a native <video>
 * element with HLS.js for testing purposes.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { trackEvent } from '../lib/analytics';

// ── Type augmentation: tell TypeScript about the native bridge ────────────
declare global {
  interface Window {
    AndroidTVBridge?: {
      playStream: (url: string) => void;
      stopStream: () => void;
      isNativePlayer: () => boolean;
      getCurrentStream: () => string;
    };
    Hls?: unknown; // HLS.js loaded dynamically for fallback only
  }
}

// ── Channel interface (matches the BackendChannel shape from App.tsx) ─────
export interface Channel {
  id: string;
  number: number;
  name: string;
  streamUrl: string;
  logoUrl?: string | null;
  category?: string;
}

// ── Props ──────────────────────────────────────────────────────────────────
interface LiveTVPlayerProps {
  channels: Channel[];
  initialChannelIndex: number;
  onExit: () => void;
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

function hasNativeBridge(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.AndroidTVBridge !== 'undefined' &&
    typeof window.AndroidTVBridge.playStream === 'function';
}

function makeBodyTransparent() {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const root = document.getElementById('root');
  if (root) root.style.background = 'transparent';
}

function restoreBodyBackground() {
  document.documentElement.style.background = '';
  document.body.style.background = '';
  const root = document.getElementById('root');
  if (root) root.style.background = '';
}

// ════════════════════════════════════════════════════════════════════════════
//  FALLBACK PLAYER (Browser / Development only)
// ════════════════════════════════════════════════════════════════════════════

function FallbackVideoPlayer({
  streamUrl,
  onError,
}: {
  streamUrl: string;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let hlsInstance: { destroy: () => void } | null = null;

    const load = async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(console.warn);
          });
          hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string }) => {
            if (data.fatal) onError(`Stream error: ${data.type}`);
          });
          hlsInstance = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
          video.play().catch(console.warn);
        } else {
          onError('HLS not supported in this browser.');
        }
      } catch {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
          video.play().catch(console.warn);
        } else {
          onError('Video playback not supported.');
        }
      }
    };

    load();
    return () => {
      hlsInstance?.destroy();
    };
  }, [streamUrl, onError]);

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover"
      autoPlay
      playsInline
      muted={false}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  CHANNEL LIST OVERLAY — Glassmorphism + Category Tabs
// ════════════════════════════════════════════════════════════════════════════

// Category icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  'All':        '⊞',
  'Live TV':    '📡',
  'News':       '📰',
  'Sports':     '⚽',
  'Movies':     '🎬',
  'Kids':       '🎨',
  'Music':      '🎵',
  'Documentary':'🌍',
  'Entertainment':'🎭',
  'Lifestyle':  '✨',
};

function getCategoryIcon(cat: string): string {
  return CATEGORY_ICONS[cat] ?? '📺';
}

function ChannelListOverlay({
  channels,
  currentIndex,
  focusedIndex,
  onFocusChange,
  onSelect,
  categoryIndex,
  onCategoryChange,
}: {
  channels: Channel[];
  currentIndex: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onSelect: (index: number) => void;
  categoryIndex: number;
  onCategoryChange: (categories: string[], idx: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Derive unique categories
  const categories = ['All', ...Array.from(new Set(channels.map(c => c.category ?? 'Live TV')))];

  // Clamp categoryIndex within bounds
  const safeCatIdx = Math.max(0, Math.min(categoryIndex, categories.length - 1));
  const activeCategory = categories[safeCatIdx] ?? 'All';

  // Sync category list back to parent whenever it changes
  useEffect(() => {
    onCategoryChange(categories, safeCatIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCatIdx, categories.length]);

  const filteredChannels = activeCategory === 'All'
    ? channels
    : channels.filter(c => (c.category ?? 'Live TV') === activeCategory);

  // Auto-scroll focused item into view
  useEffect(() => {
    const el = itemRefs.current[focusedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '30vw',
        /* Optimized Glassmorphism for TV */
        background: 'rgba(8, 14, 35, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '6px 0 30px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        animation: 'slideInLeft 0.2s cubic-bezier(0.2,0.8,0.2,1)',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
      {/* Depth orbs */}
      <div style={{ position:'absolute', top:'-10vh', left:'-5vw', width:'20vw', height:'40vh', background:'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'absolute', bottom:'5vh', right:'-3vw', width:'15vw', height:'30vh', background:'radial-gradient(ellipse, rgba(14,165,233,0.12) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

      {/* ── Header ── */}
      <div style={{ padding:'2.2vh 1.8vw 1.2vh', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0, position:'relative', zIndex:1 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.7vw' }}>
            <div style={{ width:'2.2vw', height:'2.2vw', background:'linear-gradient(135deg,#6366f1,#0ea5e9)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1vw', boxShadow:'0 2px 12px rgba(99,102,241,0.4)' }}>📺</div>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:'1.1vw', letterSpacing:'0.04em', lineHeight:1.2 }}>Channel List</div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.6vw', letterSpacing:'0.12em' }}>{filteredChannels.length} OF {channels.length} CHANNELS</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.3vw', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'999px', padding:'0.3vh 0.6vw' }}>
            <div style={{ width:'0.4vw', height:'0.4vw', borderRadius:'50%', background:'#ef4444', boxShadow:'0 0 6px #ef4444', animation:'pulse 1.2s infinite' }} />
            <span style={{ color:'#ef4444', fontSize:'0.6vw', fontWeight:700, letterSpacing:'0.1em' }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ padding:'1vh 1.2vw', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0, position:'relative', zIndex:1, overflowX:'auto', scrollbarWidth:'none' }}>
        <div style={{ display:'flex', gap:'0.5vw', alignItems:'center' }}>
          {categories.map((cat, catIdx) => {
            const isActive = catIdx === safeCatIdx;
            return (
              <button key={cat} onClick={() => onCategoryChange(categories, catIdx)} style={{ display:'flex', alignItems:'center', gap:'0.3vw', padding:'0.5vh 0.8vw', borderRadius:'999px', border: isActive ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)', background: isActive ? 'linear-gradient(135deg,rgba(99,102,241,0.35),rgba(14,165,233,0.25))' : 'rgba(255,255,255,0.04)', color: isActive ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: isActive ? 700 : 400, fontSize:'0.7vw', cursor:'pointer', whiteSpace:'nowrap', transition:'background-color 0.2s ease, border-color 0.2s ease', boxShadow: isActive ? '0 0 12px rgba(99,102,241,0.3)' : 'none', letterSpacing:'0.04em', outline:'none' }}>
                <span style={{ fontSize:'0.75vw' }}>{getCategoryIcon(cat)}</span>
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Channel List ── */}
      <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'0.8vh 0', scrollbarWidth:'none', position:'relative', zIndex:1 }}>
        {filteredChannels.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'1vh', color:'rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize:'2.5vw' }}>📭</div>
            <div style={{ fontSize:'0.8vw', letterSpacing:'0.1em' }}>NO CHANNELS</div>
          </div>
        )}
        {filteredChannels.map((ch, idx) => {
          const isFocused = idx === focusedIndex;
          const isCurrent = channels.indexOf(ch) === currentIndex;
          return (
            <div
              key={ch.id}
              ref={(el) => { itemRefs.current[idx] = el; }}
              onClick={() => onSelect(channels.indexOf(ch))}
              onMouseEnter={() => onFocusChange(idx)}
              style={{ display:'flex', alignItems:'center', gap:'0.8vw', padding:'1.1vh 1.5vw', cursor:'pointer', position:'relative', transition:'transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease', transform: isFocused ? 'scale(1.02)' : 'scale(1)', transformOrigin: 'left center', willChange: 'transform', background: isFocused ? 'rgba(255,255,255,0.07)' : 'transparent', marginInline:'0.5vw', borderRadius:'10px', border: isFocused ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent', boxShadow: isFocused ? 'inset 0 0 0 1px rgba(99,102,241,0.25), 0 4px 15px rgba(0,0,0,0.3)' : 'none' }}
            >
              {isFocused && <div style={{ position:'absolute', left:0, top:'15%', bottom:'15%', width:'2.5px', borderRadius:'999px', background:'linear-gradient(180deg,#6366f1,#0ea5e9)', boxShadow:'0 0 8px rgba(99,102,241,0.8)' }} />}

              {/* CH# */}
              <div style={{ width:'2vw', height:'2vw', borderRadius:'6px', background: isFocused ? 'linear-gradient(135deg,rgba(99,102,241,0.5),rgba(14,165,233,0.4))' : 'rgba(255,255,255,0.05)', border: isFocused ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7vw', fontWeight:700, color: isFocused ? '#a5b4fc' : 'rgba(255,255,255,0.3)', fontFamily:'monospace', flexShrink:0 }}>
                {ch.number.toString().padStart(2,'0')}
              </div>

              {/* Logo */}
              {ch.logoUrl ? (
                <img src={ch.logoUrl} alt={ch.name} style={{ width:'2.8vw', height:'2.8vw', objectFit:'contain', borderRadius:'8px', background:'rgba(255,255,255,0.06)', padding:'3px', flexShrink:0, border: isFocused ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.04)', filter: isFocused ? 'brightness(1.1)' : 'brightness(0.85)', transition:'all 0.18s ease' }} />
              ) : (
                <div style={{ width:'2.8vw', height:'2.8vw', background: isFocused ? 'linear-gradient(135deg,#6366f1,#0ea5e9)' : 'rgba(255,255,255,0.06)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'0.75vw', color:'#fff', flexShrink:0, border: isFocused ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                  {ch.name.substring(0,2).toUpperCase()}
                </div>
              )}

              {/* Name */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color: isFocused ? '#fff' : isCurrent ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)', fontWeight: isFocused ? 700 : isCurrent ? 600 : 400, fontSize:'0.9vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', transition:'color 0.15s ease' }}>{ch.name}</div>
                {ch.category && <div style={{ color: isFocused ? 'rgba(165,180,252,0.7)' : 'rgba(255,255,255,0.2)', fontSize:'0.55vw', letterSpacing:'0.12em', marginTop:'0.1vh' }}>{getCategoryIcon(ch.category)} {ch.category.toUpperCase()}</div>}
              </div>

              {/* On Air badge */}
              {isCurrent && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.25vw', background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:'999px', padding:'0.2vh 0.4vw', flexShrink:0 }}>
                  <div style={{ width:'0.35vw', height:'0.35vw', borderRadius:'50%', background:'#4ade80', boxShadow:'0 0 5px #4ade80', animation:'pulse 1.5s infinite' }} />
                  <span style={{ color:'#4ade80', fontSize:'0.5vw', fontWeight:700, letterSpacing:'0.08em' }}>ON AIR</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding:'1vh 1.8vw', borderTop:'1px solid rgba(255,255,255,0.05)', display:'flex', gap:'1.5vw', flexShrink:0, position:'relative', zIndex:1, background:'rgba(0,0,0,0.15)' }}>
        {[{key:'OK',label:'Watch'},{key:'↑↓',label:'Navigate'},{key:'◀',label:'Close'}].map(({key,label}) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:'0.3vw' }}>
            <div style={{ background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.35)', borderRadius:'4px', padding:'0.15vh 0.4vw', color:'#a5b4fc', fontSize:'0.62vw', fontWeight:700, letterSpacing:'0.05em' }}>{key}</div>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.6vw' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

const LiveTVPlayer: React.FC<LiveTVPlayerProps> = ({
  channels,
  initialChannelIndex,
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialChannelIndex);
  const [showOSD, setShowOSD]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [isNative]                      = useState(() => hasNativeBridge());

  // Channel List Panel state
  const [showChannelList, setShowChannelList] = useState(false);
  const [focusedIndex, setFocusedIndex]       = useState(initialChannelIndex);

  const osdTimerRef = useRef<number | null>(null);
  const currentChannel = channels[currentIndex];

  // ── OSD Logic ─────────────────────────────────────────────────────────
  const triggerOSD = useCallback(() => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = window.setTimeout(() => setShowOSD(false), 4000);
  }, []);

  // ── Channel Switching ──────────────────────────────────────────────────
  const switchToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    setFocusedIndex(index);
    setShowChannelList(false);
    triggerOSD();
  }, [triggerOSD]);

  const switchChannel = useCallback((direction: 'UP' | 'DOWN') => {
    if (channels.length === 0) return;
    if (showChannelList) {
      // Navigate within channel list (wrap around)
      setFocusedIndex(prev => {
        const next = direction === 'DOWN'
          ? (prev + 1) % channels.length
          : (prev - 1 + channels.length) % channels.length;
        return next;
      });
    } else {
      // Direct channel switching (wrap around)
      setCurrentIndex(prev => {
        const next = direction === 'DOWN'
          ? (prev + 1) % channels.length
          : (prev - 1 + channels.length) % channels.length;
        return next;
      });
      triggerOSD();
    }
  }, [channels.length, showChannelList, triggerOSD]);

  // ── Handle exit cleanly ────────────────────────────────────────────────
  const handleExit = useCallback(() => {
    if (showChannelList) {
      // First Back closes the panel
      setShowChannelList(false);
      return;
    }
    if (isNative && window.AndroidTVBridge) {
      window.AndroidTVBridge.stopStream();
    }
    restoreBodyBackground();
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    onExit();
  }, [isNative, onExit, showChannelList]);

  // ── Category tab navigation ──────────────────────────────────────────
  const [categoryIndex, setCategoryIndex] = useState(0);
  const categoriesRef = useRef<string[]>(['All']);

  // Updated by ChannelListOverlay via callback
  const handleCategoryChange = useCallback((categories: string[], idx: number) => {
    categoriesRef.current = categories;
    setCategoryIndex(idx);
  }, []);

  const cycleCategoryLeft = useCallback(() => {
    setCategoryIndex(prev => {
      const newIdx = (prev - 1 + categoriesRef.current.length) % categoriesRef.current.length;
      return newIdx;
    });
  }, []);

  const cycleCategoryRight = useCallback(() => {
    setCategoryIndex(prev => {
      const newIdx = (prev + 1) % categoriesRef.current.length;
      return newIdx;
    });
  }, []);

  // ── Keyboard / D-Pad Navigation ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Backspace', 'Enter'].includes(e.key) ||
          e.keyCode === 4) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'ArrowUp':
          switchChannel('UP');
          break;
        case 'ArrowDown':
          switchChannel('DOWN');
          break;
        case 'ArrowLeft':
          if (showChannelList) {
            cycleCategoryLeft();
            setFocusedIndex(0); // reset to top when switching category
          }
          break;
        case 'ArrowRight':
          if (showChannelList) {
            cycleCategoryRight();
            setFocusedIndex(0);
          }
          break;
        case 'Escape':
        case 'Backspace':
          handleExit();
          break;
        case 'Enter':
          if (showChannelList) {
            // Confirm channel selection
            switchToIndex(focusedIndex);
          } else {
            // Open channel list and show OSD
            setFocusedIndex(currentIndex);
            setShowChannelList(true);
            triggerOSD();
          }
          break;
      }
      // Android Back button keyCode
      if (e.keyCode === 4) handleExit();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchChannel, handleExit, triggerOSD, showChannelList, focusedIndex, currentIndex, switchToIndex, cycleCategoryLeft, cycleCategoryRight]);

  // ── Listen for native player errors dispatched by Kotlin ──────────────
  useEffect(() => {
    const handleNativeError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      const errorMsg = customEvent.detail?.message ?? 'Unknown';
      setError(`Signal Error: ${errorMsg}`);
      
      // Track playback error
      trackEvent('PLAYBACK_ERROR', { error: errorMsg });
    };
    window.addEventListener('nativePlayerError', handleNativeError);
    return () => window.removeEventListener('nativePlayerError', handleNativeError);
  }, []);

  // ── Analytics: Track Watch Time ───────────────────────────────────────
  const watchStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Reset timer when channel changes
    watchStartTimeRef.current = Date.now();

    return () => {
      // Calculate watch duration when unmounting or switching channel
      const durationSeconds = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
      if (durationSeconds > 0 && currentChannel) {
        trackEvent('CHANNEL_WATCH', {
          channelId: currentChannel.id,
          name: currentChannel.name,
          number: currentChannel.number
        }, durationSeconds);
      }
    };
  }, [currentChannel]);

  // ── Start/Switch stream when channel changes ───────────────────────────
  // NOTE: triggerOSD removed from deps to prevent re-triggering playStream
  // every time the OSD timer cycles (which caused the video flicker).
  const triggerOSDRef = useRef(triggerOSD);
  triggerOSDRef.current = triggerOSD;

  useEffect(() => {
    if (!currentChannel?.streamUrl) return;

    setError(null);
    triggerOSDRef.current();

    if (isNative && window.AndroidTVBridge) {
      makeBodyTransparent();
      window.AndroidTVBridge.playStream(currentChannel.streamUrl);
      console.log('[LiveTVPlayer] Native: playStream →', currentChannel.streamUrl);
    } else {
      restoreBodyBackground();
      console.log('[LiveTVPlayer] Fallback HLS: using <video> element');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel?.streamUrl, isNative]);

  // ── Initial transparent setup ─────────────────────────────────────────
  useEffect(() => {
    if (isNative) {
      makeBodyTransparent();
    }
    return () => {
      restoreBodyBackground();
    };
  }, [isNative]);

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: isNative ? 'transparent' : '#000',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Slide-in animation keyframes */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        div::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Fallback video element (browser / development only) ── */}
      {!isNative && currentChannel?.streamUrl && (
        <FallbackVideoPlayer
          streamUrl={currentChannel.streamUrl}
          onError={setError}
        />
      )}

      {/* ── Channel List Overlay (shown on OK press) ── */}
      {showChannelList && (
        <>
          {/* Dim overlay behind panel */}
          <div
            onClick={() => setShowChannelList(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 199,
            }}
          />
          <ChannelListOverlay
            channels={channels}
            currentIndex={currentIndex}
            focusedIndex={focusedIndex}
            onFocusChange={setFocusedIndex}
            onSelect={switchToIndex}
            categoryIndex={categoryIndex}
            onCategoryChange={handleCategoryChange}
          />
        </>
      )}

      {/* ── Error Overlay ── */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          zIndex: 10,
        }}>
          <div style={{ fontSize: '5vw', marginBottom: '2vh', color: '#ef4444' }}>⚠</div>
          <h2 style={{ color: '#fff', fontSize: '3vw', fontWeight: 700, marginBottom: '1vh' }}>
            Signal Lost
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1.5vw' }}>{error}</p>
          <div style={{ marginTop: '4vh', color: '#6b7280', fontSize: '1vw' }}>
            Press <strong>BACK</strong> to return to menu
          </div>
        </div>
      )}

      {/* ── OSD — Channel Info Overlay (top left) ── */}
      <div style={{
        position: 'absolute',
        top: '4vh',
        left: '4vw',
        transform: showChannelList ? 'translateX(28vw)' : 'translateX(0)',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        padding: '1.5vh 2vw',
        opacity: (showOSD && !error) ? 1 : 0,
        transition: 'opacity 0.3s ease, transform 0.25s cubic-bezier(0.2,0.8,0.2,1)',
        willChange: 'transform, opacity',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          {currentChannel?.logoUrl ? (
            <img
              src={currentChannel.logoUrl}
              alt={currentChannel.name}
              style={{
                width: '4vw', height: '4vw',
                objectFit: 'contain',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.1)',
                padding: '4px',
              }}
            />
          ) : (
            <div style={{
              width: '4vw', height: '4vw',
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '2vw', color: '#fff',
              flexShrink: 0,
            }}>
              {currentChannel?.number}
            </div>
          )}

          <div>
            <h3 style={{
              color: '#fff',
              fontSize: '2.2vw',
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.1,
            }}>
              {currentChannel?.name}
            </h3>
            <p style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '1vw',
              margin: '0.4vh 0 0',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              {currentChannel?.category ?? 'Live TV'}
              {isNative && (
                <span style={{ marginLeft: '1vw', color: '#4ade80', fontSize: '0.85vw' }}>
                  ● Native ExoPlayer
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── Control Hints (bottom right, visible with OSD) ── */}
      <div style={{
        position: 'absolute',
        bottom: '4vh', right: '4vw',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '999px',
        padding: '1vh 1.5vw',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5vw',
        opacity: (showOSD && !error && !showChannelList) ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}>
        <span style={{ color: '#fff', fontSize: '1vw', display: 'flex', alignItems: 'center', gap: '0.5vw' }}>
          <span style={{ color: '#0ea5e9' }}>↑↓</span> CH Up/Down
        </span>
        <span style={{ width: 1, height: '1.2em', background: 'rgba(255,255,255,0.2)' }} />
        <span style={{ color: '#fff', fontSize: '1vw', display: 'flex', alignItems: 'center', gap: '0.5vw' }}>
          <span style={{ color: '#0ea5e9' }}>OK</span> Channel List
        </span>
        <span style={{ width: 1, height: '1.2em', background: 'rgba(255,255,255,0.2)' }} />
        <span style={{ color: '#fff', fontSize: '1vw', display: 'flex', alignItems: 'center', gap: '0.5vw' }}>
          <span style={{ color: '#0ea5e9' }}>↩</span> Back to Menu
        </span>
      </div>

      {/* ── Native Mode Indicator ── */}
      {isNative && showOSD && !showChannelList && (
        <div style={{
          position: 'absolute',
          top: '4vh', right: '4vw',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '8px',
          padding: '0.5vh 1vw',
          color: '#4ade80',
          fontSize: '0.9vw',
          pointerEvents: 'none',
        }}>
          🎬 UDP Multicast
        </div>
      )}
    </div>
  );
};

export default LiveTVPlayer;
