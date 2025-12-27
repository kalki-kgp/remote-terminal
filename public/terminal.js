// Multi-terminal client with session persistence
class RemoteTerminal {
  constructor() {
    this.ws = null;
    this.token = null;
    this.visitorId = null;
    this.terminals = new Map(); // terminalId -> { terminal, fitAddon, element }
    this.activeTerminalId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;

    this.init();
  }

  init() {
    // Check for existing session
    this.visitorId = localStorage.getItem('visitorId');

    // Check for token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
      this.token = urlToken;
      localStorage.setItem('token', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.hideAuthOverlay();
      this.connect();
    } else {
      // Try stored token
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        this.token = storedToken;
        this.hideAuthOverlay();
        this.connect();
      } else {
        this.showAuthOverlay();
      }
    }

    // Setup auth form
    document.getElementById('connectBtn').addEventListener('click', () => this.handleAuth());
    document.getElementById('tokenInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuth();
    });

    // New tab button
    document.getElementById('newTabBtn').addEventListener('click', () => this.createNewTerminal());

    // Handle window resize
    window.addEventListener('resize', () => this.fitActiveTerminal());
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
    localStorage.setItem('token', token);
    this.hideAuthOverlay();
    this.connect();
  }

  connect() {
    this.updateStatus('connecting');

    if (this.visitorId) {
      document.getElementById('reconnectBanner').classList.add('show');
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(this.token)}`;

    // Include visitor ID for reconnection
    if (this.visitorId) {
      wsUrl += `&visitorId=${encodeURIComponent(this.visitorId)}`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      document.getElementById('reconnectBanner').classList.remove('show');
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
        localStorage.removeItem('token');
        localStorage.removeItem('visitorId');
        this.showAuthOverlay();
        this.showAuthError('Invalid token. Please try again.');
        return;
      }

      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('disconnected');
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'session':
        this.visitorId = msg.visitorId;
        localStorage.setItem('visitorId', msg.visitorId);
        console.log('Session established:', msg.visitorId);

        // Initialize terminals from session
        if (msg.terminals && msg.terminals.length > 0) {
          msg.terminals.forEach(t => this.initTerminal(t));
          // Activate the first active or first terminal
          const activeTerminal = msg.terminals.find(t => t.isActive) || msg.terminals[0];
          this.switchTerminal(activeTerminal.id);
        }
        break;

      case 'output':
        this.writeToTerminal(msg.terminalId, msg.data);
        break;

      case 'terminal-created':
        this.initTerminal(msg.terminal);
        this.switchTerminal(msg.terminal.id);
        break;

      case 'terminal-closed':
        this.removeTerminal(msg.terminalId);
        if (msg.terminals && msg.terminals.length > 0) {
          const nextActive = msg.terminals.find(t => t.isActive) || msg.terminals[0];
          this.switchTerminal(nextActive.id);
        }
        break;

      case 'terminal-renamed':
        this.updateTabName(msg.terminalId, msg.name);
        break;

      case 'terminal-switched':
        this.switchTerminal(msg.terminalId);
        break;

      case 'exit':
        const term = this.terminals.get(msg.terminalId);
        if (term) {
          term.terminal.writeln(`\r\n\x1b[33mProcess exited (code: ${msg.exitCode})\x1b[0m`);
        }
        break;

      case 'pong':
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  }

  initTerminal(terminalInfo) {
    const { id, name } = terminalInfo;

    // Create terminal instance
    const terminal = new Terminal({
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

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    terminal.loadAddon(webLinksAddon);

    // Create container element
    const pane = document.createElement('div');
    pane.className = 'terminal-pane';
    pane.id = `terminal-${id}`;
    document.getElementById('terminalsWrapper').appendChild(pane);

    terminal.open(pane);

    // Handle input
    terminal.onData((data) => {
      this.send({ type: 'input', terminalId: id, data });
    });

    terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', terminalId: id, cols, rows });
    });

    this.terminals.set(id, { terminal, fitAddon, element: pane, name });

    // Create tab
    this.createTab(id, name);
  }

  createTab(id, name) {
    const tabsContainer = document.getElementById('tabs');

    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.id = `tab-${id}`;
    tab.innerHTML = `
      <span class="tab-name">${this.escapeHtml(name)}</span>
      <button class="tab-close" title="Close terminal">×</button>
    `;

    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.switchTerminal(id);
        this.send({ type: 'switch-terminal', terminalId: id });
      }
    });

    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTerminal(id);
    });

    // Double click to rename
    tab.querySelector('.tab-name').addEventListener('dblclick', () => {
      this.renameTerminal(id);
    });

    tabsContainer.appendChild(tab);
  }

  switchTerminal(id) {
    // Deactivate all
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.terminal-pane').forEach(p => p.classList.remove('active'));

    // Activate selected
    const tab = document.getElementById(`tab-${id}`);
    const pane = document.getElementById(`terminal-${id}`);

    if (tab) tab.classList.add('active');
    if (pane) pane.classList.add('active');

    this.activeTerminalId = id;

    // Fit and focus
    const termInfo = this.terminals.get(id);
    if (termInfo) {
      setTimeout(() => {
        termInfo.fitAddon.fit();
        termInfo.terminal.focus();
      }, 10);
    }
  }

  writeToTerminal(terminalId, data) {
    const termInfo = this.terminals.get(terminalId);
    if (termInfo) {
      termInfo.terminal.write(data);
    }
  }

  fitActiveTerminal() {
    if (this.activeTerminalId) {
      const termInfo = this.terminals.get(this.activeTerminalId);
      if (termInfo) {
        try {
          termInfo.fitAddon.fit();
        } catch (e) {
          // Ignore fit errors
        }
      }
    }
  }

  createNewTerminal() {
    this.send({ type: 'create-terminal' });
  }

  closeTerminal(id) {
    if (this.terminals.size <= 1) {
      // Don't close the last terminal
      return;
    }
    this.send({ type: 'close-terminal', terminalId: id });
  }

  removeTerminal(id) {
    const termInfo = this.terminals.get(id);
    if (termInfo) {
      termInfo.terminal.dispose();
      termInfo.element.remove();
      this.terminals.delete(id);
    }

    const tab = document.getElementById(`tab-${id}`);
    if (tab) tab.remove();
  }

  renameTerminal(id) {
    const termInfo = this.terminals.get(id);
    if (!termInfo) return;

    const newName = prompt('Enter new terminal name:', termInfo.name);
    if (newName && newName.trim()) {
      this.send({ type: 'rename-terminal', terminalId: id, name: newName.trim() });
    }
  }

  updateTabName(id, name) {
    const tab = document.getElementById(`tab-${id}`);
    if (tab) {
      const nameEl = tab.querySelector('.tab-name');
      if (nameEl) {
        nameEl.textContent = name;
      }
    }
    const termInfo = this.terminals.get(id);
    if (termInfo) {
      termInfo.name = name;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);

    console.log(`Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    document.getElementById('reconnectBanner').classList.add('show');

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Heartbeat
  startHeartbeat() {
    setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.remoteTerminal = new RemoteTerminal();
});
