# Remote Terminal

Access your Mac terminal from anywhere via browser. Built for Apple Silicon Macs.

## Features

- Browser-based terminal access (works on phone/tablet)
- Secure one-time token authentication
- Built-in tunnel support (ngrok or Cloudflare)
- Full terminal emulation with xterm.js
- Auto-reconnection on connection loss

## Requirements

- macOS (Apple Silicon recommended)
- Node.js 18+
- Homebrew (for dependencies)

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
2. Create an ngrok tunnel
3. Display the access URL and token

### Options

```bash
remote-terminal --cloudflare          # Use Cloudflare Tunnel instead of ngrok
remote-terminal --ngrok-token TOKEN   # Use authenticated ngrok
remote-terminal --port 8080           # Use custom port
```

### Access from phone

1. Copy the URL displayed in terminal
2. Open it in your phone's browser
3. Enter the token (or use the full URL with token)
4. Start using your terminal!

## Configuration

### ngrok (default)

Works out of the box with free ngrok. For longer sessions, get a free auth token:

1. Sign up at https://ngrok.com
2. Get your auth token from the dashboard
3. Run: `remote-terminal --ngrok-token YOUR_TOKEN`

### Cloudflare Tunnel

Uses Cloudflare's free quick tunnels:

```bash
remote-terminal --cloudflare
```

Requires `cloudflared` (installed automatically if you choose during setup).

## Security

- Each server start generates a new one-time token
- Token is required for all connections
- HTTPS enforced via tunnel
- Sessions are isolated per connection

**Important:** Never share your access URL/token publicly.

## Uninstall

```bash
./uninstall.sh
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Mac                                    │
│  ├── Node.js Server                     │
│  │   ├── Express (static files)         │
│  │   ├── WebSocket (terminal I/O)       │
│  │   └── node-pty (shell)               │
│  └── Tunnel (ngrok/cloudflare)          │
└─────────────────────────────────────────┘
                    │
                    ▼
            Phone/Browser
            (xterm.js UI)
```

## Troubleshooting

### "ngrok tunnel failed"

- Check internet connection
- Try with `--cloudflare` instead
- Get a free ngrok auth token

### "Permission denied"

- Run install with proper permissions
- Check that `/usr/local/bin` is writable

### Connection drops frequently

- Use authenticated ngrok for longer sessions
- Check your network stability
