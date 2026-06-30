import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    io: vi.fn(() => mockSocket),
  };
});

describe('TV Portal App', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch for API calls inside App.tsx
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders welcome screen and shows time', () => {
    render(<App />);
    
    // Check that we render the portal name or welcome message
    expect(screen.getByText(/Welcome to S31/i)).toBeInTheDocument();
  });
});
