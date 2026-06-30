import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiveTVPlayer from '../LiveTVPlayer';
import { trackEvent } from '../../lib/analytics';

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

const mockChannels = [
  { id: '1', number: 1, name: 'CH 1', streamUrl: 'http://test1' },
  { id: '2', number: 2, name: 'CH 2', streamUrl: 'http://test2' }
];

describe('LiveTVPlayer Analytics Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track CHANNEL_WATCH with duration when unmounted', () => {
    const { unmount } = render(
      <LiveTVPlayer 
        channels={mockChannels} 
        initialChannelIndex={0} 
        onExit={vi.fn()} 
      />
    );

    // Advance time by 45 seconds
    act(() => {
      vi.advanceTimersByTime(45000);
    });

    // Unmount
    act(() => {
      unmount();
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      'CHANNEL_WATCH',
      { channelId: '1', name: 'CH 1', number: 1 },
      45
    );
  });

  it('should track PLAYBACK_ERROR when native error event is dispatched', () => {
    render(
      <LiveTVPlayer 
        channels={mockChannels} 
        initialChannelIndex={0} 
        onExit={vi.fn()} 
      />
    );

    act(() => {
      const errorEvent = new CustomEvent('nativePlayerError', {
        detail: { message: 'Stream timeout' }
      });
      window.dispatchEvent(errorEvent);
    });

    expect(trackEvent).toHaveBeenCalledWith(
      'PLAYBACK_ERROR',
      { error: 'Stream timeout' }
    );
  });
});
