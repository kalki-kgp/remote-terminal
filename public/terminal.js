// Connect - Claude Code Style
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

    // Mobile UX state
    this.ctrlPressed = false;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isSwiping = false;
    this.swipeThreshold = 80;

    // Favorites
    this.favorites = [];
    this.editingFavoriteId = null;

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

    // Mobile keyboard shortcuts
    this.setupKeyboardBar();

    // Swipe gestures for tab switching
    this.setupSwipeGestures();

    // Handle virtual keyboard visibility
    this.setupVirtualKeyboardHandler();

    // Favorites panel
    this.setupFavoritesPanel();
  }

  // Haptic feedback helper
  haptic(style = 'light') {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 30,
      };
      navigator.vibrate(patterns[style] || 10);
    }
  }

  // Mobile keyboard shortcuts
  setupKeyboardBar() {
    const bar = document.getElementById('keyboardBar');
    const ctrlKey = document.getElementById('ctrlKey');

    bar.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.haptic('light');

        const key = btn.dataset.key;
        const action = btn.dataset.action;

        if (key === 'ctrl') {
          this.ctrlPressed = !this.ctrlPressed;
          ctrlKey.classList.toggle('ctrl-active', this.ctrlPressed);
          return;
        }

        const terminal = this.terminals.get(this.activeTerminalId);
        if (!terminal) return;

        let sequence = '';

        if (action) {
          // Ctrl+key combinations
          const char = action.split('-')[1].toUpperCase();
          sequence = String.fromCharCode(char.charCodeAt(0) - 64);
          this.haptic('medium');
        } else if (key) {
          if (this.ctrlPressed) {
            // Ctrl modifier active
            const charCode = key.toUpperCase().charCodeAt(0);
            if (charCode >= 65 && charCode <= 90) {
              sequence = String.fromCharCode(charCode - 64);
            }
          } else {
            // Regular keys
            const keyMap = {
              'tab': '\t',
              'esc': '\x1b',
              'up': '\x1b[A',
              'down': '\x1b[B',
              'left': '\x1b[D',
              'right': '\x1b[C',
            };
            sequence = keyMap[key] || '';
          }
        }

        if (sequence) {
          this.send({ type: 'input', terminalId: this.activeTerminalId, data: sequence });
          // Don't call terminal.focus() on mobile as it can trigger virtual keyboard
          // The terminal should already have focus if the keyboard is open
        }

        // Reset Ctrl after use
        if (this.ctrlPressed && key !== 'ctrl') {
          this.ctrlPressed = false;
          ctrlKey.classList.remove('ctrl-active');
        }
      });
    });
  }

  // Swipe gestures for tab switching
  setupSwipeGestures() {
    const wrapper = document.getElementById('terminalsWrapper');
    const leftIndicator = document.getElementById('swipeLeft');
    const rightIndicator = document.getElementById('swipeRight');

    wrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.isSwiping = false;
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;

      const deltaX = e.touches[0].clientX - this.touchStartX;
      const deltaY = e.touches[0].clientY - this.touchStartY;

      // Only horizontal swipes
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 30) {
        this.isSwiping = true;

        // Show indicator
        if (deltaX > this.swipeThreshold) {
          leftIndicator.classList.add('show');
          rightIndicator.classList.remove('show');
        } else if (deltaX < -this.swipeThreshold) {
          rightIndicator.classList.add('show');
          leftIndicator.classList.remove('show');
        } else {
          leftIndicator.classList.remove('show');
          rightIndicator.classList.remove('show');
        }
      }
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      leftIndicator.classList.remove('show');
      rightIndicator.classList.remove('show');

      if (!this.isSwiping) return;

      const deltaX = e.changedTouches[0].clientX - this.touchStartX;

      if (Math.abs(deltaX) > this.swipeThreshold) {
        this.haptic('medium');

        const terminalIds = Array.from(this.terminals.keys());
        const currentIndex = terminalIds.indexOf(this.activeTerminalId);

        if (deltaX > 0 && currentIndex > 0) {
          // Swipe right - previous tab
          this.switchTerminal(terminalIds[currentIndex - 1]);
          this.send({ type: 'switch-terminal', terminalId: terminalIds[currentIndex - 1] });
        } else if (deltaX < 0 && currentIndex < terminalIds.length - 1) {
          // Swipe left - next tab
          this.switchTerminal(terminalIds[currentIndex + 1]);
          this.send({ type: 'switch-terminal', terminalId: terminalIds[currentIndex + 1] });
        }
      }

      this.isSwiping = false;
    }, { passive: true });
  }

  // Handle virtual keyboard showing/hiding
  setupVirtualKeyboardHandler() {
    const keyboardBar = document.getElementById('keyboardBar');

    // Use visualViewport API if available (modern mobile browsers)
    if (window.visualViewport) {
      const updateKeyboardPosition = () => {
        const viewport = window.visualViewport;
        const keyboardHeight = window.innerHeight - viewport.height - viewport.offsetTop;

        if (keyboardHeight > 100) {
          // Virtual keyboard is open - move bar above it
          keyboardBar.style.bottom = `${keyboardHeight}px`;
        } else {
          // Virtual keyboard is closed
          keyboardBar.style.bottom = '0';
        }

        // Refit terminal after keyboard state changes
        this.fitActiveTerminal();
      };

      window.visualViewport.addEventListener('resize', updateKeyboardPosition);
      window.visualViewport.addEventListener('scroll', updateKeyboardPosition);
    }

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
      // Request favorite commands
      this.send({ type: 'get-commands' });
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

      case 'commands-list':
        this.favorites = msg.commands || [];
        this.renderFavorites();
        break;
    }
  }

  updateTmuxStatus(info) {
    this.tmuxAvailable = info.available;
    this.tmuxSessions = info.sessions || [];
    this.tmuxUseWSL = info.useWSL || false;
    this.wslAvailable = info.wslAvailable || false;
    this.wslTmuxMissing = info.wslTmuxMissing || false;

    const badge = document.getElementById('tmuxBadge');
    badge.classList.toggle('unavailable', !this.tmuxAvailable);

    // Update badge text if using WSL
    if (this.tmuxAvailable && this.tmuxUseWSL) {
      badge.textContent = 'tmux (WSL)';
    } else {
      badge.textContent = 'tmux';
    }

    this.renderTmuxSessions();
  }

  renderTmuxSessions() {
    const container = document.getElementById('tmuxSessionsList');

    if (!this.tmuxAvailable) {
      // Check if we're on Windows and can help user set up tmux
      if (this.wslTmuxMissing) {
        // WSL exists but tmux not installed
        container.innerHTML = `
          <div class="no-sessions" style="text-align: left; padding: 12px;">
            <strong>tmux not installed in WSL</strong><br><br>
            Run this in WSL to install:
            <code style="display: block; background: var(--bg-tertiary); padding: 8px; margin-top: 8px; border-radius: 4px; font-size: 12px;">
              sudo apt update && sudo apt install tmux
            </code>
          </div>
        `;
      } else if (this.wslAvailable === false && navigator.platform?.includes('Win')) {
        // Windows without WSL
        container.innerHTML = `
          <div class="no-sessions" style="text-align: left; padding: 12px;">
            <strong>Install WSL for tmux support</strong><br><br>
            Run in PowerShell (as Admin):
            <code style="display: block; background: var(--bg-tertiary); padding: 8px; margin-top: 8px; border-radius: 4px; font-size: 12px;">
              wsl --install
            </code>
            <br>Then restart and install tmux:
            <code style="display: block; background: var(--bg-tertiary); padding: 8px; margin-top: 8px; border-radius: 4px; font-size: 12px;">
              sudo apt install tmux
            </code>
          </div>
        `;
      } else {
        container.innerHTML = '<div class="no-sessions">tmux not installed</div>';
      }
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

  // Favorites Panel
  setupFavoritesPanel() {
    const btn = document.getElementById('favoritesBtn');
    const panel = document.getElementById('favoritesPanel');
    const overlay = document.getElementById('favoritesOverlay');
    const closeBtn = document.getElementById('favoritesClose');
    const addBtn = document.getElementById('favoritesAddBtn');
    const formOverlay = document.getElementById('favoritesFormOverlay');
    const formCancel = document.getElementById('favoritesFormCancel');
    const formSave = document.getElementById('favoritesFormSave');

    // Open panel
    btn.addEventListener('click', () => {
      panel.classList.add('show');
      overlay.classList.add('show');
    });

    // Close panel
    const closePanel = () => {
      panel.classList.remove('show');
      overlay.classList.remove('show');
    };
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);

    // Add command button
    addBtn.addEventListener('click', () => {
      this.openFavoriteForm(null);
    });

    // Form cancel
    formCancel.addEventListener('click', () => {
      this.closeFavoriteForm();
    });

    // Form save
    formSave.addEventListener('click', () => {
      this.saveFavorite();
    });

    // Close form on overlay click
    formOverlay.addEventListener('click', (e) => {
      if (e.target === formOverlay) {
        this.closeFavoriteForm();
      }
    });

    // Handle enter key in form
    document.getElementById('favoriteCommand').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveFavorite();
    });
  }

  renderFavorites() {
    const container = document.getElementById('favoritesList');

    if (!this.favorites.length) {
      container.innerHTML = `
        <div class="favorites-empty">
          <div class="favorites-empty-icon">&#9733;</div>
          <p>No favorite commands yet.<br>Add commands you use often!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.favorites.map(cmd => `
      <div class="favorite-item" data-id="${cmd.id}">
        <div class="favorite-content" data-execute="${cmd.id}">
          <div class="favorite-label">${this.escapeHtml(cmd.label)}</div>
          <div class="favorite-command">${this.escapeHtml(cmd.command)}</div>
        </div>
        <div class="favorite-actions">
          <button class="favorite-action edit" data-edit="${cmd.id}" title="Edit">&#9998;</button>
          <button class="favorite-action delete" data-delete="${cmd.id}" title="Delete">&#10005;</button>
        </div>
      </div>
    `).join('');

    // Execute on click
    container.querySelectorAll('[data-execute]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.execute;
        const cmd = this.favorites.find(c => c.id === id);
        if (cmd) this.executeFavorite(cmd);
      });
    });

    // Edit buttons
    container.querySelectorAll('[data-edit]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.edit;
        const cmd = this.favorites.find(c => c.id === id);
        if (cmd) this.openFavoriteForm(cmd);
      });
    });

    // Delete buttons
    container.querySelectorAll('[data-delete]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.delete;
        if (confirm('Delete this command?')) {
          this.send({ type: 'delete-command', id });
        }
      });
    });
  }

  openFavoriteForm(cmd) {
    this.editingFavoriteId = cmd?.id || null;
    document.getElementById('favoritesFormTitle').textContent = cmd ? 'Edit Command' : 'Add Command';
    document.getElementById('favoriteLabel').value = cmd?.label || '';
    document.getElementById('favoriteCommand').value = cmd?.command || '';
    document.getElementById('favoritesFormOverlay').classList.add('show');
    document.getElementById('favoriteLabel').focus();
  }

  closeFavoriteForm() {
    document.getElementById('favoritesFormOverlay').classList.remove('show');
    this.editingFavoriteId = null;
  }

  saveFavorite() {
    const label = document.getElementById('favoriteLabel').value.trim();
    const command = document.getElementById('favoriteCommand').value.trim();

    if (!label || !command) {
      this.showError('Please enter both label and command');
      return;
    }

    if (this.editingFavoriteId) {
      this.send({ type: 'update-command', id: this.editingFavoriteId, label, command });
    } else {
      this.send({ type: 'add-command', label, command });
    }

    this.closeFavoriteForm();
  }

  executeFavorite(cmd) {
    if (!this.activeTerminalId) {
      this.showError('No active terminal');
      return;
    }

    // Send command + Enter to terminal
    this.send({
      type: 'input',
      terminalId: this.activeTerminalId,
      data: cmd.command + '\r',
    });

    // Close panel
    document.getElementById('favoritesPanel').classList.remove('show');
    document.getElementById('favoritesOverlay').classList.remove('show');

    // Focus terminal
    const t = this.terminals.get(this.activeTerminalId);
    if (t) t.terminal.focus();

    this.haptic('medium');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.remoteTerminal = new RemoteTerminal();
});
