import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { trackEvent } from '../lib/analytics';

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => ({
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    }))
  };
});

// Mock Analytics
vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

// Mock LiveTVPlayer
vi.mock('../components/LiveTVPlayer', () => ({
  default: () => <div data-testid="live-tv-player">LiveTVPlayer</div>
}));

// Mock global fetch to avoid real network requests
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  })
) as any;

describe('App Component Analytics Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track MENU_CLICK when a main menu item is selected', async () => {
    render(<App />);

    // Wait for the app to initialize (loading screen finishes after 2.5s)
    // To speed up tests, we could use fake timers, but simple waitFor works if we just mock delay
    // Actually the loading screen doesn't block the DOM rendering of the main menu under it, 
    // it just overlays it. We can find the buttons.

    const entertainmentButton = await screen.findByText('Entertainment');
    fireEvent.click(entertainmentButton);

    expect(trackEvent).toHaveBeenCalledWith('MENU_CLICK', { menu: 'Entertainment' });
  });

  it('should track APP_OPEN when a streaming app is launched', async () => {
    render(<App />);

    // Click Entertainment to reveal the apps
    const entertainmentButton = await screen.findByText('Entertainment');
    fireEvent.click(entertainmentButton);

    // Click Netflix app
    const netflixButton = await screen.findByText('Netflix');
    fireEvent.click(netflixButton);

    expect(trackEvent).toHaveBeenCalledWith('APP_OPEN', {
      appName: 'Netflix',
      packageName: 'com.netflix.ninja'
    });
  });
});
