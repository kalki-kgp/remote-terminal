# CLAUDE.md

## Project Overview

Connect is a self-hosted browser-based terminal access tool for macOS. It allows users to access their Mac's terminal from any device via a web browser, with features like session persistence, multiple tabs, tmux integration, and mobile-optimized UX.

## Tech Stack

- **Backend:** Node.js, Express, WebSocket (ws)
- **Terminal:** node-pty for PTY spawning
- **Frontend:** Vanilla JS, xterm.js
- **Tunneling:** ngrok or cloudflared
- **Target Platform:** macOS (Apple Silicon M-series)

## Project Structure

```
connect/
├── src/
│   ├── server.js          # Main Express + WebSocket server
│   ├── session-manager.js # Multi-terminal session management
│   ├── tmux-manager.js    # tmux operations (list, attach, create)
│   ├── auth.js            # Token auth + rate limiting
│   └── tunnel.js          # ngrok/cloudflare tunnel management
├── public/
│   ├── index.html         # Frontend UI (Claude Code styled)
│   └── terminal.js        # Frontend client logic
├── scripts/
│   └── com.connect.plist  # LaunchAgent template
├── install.sh             # Installation script
├── uninstall.sh           # Uninstallation script
└── package.json
```

## Key Files

- **`src/server.js`** - Entry point. Handles HTTP routes, WebSocket connections, and message routing.
- **`src/session-manager.js`** - Manages visitor sessions, terminals (shell + tmux), and output buffering.
- **`src/auth.js`** - TokenAuth class (expiration, rotation) and RateLimiter class (brute-force protection).
- **`public/index.html`** - All CSS and HTML. Mobile keyboard bar is around line 687.
- **`public/terminal.js`** - RemoteTerminal class handling WebSocket, xterm.js, swipe gestures, keyboard shortcuts.

## Common Tasks

### Running the server
```bash
npm start
# or
node src/server.js
```

### Testing changes
The server auto-displays a QR code and URL. Open on mobile to test mobile features.

### Modifying keyboard shortcuts
Edit `public/index.html` around line 687. Button types:
- `data-action="ctrl-X"` - Ctrl+key combos
- `data-key="tab|esc|up|down|left|right"` - Special keys

### Adding new WebSocket message types
1. Add handler in `src/server.js` `handleMessage()` function
2. Add client-side handler in `public/terminal.js` `handleMessage()` method

## Architecture Notes

- **Sessions persist** across WebSocket disconnections via visitorId stored in localStorage
- **Output buffering** keeps last 50KB per terminal for reconnection replay
- **Token rotation** happens every 12h with 5-minute grace period for old tokens
- **Rate limiting** blocks IPs after 5 failed auth attempts for 30 minutes

## Coding Conventions

- ES Modules (`import/export`)
- No TypeScript (vanilla JS)
- No build step - files served directly
- CSS variables for theming (see `:root` in index.html)
- Anthropic color palette: accent `#da7756`, backgrounds `#191919`/`#262626`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `TUNNEL` | ngrok | Tunnel type |
| `NGROK_AUTHTOKEN` | - | ngrok auth |
| `TOKEN_LIFETIME` | 86400000 | Token TTL (24h) |
| `TOKEN_ROTATION` | 43200000 | Rotation interval (12h) |

## Known Issues

- **node-pty spawn-helper**: Requires `chmod +x` on macOS. Handled in postinstall and install.sh.
- **ngrok session limit**: Free tier allows 1 tunnel. Use `--cloudflare` as alternative.

## Testing Checklist

- [ ] Server starts without errors
- [ ] QR code displays in terminal
- [ ] Browser connects with token
- [ ] Multiple terminals work
- [ ] Tab switching (click + swipe on mobile)
- [ ] tmux attach/create works
- [ ] Session persists on refresh
- [ ] Rate limiting blocks after 5 failures
- [ ] Token rotation works (test with short interval)
- [ ] LaunchAgent auto-start works
