import { nanoid } from 'nanoid';
import pty from 'node-pty';
import os from 'os';
import fs from 'fs';
import { TmuxManager } from './tmux-manager.js';

export class SessionManager {
  constructor() {
    // Map of visitorId -> { terminals: Map<terminalId, terminalInfo>, activeTerminal }
    this.visitors = new Map();
    this.terminalBuffers = new Map(); // terminalId -> last N bytes of output for reconnection
    this.bufferSize = 50000; // Keep last 50KB of output per terminal
    this.tmux = new TmuxManager();
  }

  getOrCreateVisitor(visitorId) {
    if (!this.visitors.has(visitorId)) {
      this.visitors.set(visitorId, {
        terminals: new Map(),
        activeTerminal: null,
        createdAt: Date.now(),
      });
    }
    return this.visitors.get(visitorId);
  }

  // Get tmux status and sessions
  getTmuxInfo() {
    return this.tmux.listSessions();
  }

  // Attach to an existing tmux session
  attachTmuxSession(visitorId, tmuxSessionName) {
    if (!this.tmux.isAvailable()) {
      throw new Error('tmux is not installed on this system');
    }

    if (!this.tmux.sessionExists(tmuxSessionName)) {
      throw new Error(`tmux session "${tmuxSessionName}" not found`);
    }

    const visitor = this.getOrCreateVisitor(visitorId);
    const terminalId = nanoid(12);
    const terminalName = `tmux: ${tmuxSessionName}`;

    const ptyProcess = this.tmux.attachToSession(tmuxSessionName);

    const terminalInfo = {
      id: terminalId,
      name: terminalName,
      pty: ptyProcess,
      type: 'tmux',
      tmuxSession: tmuxSessionName,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    visitor.terminals.set(terminalId, terminalInfo);
    this.terminalBuffers.set(terminalId, '');

    // Capture output
    ptyProcess.onData((data) => {
      terminalInfo.lastActivity = Date.now();
      let buffer = this.terminalBuffers.get(terminalId) || '';
      buffer += data;
      if (buffer.length > this.bufferSize) {
        buffer = buffer.slice(-this.bufferSize);
      }
      this.terminalBuffers.set(terminalId, buffer);
    });

    if (!visitor.activeTerminal) {
      visitor.activeTerminal = terminalId;
    }

    console.log(`[Session] Attached to tmux session "${tmuxSessionName}" as terminal ${terminalId}`);
    return terminalInfo;
  }

  // Create a new tmux session
  createTmuxSession(visitorId, tmuxSessionName) {
    if (!this.tmux.isAvailable()) {
      throw new Error('tmux is not installed on this system');
    }

    const visitor = this.getOrCreateVisitor(visitorId);
    const terminalId = nanoid(12);
    const terminalName = `tmux: ${tmuxSessionName}`;

    const ptyProcess = this.tmux.createSession(tmuxSessionName);

    const terminalInfo = {
      id: terminalId,
      name: terminalName,
      pty: ptyProcess,
      type: 'tmux',
      tmuxSession: tmuxSessionName,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    visitor.terminals.set(terminalId, terminalInfo);
    this.terminalBuffers.set(terminalId, '');

    // Capture output
    ptyProcess.onData((data) => {
      terminalInfo.lastActivity = Date.now();
      let buffer = this.terminalBuffers.get(terminalId) || '';
      buffer += data;
      if (buffer.length > this.bufferSize) {
        buffer = buffer.slice(-this.bufferSize);
      }
      this.terminalBuffers.set(terminalId, buffer);
    });

    if (!visitor.activeTerminal) {
      visitor.activeTerminal = terminalId;
    }

    console.log(`[Session] Created tmux session "${tmuxSessionName}" as terminal ${terminalId}`);
    return terminalInfo;
  }

  createTerminal(visitorId, name = null) {
    const visitor = this.getOrCreateVisitor(visitorId);
    const terminalId = nanoid(12);
    const terminalName = name || `Terminal ${visitor.terminals.size + 1}`;

    // Find available shell
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
    let shell = process.env.SHELL;
    if (!shell || !fs.existsSync(shell)) {
      shell = shells.find(s => fs.existsSync(s)) || '/bin/sh';
    }

    const env = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      HOME: os.homedir(),
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      SHELL: shell,
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env,
    });

    const terminalInfo = {
      id: terminalId,
      name: terminalName,
      pty: ptyProcess,
      type: 'shell',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    visitor.terminals.set(terminalId, terminalInfo);

    // Initialize buffer for this terminal
    this.terminalBuffers.set(terminalId, '');

    // Capture output for reconnection
    ptyProcess.onData((data) => {
      terminalInfo.lastActivity = Date.now();
      let buffer = this.terminalBuffers.get(terminalId) || '';
      buffer += data;
      // Keep only last N bytes
      if (buffer.length > this.bufferSize) {
        buffer = buffer.slice(-this.bufferSize);
      }
      this.terminalBuffers.set(terminalId, buffer);
    });

    // Set as active if first terminal
    if (!visitor.activeTerminal) {
      visitor.activeTerminal = terminalId;
    }

    console.log(`[Session] Created terminal ${terminalId} (${terminalName}) for visitor ${visitorId}`);

    return terminalInfo;
  }

  getTerminal(visitorId, terminalId) {
    const visitor = this.visitors.get(visitorId);
    if (!visitor) return null;
    return visitor.terminals.get(terminalId);
  }

  getTerminals(visitorId) {
    const visitor = this.visitors.get(visitorId);
    if (!visitor) return [];

    return Array.from(visitor.terminals.values()).map(t => ({
      id: t.id,
      name: t.name,
      type: t.type || 'shell',
      tmuxSession: t.tmuxSession || null,
      createdAt: t.createdAt,
      lastActivity: t.lastActivity,
      isActive: t.id === visitor.activeTerminal,
    }));
  }

  getTerminalBuffer(terminalId) {
    return this.terminalBuffers.get(terminalId) || '';
  }

  setActiveTerminal(visitorId, terminalId) {
    const visitor = this.visitors.get(visitorId);
    if (visitor && visitor.terminals.has(terminalId)) {
      visitor.activeTerminal = terminalId;
      return true;
    }
    return false;
  }

  renameTerminal(visitorId, terminalId, newName) {
    const terminal = this.getTerminal(visitorId, terminalId);
    if (terminal) {
      terminal.name = newName;
      return true;
    }
    return false;
  }

  writeToTerminal(visitorId, terminalId, data) {
    const terminal = this.getTerminal(visitorId, terminalId);
    if (terminal) {
      terminal.pty.write(data);
      terminal.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  resizeTerminal(visitorId, terminalId, cols, rows) {
    const terminal = this.getTerminal(visitorId, terminalId);
    if (terminal) {
      terminal.pty.resize(cols, rows);
      return true;
    }
    return false;
  }

  closeTerminal(visitorId, terminalId, killTmuxSession = false) {
    const visitor = this.visitors.get(visitorId);
    if (!visitor) return false;

    const terminal = visitor.terminals.get(terminalId);
    if (terminal) {
      // For tmux sessions, just detach by default (don't kill the session)
      if (terminal.type === 'tmux' && !killTmuxSession) {
        console.log(`[Session] Detaching from tmux session "${terminal.tmuxSession}" (session preserved)`);
      }

      terminal.pty.kill();
      visitor.terminals.delete(terminalId);
      this.terminalBuffers.delete(terminalId);

      // Optionally kill the tmux session
      if (terminal.type === 'tmux' && killTmuxSession && terminal.tmuxSession) {
        this.tmux.killSession(terminal.tmuxSession);
      }

      // Update active terminal if needed
      if (visitor.activeTerminal === terminalId) {
        const remaining = Array.from(visitor.terminals.keys());
        visitor.activeTerminal = remaining.length > 0 ? remaining[0] : null;
      }

      console.log(`[Session] Closed terminal ${terminalId} for visitor ${visitorId}`);
      return true;
    }
    return false;
  }

  closeAllTerminals(visitorId) {
    const visitor = this.visitors.get(visitorId);
    if (!visitor) return;

    for (const [terminalId, terminal] of visitor.terminals) {
      terminal.pty.kill();
      this.terminalBuffers.delete(terminalId);
    }
    visitor.terminals.clear();
    visitor.activeTerminal = null;

    console.log(`[Session] Closed all terminals for visitor ${visitorId}`);
  }

  getStats() {
    let totalTerminals = 0;
    for (const visitor of this.visitors.values()) {
      totalTerminals += visitor.terminals.size;
    }
    return {
      visitors: this.visitors.size,
      terminals: totalTerminals,
      tmuxAvailable: this.tmux.isAvailable(),
    };
  }

  destroyAll() {
    for (const [visitorId] of this.visitors) {
      this.closeAllTerminals(visitorId);
    }
    this.visitors.clear();
  }
}
