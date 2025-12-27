# Remote Terminal

Access your Mac terminal from anywhere via browser. Built for Apple Silicon Macs.

## Features

- **QR Code Access** - Scan QR code from terminal to connect instantly
- **Multiple Terminals** - Tab-based interface, create unlimited terminals
- **Session Persistence** - Reconnect to existing sessions, output is preserved
- **Secure** - One-time token authentication, HTTPS via tunnel
- **Mobile Friendly** - Optimized UI for phones and tablets

## Requirements

- macOS (Apple Silicon recommended)
- Node.js 18+
- ngrok or cloudflared (for remote access)

## Installation

```bash
./install.sh
```

This will:
1. Check for Node.js (install if missing)
2. Install the application to `~/.remote-terminal`
3. Create the `remote-terminal` command
4. Optionally install cloudflared

## Usage

### Start the server

```bash
remote-terminal
```

This will:
1. Start the local server on port 3000
2. Create a tunnel (ngrok by default)
3. Display QR code and access URL

### Options

```bash
remote-terminal --cloudflare          # Use Cloudflare Tunnel instead of ngrok
remote-terminal --ngrok-token TOKEN   # Use authenticated ngrok
remote-terminal --port 8080           # Use custom port
```

### Access from phone

1. **Scan the QR code** displayed in terminal, OR
2. Copy the URL and open in browser
3. Start using your terminal!

### Multiple Terminals

- Click **+** button to create new terminal
- Click tabs to switch between terminals
- Double-click tab name to rename
- Click **×** on tab to close terminal

### Session Persistence

- Sessions persist even when you disconnect
- Reconnecting restores your terminals and output
- Session ID stored in browser localStorage

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Terminal UI |
| `/qr` | QR code image (PNG) |
| `/health` | Server health check |

## Configuration

### ngrok (default)

Works out of the box. For longer sessions:

1. Sign up at https://ngrok.com
2. Get your auth token
3. Run: `remote-terminal --ngrok-token YOUR_TOKEN`

### Cloudflare Tunnel

Uses Cloudflare's free quick tunnels (no account needed):

```bash
brew install cloudflared
remote-terminal --cloudflare
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Mac                                    │
│  ├── Express Server                     │
│  │   ├── Static files (UI)              │
│  │   ├── WebSocket (terminal I/O)       │
│  │   └── QR code generation             │
│  ├── Session Manager                    │
│  │   ├── Multiple PTY sessions          │
│  │   └── Output buffering               │
│  └── Tunnel (ngrok/cloudflare)          │
└─────────────────────────────────────────┘
              │
              ▼
      Phone/Browser
      ├── Tab-based UI
      ├── xterm.js terminals
      └── Session reconnection
```

## Security

- Each server start generates a new one-time token
- Token required for WebSocket connections
- HTTPS enforced via tunnel
- Sessions isolated per visitor
- Output buffer limited to 50KB per terminal

**Important:** Never share your access URL/token publicly.

## Uninstall

```bash
./uninstall.sh
```

## Troubleshooting

### "ngrok session limit reached"

Free ngrok allows 1 session. Either:
- Close other ngrok instances: `pkill ngrok`
- Use Cloudflare instead: `remote-terminal --cloudflare`

### "Port already in use"

```bash
lsof -ti:3000 | xargs kill -9
```

### Session not restoring

Clear browser localStorage and reconnect with fresh token.
