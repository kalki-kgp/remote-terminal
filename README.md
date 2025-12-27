<p align="center">
  <img src="https://raw.githubusercontent.com/kalki-kgp/remote-terminal/main/assets/logo.svg" alt="Connect Logo" width="120">
</p>

<h1 align="center">Terminal Connect</h1>

<p align="center">
  <strong>Access your terminal from anywhere via browser</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/terminal-connect"><img src="https://img.shields.io/npm/v/terminal-connect.svg?style=flat-square&color=da7756" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/terminal-connect"><img src="https://img.shields.io/npm/dm/terminal-connect.svg?style=flat-square&color=da7756" alt="npm downloads"></a>
  <a href="https://github.com/kalki-kgp/remote-terminal/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/terminal-connect.svg?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="platform">
</p>

---

## Features

- **Cross-Platform** - Works on macOS, Windows (with WSL), and Linux
- **Instant Access** - Scan QR code to connect from any device
- **Multiple Terminals** - Tab-based interface with unlimited terminals
- **Session Persistence** - Reconnect to existing sessions, output preserved
- **tmux Integration** - Attach to existing tmux sessions seamlessly
- **Mobile Optimized** - Swipe gestures, on-screen keyboard, haptic feedback
- **Secure** - Token auth, rate limiting, auto-rotation, HTTPS via tunnel
- **Beautiful UI** - Clean, dark theme inspired by modern terminals

---

## Quick Start

```bash
# Run instantly (no install)
npx terminal-connect

# Or install globally
npm install -g terminal-connect
connect
```

Scan the QR code that appears, or open the URL in any browser.

---

## Installation

### npm (Recommended)

```bash
npm install -g terminal-connect
```

### From Source

```bash
git clone https://github.com/kalki-kgp/remote-terminal.git
cd connect
npm install
npm start
```

---

## Usage

### Basic

```bash
connect                      # Start server with setup wizard
connect --skip-setup         # Skip dependency checks
```

### Options

```bash
connect --cloudflare         # Use Cloudflare Tunnel instead of ngrok
connect --ngrok-token TOKEN  # Use authenticated ngrok
connect --port 8080          # Custom port (default: 3000)
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `TUNNEL` | ngrok | Tunnel provider (`ngrok` or `cloudflare`) |
| `NGROK_AUTHTOKEN` | - | ngrok authentication token |
| `TOKEN_LIFETIME` | 86400000 | Token lifetime in ms (24h) |
| `TOKEN_ROTATION` | 43200000 | Token rotation interval (12h) |

---

## Platform Support

| Feature | macOS | Windows | Linux |
|---------|:-----:|:-------:|:-----:|
| Basic terminal | ✅ | ✅ | ✅ |
| tmux integration | ✅ | ✅ (via WSL) | ✅ |
| Auto-start on boot | ✅ | - | ✅ (systemd) |

### Windows Setup

The interactive setup wizard will guide you through installing:
1. **WSL** (Windows Subsystem for Linux) - for tmux support
2. **tmux** inside WSL

```bash
# Manual WSL install (PowerShell as Admin)
wsl --install

# Then install tmux in WSL
wsl sudo apt install tmux
```

---

## Mobile Features

### Swipe Gestures
Swipe left/right on the terminal to switch between tabs.

### Keyboard Shortcuts Bar
On mobile, a keyboard bar provides quick access to:
- **Ctrl** modifier (tap, then tap a letter)
- **C/D/Z/L** - Quick Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L
- **Tab/Esc** - Tab and Escape keys
- **Arrows** - Navigation keys

---

## Security

- **Token Expiration** - Tokens expire after 24 hours
- **Auto-Rotation** - Tokens rotate every 12 hours
- **Rate Limiting** - 5 failed attempts = 30-minute block
- **HTTPS** - Enforced via ngrok/Cloudflare tunnel
- **Isolated Sessions** - Each visitor has separate terminals

> **Warning:** Never share your access URL or token publicly.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Your Computer                          │
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
      Phone / Tablet / Browser
      ├── xterm.js terminal
      ├── Swipe navigation
      └── Mobile keyboard bar
```

---

## Troubleshooting

### "ngrok session limit reached"

Free ngrok allows 1 tunnel. Solutions:
```bash
pkill ngrok                  # Close other ngrok instances
connect --cloudflare         # Use Cloudflare instead (free, no limits)
```

### "Port already in use"

```bash
lsof -ti:3000 | xargs kill -9
```

### Windows: "tmux not available"

Install WSL and tmux:
```bash
wsl --install              # PowerShell as Admin, then restart
wsl sudo apt install tmux  # After WSL is installed
```

---

## Contributing

Contributions welcome!

```bash
git clone https://github.com/kalki-kgp/remote-terminal.git
cd remote-terminal
npm install
npm run dev   # Start with auto-reload
```

---

## License

MIT © [kalki-kgp](https://github.com/kalki-kgp)

---

<p align="center">
  Made with ♥ for remote terminal access
</p>
