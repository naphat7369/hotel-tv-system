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

/**
 * Determine if we are running inside the native Android TV app with the
 * ExoPlayer bridge available. If not, we use a browser HLS.js fallback.
 */
function hasNativeBridge(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.AndroidTVBridge !== 'undefined' &&
    typeof window.AndroidTVBridge.playStream === 'function';
}

/**
 * Make the document body fully transparent so the native ExoPlayer
 * video surface (behind the WebView) is visible.
 */
function makeBodyTransparent() {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  // Also target the React root div
  const root = document.getElementById('root');
  if (root) root.style.background = 'transparent';
}

/**
 * Restore the document body to its default opaque dark background.
 */
function restoreBodyBackground() {
  document.documentElement.style.background = '';
  document.body.style.background = '';
  const root = document.getElementById('root');
  if (root) root.style.background = '';
}

// ════════════════════════════════════════════════════════════════════════════
//  FALLBACK PLAYER (Browser / Development only)
//  Only rendered when window.AndroidTVBridge is NOT available.
//  Uses a <video> element with dynamic HLS.js import.
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
      // Dynamically import hls.js only in browser fallback mode
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
        // HLS.js not installed (expected in production build)
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

  const osdTimerRef = useRef<number | null>(null);
  const currentChannel = channels[currentIndex];

  // ── OSD Logic ─────────────────────────────────────────────────────────
  const triggerOSD = useCallback(() => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = window.setTimeout(() => setShowOSD(false), 4000);
  }, []);

  // ── Channel Switching ──────────────────────────────────────────────────
  const switchChannel = useCallback((direction: 'UP' | 'DOWN') => {
    if (channels.length === 0) return;
    setCurrentIndex(prev => {
      // User expects 'ArrowDown' (เลื่อนลง) to go to next channel (prev + 1)
      // and 'ArrowUp' (เลื่อนขึ้น) to go to previous channel (prev - 1)
      const next = direction === 'DOWN'
        ? (prev + 1) % channels.length
        : (prev - 1 + channels.length) % channels.length;
      return next;
    });
    triggerOSD();
  }, [channels.length, triggerOSD]);

  // ── Handle exit cleanly ────────────────────────────────────────────────
  const handleExit = useCallback(() => {
    if (isNative && window.AndroidTVBridge) {
      window.AndroidTVBridge.stopStream();
    }
    restoreBodyBackground();
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    onExit();
  }, [isNative, onExit]);

  // ── Keyboard / D-Pad Navigation ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'Escape', 'Backspace'].includes(e.key) ||
          e.keyCode === 4) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'ArrowUp':   switchChannel('UP');   break;
        case 'ArrowDown': switchChannel('DOWN');  break;
        case 'Escape':
        case 'Backspace': handleExit();           break;
        case 'Enter':     triggerOSD();           break;
      }
      // Also handle Android Back button keyCode
      if (e.keyCode === 4) handleExit();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchChannel, handleExit, triggerOSD]);

  // ── Listen for native player errors dispatched by Kotlin ──────────────
  useEffect(() => {
    const handleNativeError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      setError(`Signal Error: ${customEvent.detail?.message ?? 'Unknown'}`);
    };
    window.addEventListener('nativePlayerError', handleNativeError);
    return () => window.removeEventListener('nativePlayerError', handleNativeError);
  }, []);

  // ── Start/Switch stream when channel changes ───────────────────────────
  useEffect(() => {
    if (!currentChannel?.streamUrl) return;

    setError(null);
    triggerOSD();

    if (isNative && window.AndroidTVBridge) {
      // ── Native ExoPlayer path ─────────────────────────────────────────
      // Make the React UI transparent so the native video shows through
      makeBodyTransparent();
      // Send the stream URL to Kotlin — ExoPlayer starts decoding immediately
      window.AndroidTVBridge.playStream(currentChannel.streamUrl);
      console.log('[LiveTVPlayer] Native: playStream →', currentChannel.streamUrl);
    } else {
      // ── Browser fallback ─────────────────────────────────────────────
      // Keep opaque background (video is inside the WebView via <video> tag)
      restoreBodyBackground();
      console.log('[LiveTVPlayer] Fallback HLS: using <video> element');
    }
  }, [currentChannel, isNative, triggerOSD]);

  // ── Initial transparent setup ─────────────────────────────────────────
  useEffect(() => {
    if (isNative) {
      makeBodyTransparent();
    }
    // Cleanup: always restore background on unmount
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
        // When native: transparent (video plays behind us)
        // When fallback: black (video element is inside this div)
        background: isNative ? 'transparent' : '#000',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── Fallback video element (browser / development only) ── */}
      {!isNative && currentChannel?.streamUrl && (
        <FallbackVideoPlayer
          streamUrl={currentChannel.streamUrl}
          onError={setError}
        />
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
          <div style={{
            fontSize: '5vw', marginBottom: '2vh',
            color: '#ef4444'
          }}>⚠</div>
          <h2 style={{ color: '#fff', fontSize: '3vw', fontWeight: 700, marginBottom: '1vh' }}>
            Signal Lost
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1.5vw' }}>{error}</p>
          <div style={{ marginTop: '4vh', color: '#6b7280', fontSize: '1vw' }}>
            Press <strong>BACK</strong> to return to menu
          </div>
        </div>
      )}

      {/* ── OSD — Channel Info Overlay ── */}
      <div style={{
        position: 'absolute',
        top: '4vh', left: '4vw',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        padding: '1.5vh 2vw',
        opacity: (showOSD && !error) ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          {/* Channel Logo */}
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
                <span style={{
                  marginLeft: '1vw',
                  color: '#4ade80',
                  fontSize: '0.85vw',
                }}>
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
        opacity: (showOSD && !error) ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}>
        <span style={{ color: '#fff', fontSize: '1vw', display: 'flex', alignItems: 'center', gap: '0.5vw' }}>
          <span style={{ color: '#0ea5e9' }}>↑↓</span> CH Up/Down
        </span>
        <span style={{ width: 1, height: '1.2em', background: 'rgba(255,255,255,0.2)' }} />
        <span style={{ color: '#fff', fontSize: '1vw', display: 'flex', alignItems: 'center', gap: '0.5vw' }}>
          <span style={{ color: '#0ea5e9' }}>↩</span> Back to Menu
        </span>
      </div>

      {/* ── Native Mode Indicator (debug, shows briefly) ── */}
      {isNative && showOSD && (
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
