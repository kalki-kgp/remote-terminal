# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Terminal Connect is a single-process Node.js application (Express + WebSocket server) that provides browser-based terminal access. No database or external services required — all state is in-memory.

### Running the dev server

```bash
node src/server.js --skip-setup
```

The `--skip-setup` flag is **required** in non-interactive environments (CI, cloud agents) to bypass the interactive setup wizard that prompts for tmux/cloudflared installation.

For file-watching dev mode: `npm run dev -- --skip-setup` (uses `node --watch`). Note that `--skip-setup` must come after `--` when using npm scripts.

The server listens on port 3000 by default (auto-increments if in use). It will attempt to start a localhost.run tunnel by default; tunnel errors are non-fatal and the server continues on localhost.

### Authentication

Each server start generates a one-time auth token printed to stdout. Access the app at `http://localhost:3000?token=<TOKEN>`. The token is consumed on first use, after which a new token is generated and printed.

### Lint / Test / Build

This project has **no lint, test, or build scripts**. It's vanilla JS with no TypeScript and no build step. Files in `public/` are served directly. Standard commands from `package.json`:

- `npm start` — start server
- `npm run dev` — start server with `--watch`

### Known gotcha

The `tmuxBadge` DOM element is referenced in `public/terminal.js` but does not exist in `public/index.html`. A null-check fix has been applied to prevent the terminal from failing to load.
