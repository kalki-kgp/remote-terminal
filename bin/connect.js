#!/usr/bin/env node

/**
 * Connect CLI - Access your terminal from anywhere
 * Usage: npx terminal-connect
 *        connect (if installed globally)
 *
 * Options:
 *   --ngrok              Use ngrok instead of cloudflared
 *   --ngrok-token TOKEN  Use authenticated ngrok
 *   --port PORT          Custom port (default: 3000)
 *   --skip-setup         Skip dependency checks
 */

// Parse command line arguments
const args = process.argv.slice(2);

// Help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Terminal Connect - Access your terminal from anywhere

  Usage:
    connect [options]
    npx terminal-connect [options]

  Options:
    --ngrok              Use ngrok instead of cloudflared (default)
    --ngrok-token TOKEN  Use authenticated ngrok with token
    --port PORT          Custom port (default: 3000)
    --skip-setup         Skip dependency checks
    --help, -h           Show this help message

  Examples:
    connect                      # Start with cloudflared (default)
    connect --ngrok              # Use ngrok instead
    connect --port 8080          # Use custom port
    connect --skip-setup         # Skip setup wizard

  Environment Variables:
    PORT              Server port (default: 3000)
    TUNNEL            Tunnel provider: 'cloudflare' or 'ngrok'
    NGROK_AUTHTOKEN   ngrok authentication token
`);
  process.exit(0);
}

// Parse --ngrok flag
if (args.includes('--ngrok')) {
  process.env.TUNNEL = 'ngrok';
}

// Parse --ngrok-token
const ngrokTokenIndex = args.indexOf('--ngrok-token');
if (ngrokTokenIndex !== -1 && args[ngrokTokenIndex + 1]) {
  process.env.NGROK_AUTHTOKEN = args[ngrokTokenIndex + 1];
  process.env.TUNNEL = 'ngrok';
}

// Parse --port
const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  process.env.PORT = args[portIndex + 1];
}

// Start server
import('../src/server.js');
