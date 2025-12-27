# Connect

Access your Mac terminal from anywhere via browser. Built for Apple Silicon Macs.

## Features

- **Remote Access** - Access your terminal from phone, tablet, or any browser
- **QR Code Access** - Scan QR code from terminal to connect instantly
- **Multiple Terminals** - Tab-based interface, create unlimited terminals
- **Session Persistence** - Reconnect to existing sessions, output is preserved
- **tmux Integration** - Attach to existing tmux sessions
- **Mobile Optimized** - Swipe gestures, on-screen keyboard, haptic feedback
- **Secure** - Token auth with expiration, rate limiting, auto-rotation
- **Auto-start** - Optional LaunchAgent for boot persistence

## Requirements

- macOS (Apple Silicon recommended)
- Node.js 18+
- ngrok or cloudflared (for remote access)

## Quick Start

```bash
# Clone and install
git clone https://github.com/anthropics/connect.git
cd connect
npm install

# Start the server
npm start
```

Scan the QR code or open the URL to connect.

## Installation (System-wide)

```bash
./install.sh
```

This will:
1. Check for Node.js (install if missing)
2. Install the application to `~/.connect`
3. Create the `connect` command
4. Optionally install cloudflared
5. Optionally set up auto-start on boot

## Usage

### Foreground Mode
```bash
connect
```

### Daemon Mode
```bash
connect-ctl start    # Start as background daemon
connect-ctl stop     # Stop the daemon
connect-ctl restart  # Restart
connect-ctl status   # Check if running
connect-ctl logs     # Tail the logs
connect-ctl enable   # Enable auto-start on login
connect-ctl disable  # Disable auto-start
```

### Options
```bash
connect --cloudflare          # Use Cloudflare Tunnel instead of ngrok
connect --ngrok-token TOKEN   # Use authenticated ngrok
connect --port 8080           # Use custom port
```

## Mobile Features

### Swipe Gestures
Swipe left/right on the terminal area to switch between tabs.

### Keyboard Shortcuts Bar
On mobile, a keyboard bar appears at the bottom with:
- **Ctrl** - Toggle Ctrl modifier (tap, then tap a letter)
- **C/D/Z/L** - Quick Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L
- **Tab/Esc** - Tab and Escape keys
- **Arrows** - Navigation keys (↑↓←→)

### Customizing Keyboard Bar

Edit `public/index.html` around line 687:

```html
<div class="keyboard-bar" id="keyboardBar">
  <button class="key-btn" data-key="ctrl" id="ctrlKey">Ctrl</button>
  <button class="key-btn" data-action="ctrl-c">C</button>
  <button class="key-btn" data-action="ctrl-d">D</button>
  <!-- Reorder or add buttons here -->
</div>
```

**Button types:**
- `data-action="ctrl-X"` - Sends Ctrl+X (e.g., `data-action="ctrl-c"`)
- `data-key="KEY"` - Special keys: `tab`, `esc`, `up`, `down`, `left`, `right`

**Add new Ctrl shortcuts:**
```html
<button class="key-btn" data-action="ctrl-a">A</button>  <!-- Ctrl+A -->
<button class="key-btn" data-action="ctrl-r">R</button>  <!-- Ctrl+R (reverse search) -->
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Local server port |
| `TUNNEL` | ngrok | Tunnel provider (ngrok/cloudflare) |
| `NGROK_AUTHTOKEN` | - | ngrok authentication token |
| `TOKEN_LIFETIME` | 86400000 | Token lifetime in ms (24h) |
| `TOKEN_ROTATION` | 43200000 | Token rotation interval in ms (12h) |

### ngrok (default)

Works out of the box. For longer sessions:

1. Sign up at https://ngrok.com
2. Get your auth token
3. Run: `connect --ngrok-token YOUR_TOKEN`

### Cloudflare Tunnel

Uses Cloudflare's free quick tunnels (no account needed):

```bash
brew install cloudflared
connect --cloudflare
```

## Security

- **Token Expiration** - Tokens expire after 24 hours (configurable)
- **Auto-Rotation** - Tokens rotate every 12 hours with 5-minute grace period
- **Rate Limiting** - 5 failed attempts per 15 minutes, then 30-minute block
- **Fresh Tokens** - New token generated on each server start
- **HTTPS** - Enforced via tunnel
- **Isolated Sessions** - Each visitor has separate terminal sessions

**Important:** Never share your access URL/token publicly.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Terminal UI |
| `/qr` | GET | QR code image (PNG) |
| `/health` | GET | Server health check |
| `/api/token-info` | GET | Token expiration info (requires token) |
| `/api/rotate-token` | POST | Force token rotation (requires token) |

## Architecture

```
┌─────────────────────────────────────────┐
│  Mac                                    │
│  ├── Express Server (port 3000)         │
│  │   ├── Static files (UI)              │
│  │   ├── WebSocket (terminal I/O)       │
│  │   └── Token auth + rate limiting     │
│  ├── Session Manager                    │
│  │   ├── Multiple PTY sessions          │
│  │   ├── tmux integration               │
│  │   └── Output buffering (50KB)        │
│  └── Tunnel (ngrok/cloudflare)          │
└─────────────────────────────────────────┘
              │
              ▼
      Phone/Browser
      ├── Claude Code styled UI
      ├── xterm.js terminals
      ├── Swipe gestures
      └── On-screen keyboard
```

## Uninstall

```bash
./uninstall.sh
```

Or manually:
```bash
connect-ctl stop
launchctl unload ~/Library/LaunchAgents/com.connect.plist
rm -rf ~/.connect
sudo rm /usr/local/bin/connect /usr/local/bin/connect-ctl
rm ~/Library/LaunchAgents/com.connect.plist
```

## Troubleshooting

### "ngrok session limit reached"

Free ngrok allows 1 session. Either:
- Close other ngrok instances: `pkill ngrok`
- Use Cloudflare instead: `connect --cloudflare`
- Get ngrok auth token for multiple sessions

### "Port already in use"

```bash
lsof -ti:3000 | xargs kill -9
```

### Session not restoring

Clear browser localStorage and reconnect with fresh token.

### Keyboard bar not showing

The keyboard bar only appears on mobile (screen width < 768px). On desktop, use your physical keyboard.

## License

MIT
