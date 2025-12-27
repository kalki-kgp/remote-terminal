import { spawn } from 'child_process';

// ngrok Tunnel (spawns ngrok CLI)
export class TunnelManager {
  constructor() {
    this.process = null;
    this.url = null;
  }

  async startNgrok(port, authtoken = null) {
    return new Promise((resolve, reject) => {
      const args = ['http', port.toString(), '--log', 'stdout'];

      if (authtoken) {
        args.push('--authtoken', authtoken);
      }

      this.process = spawn('ngrok', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      const handleOutput = (data) => {
        output += data.toString();
        // ngrok outputs URL in various formats, look for https URL
        const match = output.match(/url=(https:\/\/[^\s]+)/);
        if (match && !this.url) {
          this.url = match[1];
          console.log(`[Tunnel] ngrok tunnel established`);
          resolve(this.url);
        }
      };

      this.process.stdout.on('data', handleOutput);
      this.process.stderr.on('data', handleOutput);

      this.process.on('error', (error) => {
        if (error.code === 'ENOENT') {
          reject(new Error('ngrok not found. Install with: brew install ngrok'));
        } else {
          reject(new Error(`Failed to start ngrok: ${error.message}`));
        }
      });

      this.process.on('close', (code) => {
        if (!this.url) {
          // Check for common ngrok errors
          if (output.includes('ERR_NGROK_108')) {
            reject(new Error('ngrok session limit reached (free tier = 1 session). Close other ngrok instances or use --cloudflare'));
          } else if (output.includes('authentication failed')) {
            reject(new Error('ngrok auth failed. Run: ngrok config add-authtoken YOUR_TOKEN'));
          } else {
            reject(new Error(`ngrok exited (code ${code}). Install with: brew install ngrok`));
          }
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.url) {
          reject(new Error('Timeout waiting for ngrok tunnel URL'));
        }
      }, 30000);
    });
  }

  getUrl() {
    return this.url;
  }

  stop() {
    if (this.process) {
      this.process.kill();
      console.log(`[Tunnel] ngrok tunnel closed`);
    }
  }
}

// Cloudflare Tunnel (requires cloudflared installed)
export class CloudflareTunnel {
  constructor() {
    this.process = null;
    this.url = null;
  }

  async start(port) {
    return new Promise((resolve, reject) => {
      // cloudflared quick tunnel (no account needed)
      this.process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let resolved = false;

      this.process.stderr.on('data', (data) => {
        output += data.toString();

        // Cloudflare outputs the URL to stderr
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          this.url = match[0];
          console.log(`[Tunnel] Cloudflare tunnel established`);
          resolve(this.url);
        }
      });

      this.process.on('error', (error) => {
        if (resolved) return;
        if (error.code === 'ENOENT') {
          reject(new Error('cloudflared not found. Install with: brew install cloudflared'));
        } else {
          reject(new Error(`Failed to start cloudflared: ${error.message}`));
        }
      });

      this.process.on('close', (code) => {
        if (!resolved) {
          reject(new Error(`cloudflared exited with code ${code}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          reject(new Error('Timeout waiting for cloudflare tunnel URL'));
        }
      }, 30000);
    });
  }

  getUrl() {
    return this.url;
  }

  stop() {
    if (this.process) {
      this.process.kill();
      console.log(`[Tunnel] Cloudflare tunnel closed`);
    }
  }
}
