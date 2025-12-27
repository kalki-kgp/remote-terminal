#!/usr/bin/env node

/**
 * Connect CLI - Access your terminal from anywhere
 * Usage: npx terminal-connect
 *        connect (if installed globally)
 *
 * Options:
 *   --cloudflare         Use Cloudflare Tunnel
 *   --ngrok              Use ngrok
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
    --cloudflare         Use Cloudflare Tunnel instead of localhost.run
    --ngrok              Use ngrok (requires auth token)
    --ngrok-token TOKEN  Use ngrok with auth token
    --port PORT          Custom port (default: 3000)
    --skip-setup         Skip dependency checks
    --help, -h           Show this help message

  Examples:
    connect                      # Start with localhost.run (default, instant)
    connect --cloudflare         # Use Cloudflare Tunnel
    connect --ngrok              # Use ngrok
    connect --port 8080          # Use custom port
    connect --skip-setup         # Skip setup wizard

  Environment Variables:
    PORT              Server port (default: 3000)
    TUNNEL            Tunnel provider: 'localhost.run', 'cloudflare', or 'ngrok'
    NGROK_AUTHTOKEN   ngrok authentication token
`);
  process.exit(0);
}

// Parse --cloudflare flag
if (args.includes('--cloudflare')) {
  process.env.TUNNEL = 'cloudflare';
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
