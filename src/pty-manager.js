import pty from 'node-pty';
import os from 'os';
import fs from 'fs';

export class PTYManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(sessionId) {
    // Find available shell
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
    let shell = process.env.SHELL;

    // Verify shell exists
    if (!shell || !fs.existsSync(shell)) {
      shell = shells.find(s => fs.existsSync(s)) || '/bin/sh';
    }

    console.log(`[PTY] Using shell: ${shell}`);

    // Get terminal size defaults
    const cols = 80;
    const rows = 24;

    // Build clean environment
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
      cols,
      rows,
      cwd: os.homedir(),
      env,
    });

    this.sessions.set(sessionId, ptyProcess);

    console.log(`[PTY] Session created: ${sessionId} (PID: ${ptyProcess.pid})`);

    return ptyProcess;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.write(data);
    }
  }

  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.resize(cols, rows);
      console.log(`[PTY] Session ${sessionId} resized to ${cols}x${rows}`);
    }
  }

  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.kill();
      this.sessions.delete(sessionId);
      console.log(`[PTY] Session destroyed: ${sessionId}`);
    }
  }

  destroyAll() {
    for (const [sessionId, session] of this.sessions) {
      session.kill();
      console.log(`[PTY] Session destroyed: ${sessionId}`);
    }
    this.sessions.clear();
  }
}
