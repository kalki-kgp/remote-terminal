import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PTYManager } from './pty-manager.js';
import { TokenAuth } from './auth.js';
import { TunnelManager, CloudflareTunnel } from './tunnel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const TUNNEL_TYPE = process.env.TUNNEL || 'ngrok'; // 'ngrok' or 'cloudflare'
const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN || null;

// Initialize components
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const ptyManager = new PTYManager();
const auth = new TokenAuth();

// Serve static files
app.use(express.static(join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  // Extract token from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[WS] New connection attempt: ${sessionId}`);

  // Validate token
  if (!auth.validateToken(token)) {
    console.log(`[WS] Invalid token, closing connection: ${sessionId}`);
    ws.close(4001, 'Invalid token');
    return;
  }

  auth.markAuthenticated(sessionId);
  console.log(`[WS] Authenticated: ${sessionId}`);

  // Create PTY session
  const ptyProcess = ptyManager.createSession(sessionId);

  // Send PTY output to WebSocket
  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[PTY] Process exited: ${sessionId} (code: ${exitCode}, signal: ${signal})`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      ws.close();
    }
  });

  // Handle incoming WebSocket messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case 'input':
          ptyManager.write(sessionId, msg.data);
          break;

        case 'resize':
          ptyManager.resize(sessionId, msg.cols, msg.rows);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log(`[WS] Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error(`[WS] Error parsing message: ${error.message}`);
    }
  });

  // Handle WebSocket close
  ws.on('close', () => {
    console.log(`[WS] Connection closed: ${sessionId}`);
    auth.revokeSession(sessionId);
    ptyManager.destroySession(sessionId);
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`[WS] Error: ${sessionId} - ${error.message}`);
  });

  // Send ready message
  ws.send(JSON.stringify({ type: 'ready', sessionId }));
});

// Start server and tunnel
async function start() {
  server.listen(PORT, async () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🖥️  Remote Terminal Server                       ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Local:  http://localhost:${PORT}                            ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Start tunnel
    try {
      let tunnelUrl;

      if (TUNNEL_TYPE === 'cloudflare') {
        const tunnel = new CloudflareTunnel();
        tunnelUrl = await tunnel.start(PORT);
      } else {
        const tunnel = new TunnelManager();
        tunnelUrl = await tunnel.startNgrok(PORT, NGROK_TOKEN);
      }

      const accessUrl = `${tunnelUrl}?token=${auth.getToken()}`;

      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║           🌐 Remote Access Ready                          ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log('║                                                           ║');
      console.log('║  Access URL (copy this to your phone):                    ║');
      console.log('║                                                           ║');
      console.log(`║  ${tunnelUrl}`);
      console.log('║                                                           ║');
      console.log('║  Token:                                                   ║');
      console.log(`║  ${auth.getToken()}`);
      console.log('║                                                           ║');
      console.log('║  Full URL with token:                                     ║');
      console.log(`║  ${accessUrl}`);
      console.log('║                                                           ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log('║  ⚠️  Keep this token secret! Anyone with it can access    ║');
      console.log('║     your terminal.                                        ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('Press Ctrl+C to stop the server');

    } catch (error) {
      console.error('');
      console.error('╔═══════════════════════════════════════════════════════════╗');
      console.error('║  ❌ Failed to start tunnel                                ║');
      console.error('╠═══════════════════════════════════════════════════════════╣');
      console.error(`║  ${error.message}`);
      console.error('║                                                           ║');
      console.error('║  You can still access locally:                            ║');
      console.error(`║  http://localhost:${PORT}?token=${auth.getToken()}`);
      console.error('╚═══════════════════════════════════════════════════════════╝');
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  ptyManager.destroyAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down...');
  ptyManager.destroyAll();
  server.close();
  process.exit(0);
});

start();
