import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { SessionManager } from './session-manager.js';
import { TokenAuth, RateLimiter } from './auth.js';
import { TunnelManager, CloudflareTunnel, LocalhostRunTunnel } from './tunnel.js';
import { CommandManager } from './commands.js';
import { runSetup } from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const TUNNEL_TYPE = process.env.TUNNEL || 'localhost.run';
const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN || null;
const TOKEN_LIFETIME = parseInt(process.env.TOKEN_LIFETIME) || 24 * 60 * 60 * 1000; // 24h
const TOKEN_ROTATION = parseInt(process.env.TOKEN_ROTATION) || 12 * 60 * 60 * 1000; // 12h

// Initialize components
const app = express();
const server = createServer(app);
let wss = null; // Created after server binds to port
const sessionManager = new SessionManager();
const auth = new TokenAuth({
  tokenLifetime: TOKEN_LIFETIME,
  rotationInterval: TOKEN_ROTATION,
  autoRotate: true,
});
const rateLimiter = new RateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDuration: 30 * 60 * 1000, // 30 minutes
});
const commandManager = new CommandManager();

// Store WebSocket connections per visitor
const wsConnections = new Map(); // visitorId -> Set<ws>

// Store tunnel URL for QR regeneration
let currentTunnelUrl = null;

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

// Token info endpoint (for authenticated clients to check token status)
app.get('/api/token-info', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!auth.validateToken(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  res.json(auth.getTokenInfo());
});

// Admin endpoint to rotate token (requires current valid token)
app.post('/api/rotate-token', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!auth.validateToken(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const newToken = auth.rotateToken();
  res.json({
    message: 'Token rotated successfully',
    ...auth.getTokenInfo(),
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

// Helper to get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.socket.remoteAddress ||
         'unknown';
}

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

    // Favorite commands operations
    case 'get-commands':
      ws.send(JSON.stringify({
        type: 'commands-list',
        commands: commandManager.getAll(),
      }));
      break;

    case 'add-command': {
      try {
        const newCmd = commandManager.add(msg.label, msg.command);
        // Broadcast to all connections (sync across devices)
        for (const [vid, connections] of wsConnections) {
          for (const conn of connections) {
            if (conn.readyState === conn.OPEN) {
              conn.send(JSON.stringify({
                type: 'commands-list',
                commands: commandManager.getAll(),
              }));
            }
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
      break;
    }

    case 'update-command': {
      try {
        commandManager.update(msg.id, msg.label, msg.command);
        // Broadcast to all connections
        for (const [vid, connections] of wsConnections) {
          for (const conn of connections) {
            if (conn.readyState === conn.OPEN) {
              conn.send(JSON.stringify({
                type: 'commands-list',
                commands: commandManager.getAll(),
              }));
            }
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
      break;
    }

    case 'delete-command': {
      try {
        commandManager.delete(msg.id);
        // Broadcast to all connections
        for (const [vid, connections] of wsConnections) {
          for (const conn of connections) {
            if (conn.readyState === conn.OPEN) {
              conn.send(JSON.stringify({
                type: 'commands-list',
                commands: commandManager.getAll(),
              }));
            }
          }
        }
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

// Display access info and QR code
function displayAccessInfo(tunnelUrl, token, isRegenerated = false) {
  const baseUrl = tunnelUrl || `http://localhost:${PORT}`;
  const accessUrl = `${baseUrl}?token=${token}`;

  console.log('');
  if (isRegenerated) {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🔄 New Token Generated                          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
  } else {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🌐 Remote Access Ready                          ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
  }
  console.log('║                                                           ║');
  console.log('║  Access URL:                                              ║');
  console.log(`║  ${baseUrl}`);
  console.log('║                                                           ║');
  console.log('║  Token:                                                   ║');
  console.log(`║  ${token}`);
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

  if (isRegenerated) {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Previous token consumed and invalidated               ║');
    console.log('║  🔒 One-time token security active                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
  }
}

// Try to start server on a port, with fallback
function tryListen(port, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    const basePort = parseInt(process.env.PORT || 3000);

    const onError = (err) => {
      server.removeListener('error', onError);
      if (err.code === 'EADDRINUSE') {
        if (port - basePort < maxAttempts) {
          console.log(`\x1b[33m[Server] Port ${port} in use, trying ${port + 1}...\x1b[0m`);
          resolve(tryListen(port + 1, maxAttempts));
        } else {
          reject(new Error(`All ports ${basePort}-${port} are in use. Try: lsof -ti:${basePort} | xargs kill -9`));
        }
      } else {
        reject(err);
      }
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      resolve(port);
    });
  });
}

// Initialize WebSocket server (called after HTTP server binds)
function initWebSocket() {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const reconnectVisitorId = url.searchParams.get('visitorId');
    const clientIP = getClientIP(req);

    // Check rate limiting
    const rateCheck = rateLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      console.log(`[WS] Rate limited: ${clientIP} (retry after ${rateCheck.retryAfter}s)`);
      ws.close(4029, JSON.stringify({
        error: 'rate_limited',
        retryAfter: rateCheck.retryAfter,
        message: rateCheck.reason,
      }));
      return;
    }

    // Check if this is an authorized visitor reconnecting
    const isAuthorizedReconnect = reconnectVisitorId && auth.isVisitorAuthorized(reconnectVisitorId);

    if (isAuthorizedReconnect) {
      console.log(`[WS] Authorized visitor reconnecting: ${reconnectVisitorId}`);
      rateLimiter.recordSuccess(clientIP);
    } else {
      // New connection - validate token
      if (!auth.validateToken(token)) {
        console.log(`[WS] Invalid token from ${clientIP}`);
        rateLimiter.recordFailure(clientIP);
        ws.close(4001, 'Invalid token');
        return;
      }

      // Successful auth - reset rate limit counter
      rateLimiter.recordSuccess(clientIP);
    }

    // Use existing visitor ID or create new one
    const visitorId = reconnectVisitorId || `visitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // If this is a new connection (not a reconnect), consume the token
    if (!isAuthorizedReconnect) {
      auth.consumeToken(visitorId);
    }

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
}

// Start server and tunnel
async function start() {
  // Run setup check unless --skip-setup flag is passed
  const skipSetup = process.argv.includes('--skip-setup');
  if (!skipSetup) {
    await runSetup();
  }

  try {
    const actualPort = await tryListen(parseInt(PORT));

    // Initialize WebSocket server after HTTP server is bound
    initWebSocket();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║           🖥️  Connect Server                                ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Local:  http://localhost:${actualPort}                            ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Start tunnel
    try {
      if (TUNNEL_TYPE === 'cloudflare') {
        const tunnel = new CloudflareTunnel();
        currentTunnelUrl = await tunnel.start(actualPort);
      } else if (TUNNEL_TYPE === 'ngrok') {
        const tunnel = new TunnelManager();
        currentTunnelUrl = await tunnel.startNgrok(actualPort, NGROK_TOKEN);
      } else {
        // Default: localhost.run (instant, no signup)
        const tunnel = new LocalhostRunTunnel();
        currentTunnelUrl = await tunnel.start(actualPort);
      }
    } catch (error) {
      console.error('');
      console.error(`[Tunnel] ${error.message}`);
      console.error('');
    }

    // Set up callback for when token is regenerated (one-time use)
    auth.setTokenRegeneratedCallback((newToken) => {
      displayAccessInfo(currentTunnelUrl, newToken, true);
    });

    // Display initial access info
    displayAccessInfo(currentTunnelUrl, auth.getToken(), false);

    // Check tmux availability
    const tmuxInfo = sessionManager.getTmuxInfo();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🔒 One-time token security enabled                       ║');
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
  } catch (error) {
    console.error(`\x1b[31m[Server] ${error.message}\x1b[0m`);
    console.error('Try: lsof -ti:3000 | xargs kill -9');
    process.exit(1);
  }
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
