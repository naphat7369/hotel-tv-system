import { PrismaClient, Channel } from '@prisma/client';
import dgram from 'dgram';
import http from 'http';
import https from 'https';

const prisma = new PrismaClient();

export class StreamService {
  private static io: any;
  private static interval: NodeJS.Timeout | null = null;
  // Store channel status: id -> boolean (alive/dead)
  private static statusMap: Record<string, boolean> = {};

  public static init(io: any) {
    this.io = io;
    console.log('[StreamService] Initialized. Starting background probe...');
    this.startProbing();
  }

  private static startProbing() {
    if (this.interval) clearInterval(this.interval);
    
    // Probe every 15 seconds to avoid overloading
    this.interval = setInterval(async () => {
      try {
        await this.probeAllChannels();
      } catch (err) {
        console.error('[StreamService] Probing error:', err);
      }
    }, 15000);

    // Initial probe
    this.probeAllChannels();
  }

  private static async probeAllChannels() {
    const channels = await prisma.channel.findMany({
      where: { isActive: true },
    });

    const checks = channels.map(async (ch) => {
      let isAlive = false;

      // 1. If we have an explicit Stream URL (HTTP/HTTPS)
      if (ch.streamUrl && (ch.streamUrl.startsWith('http://') || ch.streamUrl.startsWith('https://'))) {
        isAlive = await this.checkHttpStream(ch.streamUrl);
      }
      // 2. If it's UDP Multicast (inputProtocol = UDP and inputIp/inputPort present)
      else if (ch.inputProtocol === 'UDP' && ch.inputIp && ch.inputPort) {
        isAlive = await this.checkUdpStream(ch.inputIp, ch.inputPort);
      }
      // 3. Fallback or unsupported type
      else {
        // Cannot probe, mark as false or ignore
        isAlive = false;
      }

      this.statusMap[ch.id] = isAlive;
    });

    await Promise.allSettled(checks);

    // Broadcast the updated status map to CMS clients
    if (this.io) {
      this.io.emit('channel_status_update', this.statusMap);
    }
  }

  private static checkHttpStream(url: string, timeoutMs = 4000): Promise<boolean> {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      let resolved = false;

      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        if (!resolved) {
          resolved = true;
          // As long as the server responds with 2xx or 3xx or 401/403 (meaning it exists),
          // or 200 OK for m3u8. We'll consider any response < 500 as "alive server".
          // Ideally, we want 200.
          if (res.statusCode && res.statusCode < 400) {
            resolve(true);
          } else {
            resolve(false);
          }
          req.destroy();
        }
      });

      req.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
          req.destroy();
        }
      });

      req.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });
    });
  }

  private static checkUdpStream(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { socket.close(); } catch {}
          resolve(false);
        }
      }, timeoutMs);

      socket.on('message', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { socket.close(); } catch {}
          resolve(true);
        }
      });

      socket.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { socket.close(); } catch {}
          resolve(false);
        }
      });

      socket.bind(port, () => {
        try {
          socket.addMembership(ip);
        } catch (e) {
          // Sometimes adding membership fails if interface doesn't support multicast
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            try { socket.close(); } catch {}
            resolve(false);
          }
        }
      });
    });
  }
}
