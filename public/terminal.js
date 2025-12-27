// Terminal client
class RemoteTerminal {
  constructor() {
    this.ws = null;
    this.terminal = null;
    this.fitAddon = null;
    this.token = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;

    this.init();
  }

  init() {
    // Check for token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
      this.token = urlToken;
      // Clear token from URL for security
      window.history.replaceState({}, document.title, window.location.pathname);
      this.hideAuthOverlay();
      this.initTerminal();
      this.connect();
    } else {
      this.showAuthOverlay();
    }

    // Setup auth form
    document.getElementById('connectBtn').addEventListener('click', () => this.handleAuth());
    document.getElementById('tokenInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuth();
    });
  }

  showAuthOverlay() {
    document.getElementById('authOverlay').classList.remove('hidden');
    document.getElementById('tokenInput').focus();
  }

  hideAuthOverlay() {
    document.getElementById('authOverlay').classList.add('hidden');
  }

  showAuthError(message) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  handleAuth() {
    const tokenInput = document.getElementById('tokenInput');
    const token = tokenInput.value.trim();

    if (!token) {
      this.showAuthError('Please enter a token');
      return;
    }

    this.token = token;
    this.hideAuthOverlay();
    this.initTerminal();
    this.connect();
  }

  initTerminal() {
    // Create terminal
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"SF Mono", Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#eee',
        cursor: '#e94560',
        cursorAccent: '#1a1a2e',
        selection: 'rgba(233, 69, 96, 0.3)',
        black: '#1a1a2e',
        red: '#e94560',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#eee',
        brightBlack: '#888',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fff',
      },
      allowProposedApi: true,
    });

    // Add fit addon
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    // Add web links addon
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    this.terminal.loadAddon(webLinksAddon);

    // Open terminal
    const container = document.getElementById('terminal');
    this.terminal.open(container);

    // Fit to container
    this.fitTerminal();

    // Handle resize
    window.addEventListener('resize', () => this.fitTerminal());

    // Handle input
    this.terminal.onData((data) => {
      this.send({ type: 'input', data });
    });

    // Handle resize
    this.terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', cols, rows });
    });
  }

  fitTerminal() {
    if (this.fitAddon) {
      try {
        this.fitAddon.fit();
      } catch (e) {
        // Ignore fit errors
      }
    }
  }

  connect() {
    this.updateStatus('connecting');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(this.token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.updateStatus('disconnected');

      if (event.code === 4001) {
        // Invalid token
        this.terminal.writeln('\r\n\x1b[31mAuthentication failed. Invalid token.\x1b[0m');
        this.showAuthOverlay();
        this.showAuthError('Invalid token. Please try again.');
        return;
      }

      // Attempt reconnect
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('disconnected');
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'output':
        this.terminal.write(msg.data);
        break;

      case 'ready':
        console.log('Session ready:', msg.sessionId);
        this.terminal.focus();
        // Send initial size
        this.send({
          type: 'resize',
          cols: this.terminal.cols,
          rows: this.terminal.rows,
        });
        break;

      case 'exit':
        this.terminal.writeln(`\r\n\x1b[33mProcess exited (code: ${msg.exitCode})\x1b[0m`);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.terminal.writeln('\r\n\x1b[31mConnection lost. Max reconnect attempts reached.\x1b[0m');
      this.terminal.writeln('\x1b[33mRefresh the page to try again.\x1b[0m');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.terminal.writeln(`\r\n\x1b[33mConnection lost. Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})\x1b[0m`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  updateStatus(status) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    dot.className = 'status-dot ' + status;

    switch (status) {
      case 'connected':
        text.textContent = 'Connected';
        break;
      case 'connecting':
        text.textContent = 'Connecting...';
        break;
      case 'disconnected':
        text.textContent = 'Disconnected';
        break;
    }
  }

  // Heartbeat to keep connection alive
  startHeartbeat() {
    setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  new RemoteTerminal();
});
