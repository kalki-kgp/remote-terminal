import { nanoid } from 'nanoid';
import pty from 'node-pty';
import os from 'os';
import fs from 'fs';

export class SessionManager {
  constructor() {
    // Map of visitorId -> { terminals: Map<terminalId, ptyProcess>, activeTerminal }
    this.visitors = new Map();
    this.terminalBuffers = new Map(); // terminalId -> last N bytes of output for reconnection
    this.bufferSize = 50000; // Keep last 50KB of output per terminal
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

  closeTerminal(visitorId, terminalId) {
    const visitor = this.visitors.get(visitorId);
    if (!visitor) return false;

    const terminal = visitor.terminals.get(terminalId);
    if (terminal) {
      terminal.pty.kill();
      visitor.terminals.delete(terminalId);
      this.terminalBuffers.delete(terminalId);

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
    };
  }

  destroyAll() {
    for (const [visitorId] of this.visitors) {
      this.closeAllTerminals(visitorId);
    }
    this.visitors.clear();
  }
}
