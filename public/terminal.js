// Remote Terminal - Claude Code Style
class RemoteTerminal {
  constructor() {
    this.ws = null;
    this.token = null;
    this.visitorId = null;
    this.terminals = new Map();
    this.activeTerminalId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.tmuxAvailable = false;
    this.tmuxSessions = [];

    this.init();
  }

  init() {
    this.visitorId = localStorage.getItem('visitorId');
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
      this.token = urlToken;
      localStorage.setItem('token', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.hideAuthOverlay();
      this.connect();
    } else {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        this.token = storedToken;
        this.hideAuthOverlay();
        this.connect();
      } else {
        this.showAuthOverlay();
      }
    }

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Auth
    document.getElementById('connectBtn').addEventListener('click', () => this.handleAuth());
    document.getElementById('tokenInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuth();
    });

    // Modal
    document.getElementById('newTabBtn').addEventListener('click', () => this.openModal());
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') this.closeModal();
    });

    // Actions
    document.getElementById('newShellBtn').addEventListener('click', () => {
      this.createNewTerminal();
      this.closeModal();
    });

    document.getElementById('newTmuxBtn').addEventListener('click', () => {
      this.createNewTmuxSession();
      this.closeModal();
    });

    window.addEventListener('resize', () => this.fitActiveTerminal());
  }

  openModal() {
    document.getElementById('modalOverlay').classList.add('show');
    this.send({ type: 'get-tmux-sessions' });
  }

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
  }

  showAuthOverlay() {
    document.getElementById('authOverlay').classList.remove('hidden');
    document.getElementById('tokenInput').focus();
  }

  hideAuthOverlay() {
    document.getElementById('authOverlay').classList.add('hidden');
  }

  showAuthError(message) {
    const el = document.getElementById('authError');
    el.textContent = message;
    el.classList.remove('hidden');
  }

  showError(message) {
    const toast = document.getElementById('errorToast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  }

  handleAuth() {
    const token = document.getElementById('tokenInput').value.trim();
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
    if (this.visitorId) {
      wsUrl += `&visitorId=${encodeURIComponent(this.visitorId)}`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      document.getElementById('reconnectBanner').classList.remove('show');
    };

    this.ws.onmessage = (e) => {
      try {
        this.handleMessage(JSON.parse(e.data));
      } catch (err) {
        console.error('Parse error:', err);
      }
    };

    this.ws.onclose = (e) => {
      this.updateStatus('disconnected');
      if (e.code === 4001) {
        localStorage.removeItem('token');
        localStorage.removeItem('visitorId');
        this.showAuthOverlay();
        this.showAuthError('Invalid token');
        return;
      }
      this.attemptReconnect();
    };

    this.ws.onerror = () => this.updateStatus('disconnected');
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'session':
        this.visitorId = msg.visitorId;
        localStorage.setItem('visitorId', msg.visitorId);
        if (msg.tmux) this.updateTmuxStatus(msg.tmux);
        if (msg.terminals?.length) {
          msg.terminals.forEach(t => this.initTerminal(t));
          const active = msg.terminals.find(t => t.isActive) || msg.terminals[0];
          this.switchTerminal(active.id);
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
        if (msg.terminals?.length) {
          const next = msg.terminals.find(t => t.isActive) || msg.terminals[0];
          this.switchTerminal(next.id);
        }
        break;

      case 'terminal-renamed':
        this.updateTabName(msg.terminalId, msg.name);
        break;

      case 'tmux-sessions':
        if (msg.tmux) this.updateTmuxStatus(msg.tmux);
        break;

      case 'error':
        this.showError(msg.message);
        break;

      case 'exit':
        const term = this.terminals.get(msg.terminalId);
        if (term) term.terminal.writeln(`\r\n\x1b[33mProcess exited (${msg.exitCode})\x1b[0m`);
        break;
    }
  }

  updateTmuxStatus(info) {
    this.tmuxAvailable = info.available;
    this.tmuxSessions = info.sessions || [];

    const badge = document.getElementById('tmuxBadge');
    badge.classList.toggle('unavailable', !this.tmuxAvailable);

    this.renderTmuxSessions();
  }

  renderTmuxSessions() {
    const container = document.getElementById('tmuxSessionsList');

    if (!this.tmuxAvailable) {
      container.innerHTML = '<div class="no-sessions">tmux not installed</div>';
      return;
    }

    if (!this.tmuxSessions.length) {
      container.innerHTML = '<div class="no-sessions">No sessions running</div>';
      return;
    }

    container.innerHTML = this.tmuxSessions.map(s => `
      <button class="modal-item" data-session="${this.escapeHtml(s.name)}">
        <div class="modal-item-icon tmux">⎔</div>
        <div class="modal-item-content">
          <div class="modal-item-title">${this.escapeHtml(s.name)}</div>
          <div class="modal-item-subtitle">${s.windows} window${s.windows > 1 ? 's' : ''}${s.attached ? ' • attached' : ''}</div>
        </div>
      </button>
    `).join('');

    container.querySelectorAll('[data-session]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.attachTmuxSession(btn.dataset.session);
        this.closeModal();
      });
    });
  }

  initTerminal(info) {
    if (this.terminals.has(info.id)) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Courier New", monospace',
      theme: {
        background: '#191919',
        foreground: '#e8e8e8',
        cursor: '#da7756',
        cursorAccent: '#191919',
        selection: 'rgba(218, 119, 86, 0.3)',
        black: '#191919',
        red: '#e85c5c',
        green: '#5bb98b',
        yellow: '#e5a84b',
        blue: '#6b9eff',
        magenta: '#c792ea',
        cyan: '#56d4dd',
        white: '#e8e8e8',
        brightBlack: '#6b6b6b',
        brightRed: '#ff7b7b',
        brightGreen: '#7dd6a8',
        brightYellow: '#ffc66d',
        brightBlue: '#8cb4ff',
        brightMagenta: '#ddb3f8',
        brightCyan: '#7ce8f0',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

    const pane = document.createElement('div');
    pane.className = 'terminal-pane';
    pane.id = `terminal-${info.id}`;
    document.getElementById('terminalsWrapper').appendChild(pane);

    terminal.open(pane);

    terminal.onData(data => this.send({ type: 'input', terminalId: info.id, data }));
    terminal.onResize(({ cols, rows }) => this.send({ type: 'resize', terminalId: info.id, cols, rows }));

    this.terminals.set(info.id, { terminal, fitAddon, element: pane, name: info.name, type: info.type || 'shell' });
    this.createTab(info.id, info.name, info.type);
  }

  createTab(id, name, type) {
    const tab = document.createElement('button');
    tab.className = 'tab' + (type === 'tmux' ? ' tmux' : '');
    tab.id = `tab-${id}`;
    tab.innerHTML = `
      <span class="tab-icon">${type === 'tmux' ? '⎔' : '$'}</span>
      <span class="tab-name">${this.escapeHtml(name)}</span>
      <button class="tab-close">×</button>
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

    tab.querySelector('.tab-name').addEventListener('dblclick', () => this.renameTerminal(id));

    document.getElementById('tabs').appendChild(tab);
  }

  switchTerminal(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.terminal-pane').forEach(p => p.classList.remove('active'));

    document.getElementById(`tab-${id}`)?.classList.add('active');
    document.getElementById(`terminal-${id}`)?.classList.add('active');

    this.activeTerminalId = id;

    const t = this.terminals.get(id);
    if (t) setTimeout(() => { t.fitAddon.fit(); t.terminal.focus(); }, 10);
  }

  writeToTerminal(id, data) {
    this.terminals.get(id)?.terminal.write(data);
  }

  fitActiveTerminal() {
    if (this.activeTerminalId) {
      try { this.terminals.get(this.activeTerminalId)?.fitAddon.fit(); } catch {}
    }
  }

  createNewTerminal() {
    this.send({ type: 'create-terminal' });
  }

  createNewTmuxSession() {
    if (!this.tmuxAvailable) {
      this.showError('tmux is not available');
      return;
    }
    const name = prompt('Session name:', `session-${Date.now()}`);
    if (name?.trim()) this.send({ type: 'create-tmux', sessionName: name.trim() });
  }

  attachTmuxSession(name) {
    this.send({ type: 'attach-tmux', sessionName: name });
  }

  closeTerminal(id) {
    if (this.terminals.size <= 1) return;
    this.send({ type: 'close-terminal', terminalId: id });
  }

  removeTerminal(id) {
    const t = this.terminals.get(id);
    if (t) {
      t.terminal.dispose();
      t.element.remove();
      this.terminals.delete(id);
    }
    document.getElementById(`tab-${id}`)?.remove();
  }

  renameTerminal(id) {
    const t = this.terminals.get(id);
    if (!t) return;
    const name = prompt('New name:', t.name);
    if (name?.trim()) this.send({ type: 'rename-terminal', terminalId: id, name: name.trim() });
  }

  updateTabName(id, name) {
    const el = document.querySelector(`#tab-${id} .tab-name`);
    if (el) el.textContent = name;
    const t = this.terminals.get(id);
    if (t) t.name = name;
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    document.getElementById('reconnectBanner').classList.add('show');
    setTimeout(() => this.connect(), delay);
  }

  updateStatus(status) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    dot.className = 'status-dot ' + status;
    text.textContent = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Disconnected' }[status];
  }

  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.remoteTerminal = new RemoteTerminal();
});
