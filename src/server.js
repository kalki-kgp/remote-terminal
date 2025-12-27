import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { SessionManager } from './session-manager.js';
import { TokenAuth } from './auth.js';
import { TunnelManager, CloudflareTunnel } from './tunnel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const TUNNEL_TYPE = process.env.TUNNEL || 'ngrok';
const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN || null;

// Initialize components
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const sessionManager = new SessionManager();
const auth = new TokenAuth();

// Store WebSocket connections per visitor
const wsConnections = new Map(); // visitorId -> Set<ws>

// Serve static files
app.use(express.static(join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stats: sessionManager.getStats(),
  });
});

// QR code endpoint (returns PNG image)
app.get('/qr', async (req, res) => {
  const token = auth.getToken();
  const baseUrl = req.query.url || `http://${req.headers.host}`;
  const fullUrl = `${baseUrl}?token=${token}`;

  try {
    const qrBuffer = await QRCode.toBuffer(fullUrl, {
      type: 'png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    res.type('png').send(qrBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Broadcast to all connections for a visitor
function broadcastToVisitor(visitorId, message) {
  const connections = wsConnections.get(visitorId);
  if (connections) {
    const data = JSON.stringify(message);
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const reconnectVisitorId = url.searchParams.get('visitorId');

  // Validate token
  if (!auth.validateToken(token)) {
    console.log(`[WS] Invalid token, closing connection`);
    ws.close(4001, 'Invalid token');
    return;
  }

  // Use existing visitor ID or create new one
  const visitorId = reconnectVisitorId || `visitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[WS] Connection established: ${visitorId} (reconnect: ${!!reconnectVisitorId})`);

  // Track this connection
  if (!wsConnections.has(visitorId)) {
    wsConnections.set(visitorId, new Set());
  }
  wsConnections.get(visitorId).add(ws);

  // Get or create visitor session
  const visitor = sessionManager.getOrCreateVisitor(visitorId);

  // Create initial terminal if none exist
  if (visitor.terminals.size === 0) {
    const terminal = sessionManager.createTerminal(visitorId);
    setupTerminalListeners(visitorId, terminal);
  }

  // Send session info with tmux status
  ws.send(JSON.stringify({
    type: 'session',
    visitorId,
    terminals: sessionManager.getTerminals(visitorId),
    tmux: sessionManager.getTmuxInfo(),
  }));

  // Send buffered output for reconnection
  for (const terminalInfo of sessionManager.getTerminals(visitorId)) {
    const buffer = sessionManager.getTerminalBuffer(terminalInfo.id);
    if (buffer) {
      ws.send(JSON.stringify({
        type: 'output',
        terminalId: terminalInfo.id,
        data: buffer,
      }));
    }
  }

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      handleMessage(visitorId, ws, msg);
    } catch (error) {
      console.error(`[WS] Error parsing message: ${error.message}`);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`[WS] Connection closed: ${visitorId}`);
    const connections = wsConnections.get(visitorId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        // Keep session alive for reconnection, don't clean up immediately
        console.log(`[WS] No more connections for ${visitorId}, session preserved for reconnection`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error: ${visitorId} - ${error.message}`);
  });
});

function setupTerminalListeners(visitorId, terminalInfo) {
  const { id: terminalId, pty } = terminalInfo;

  pty.onData((data) => {
    broadcastToVisitor(visitorId, {
      type: 'output',
      terminalId,
      data,
    });
  });

  pty.onExit(({ exitCode, signal }) => {
    console.log(`[PTY] Terminal ${terminalId} exited (code: ${exitCode}, signal: ${signal})`);
    broadcastToVisitor(visitorId, {
      type: 'exit',
      terminalId,
      exitCode,
      signal,
    });
  });
}

function handleMessage(visitorId, ws, msg) {
  switch (msg.type) {
    case 'input':
      sessionManager.writeToTerminal(visitorId, msg.terminalId, msg.data);
      break;

    case 'resize':
      sessionManager.resizeTerminal(visitorId, msg.terminalId, msg.cols, msg.rows);
      break;

    case 'create-terminal':
      const newTerminal = sessionManager.createTerminal(visitorId, msg.name);
      setupTerminalListeners(visitorId, newTerminal);
      broadcastToVisitor(visitorId, {
        type: 'terminal-created',
        terminal: {
          id: newTerminal.id,
          name: newTerminal.name,
          createdAt: newTerminal.createdAt,
        },
      });
      break;

    case 'close-terminal':
      sessionManager.closeTerminal(visitorId, msg.terminalId);
      broadcastToVisitor(visitorId, {
        type: 'terminal-closed',
        terminalId: msg.terminalId,
        terminals: sessionManager.getTerminals(visitorId),
      });
      break;

    case 'rename-terminal':
      sessionManager.renameTerminal(visitorId, msg.terminalId, msg.name);
      broadcastToVisitor(visitorId, {
        type: 'terminal-renamed',
        terminalId: msg.terminalId,
        name: msg.name,
      });
      break;

    case 'switch-terminal':
      sessionManager.setActiveTerminal(visitorId, msg.terminalId);
      ws.send(JSON.stringify({
        type: 'terminal-switched',
        terminalId: msg.terminalId,
      }));
      break;

    case 'get-terminals':
      ws.send(JSON.stringify({
        type: 'terminals-list',
        terminals: sessionManager.getTerminals(visitorId),
      }));
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    // Tmux operations
    case 'get-tmux-sessions':
      ws.send(JSON.stringify({
        type: 'tmux-sessions',
        tmux: sessionManager.getTmuxInfo(),
      }));
      break;

    case 'attach-tmux': {
      try {
        const tmuxTerminal = sessionManager.attachTmuxSession(visitorId, msg.sessionName);
        setupTerminalListeners(visitorId, tmuxTerminal);
        broadcastToVisitor(visitorId, {
          type: 'terminal-created',
          terminal: {
            id: tmuxTerminal.id,
            name: tmuxTerminal.name,
            type: 'tmux',
            tmuxSession: msg.sessionName,
            createdAt: tmuxTerminal.createdAt,
          },
        });
        // Refresh tmux sessions list
        broadcastToVisitor(visitorId, {
          type: 'tmux-sessions',
          tmux: sessionManager.getTmuxInfo(),
        });
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
      break;
    }

    case 'create-tmux': {
      try {
        const tmuxTerminal = sessionManager.createTmuxSession(visitorId, msg.sessionName);
        setupTerminalListeners(visitorId, tmuxTerminal);
        broadcastToVisitor(visitorId, {
          type: 'terminal-created',
          terminal: {
            id: tmuxTerminal.id,
            name: tmuxTerminal.name,
            type: 'tmux',
            tmuxSession: msg.sessionName,
            createdAt: tmuxTerminal.createdAt,
          },
        });
        // Refresh tmux sessions list
        broadcastToVisitor(visitorId, {
          type: 'tmux-sessions',
          tmux: sessionManager.getTmuxInfo(),
        });
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
      break;
    }

    default:
      console.log(`[WS] Unknown message type: ${msg.type}`);
  }
}

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
    let tunnelUrl = null;
    try {
      if (TUNNEL_TYPE === 'cloudflare') {
        const tunnel = new CloudflareTunnel();
        tunnelUrl = await tunnel.start(PORT);
      } else {
        const tunnel = new TunnelManager();
        tunnelUrl = await tunnel.startNgrok(PORT, NGROK_TOKEN);
      }
    } catch (error) {
      console.error('');
      console.error(`[Tunnel] ${error.message}`);
      console.error('');
    }

    const baseUrl = tunnelUrl || `http://localhost:${PORT}`;
    const accessUrl = `${baseUrl}?token=${auth.getToken()}`;

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🌐 Remote Access Ready                          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log('║  Access URL:                                              ║');
    console.log(`║  ${baseUrl}`);
    console.log('║                                                           ║');
    console.log('║  Token:                                                   ║');
    console.log(`║  ${auth.getToken()}`);
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  📱 Scan QR Code to connect:                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Display QR code in terminal
    qrcode.generate(accessUrl, { small: true }, (qr) => {
      console.log(qr);
    });

    console.log('');
    console.log('Full URL with token:');
    console.log(`  ${accessUrl}`);
    console.log('');
    // Check tmux availability
    const tmuxInfo = sessionManager.getTmuxInfo();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ⚠️  Keep this token secret!                               ║');
    console.log('║  ✨ Sessions persist across reconnections                 ║');
    console.log('║  📑 Multiple terminals supported (tabs)                   ║');
    if (tmuxInfo.available) {
      console.log('║  🔗 tmux integration enabled                               ║');
      if (tmuxInfo.sessions.length > 0) {
        console.log(`║     ${tmuxInfo.sessions.length} existing session(s) available                     ║`);
      }
    }
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  sessionManager.destroyAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down...');
  sessionManager.destroyAll();
  server.close();
  process.exit(0);
});

start();
