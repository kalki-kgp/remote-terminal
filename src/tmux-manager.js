import { spawn, execSync } from 'child_process';
import pty from 'node-pty';
import os from 'os';

export class TmuxManager {
  constructor() {
    this.isWindows = process.platform === 'win32';
    this.useWSL = false;
    this.wslDistro = null;
    this.tmuxPath = this.findTmux();
  }

  // Check if WSL is available on Windows
  checkWSL() {
    if (!this.isWindows) return { available: false };

    try {
      // Check if WSL is installed and get default distro
      const output = execSync('wsl -l -q', { encoding: 'utf8', timeout: 5000 }).trim();
      if (output) {
        // Get first non-empty line (default distro)
        const distros = output.split('\n').map(d => d.replace(/\0/g, '').trim()).filter(Boolean);
        if (distros.length > 0) {
          return { available: true, distro: distros[0], allDistros: distros };
        }
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  // Check if tmux is installed in WSL
  checkWSLTmux() {
    try {
      const path = execSync('wsl which tmux', { encoding: 'utf8', timeout: 5000 }).trim();
      return path || null;
    } catch {
      return null;
    }
  }

  findTmux() {
    if (this.isWindows) {
      // On Windows, check for WSL + tmux
      const wsl = this.checkWSL();
      if (wsl.available) {
        const tmuxInWSL = this.checkWSLTmux();
        if (tmuxInWSL) {
          this.useWSL = true;
          this.wslDistro = wsl.distro;
          console.log(`[Tmux] Found tmux in WSL (${wsl.distro})`);
          return tmuxInWSL; // Store the WSL tmux path
        } else {
          console.log('[Tmux] WSL found but tmux not installed. Install with: wsl sudo apt install tmux');
        }
      }
      return null;
    }

    // Unix: direct tmux lookup
    try {
      const path = execSync('which tmux', { encoding: 'utf8' }).trim();
      return path || null;
    } catch {
      return null;
    }
  }

  isAvailable() {
    return this.tmuxPath !== null;
  }

  // Get info about tmux availability (used by frontend)
  getInfo() {
    const wsl = this.isWindows ? this.checkWSL() : { available: false };
    return {
      available: this.isAvailable(),
      useWSL: this.useWSL,
      wslDistro: this.wslDistro,
      wslAvailable: wsl.available,
      wslTmuxMissing: wsl.available && !this.useWSL, // WSL exists but tmux not installed
    };
  }

  // Execute a tmux command (handles WSL wrapping)
  execTmux(args, options = {}) {
    const cmd = this.useWSL
      ? `wsl tmux ${args}`
      : `${this.tmuxPath} ${args}`;
    return execSync(cmd, { encoding: 'utf8', timeout: 5000, ...options });
  }

  // List all tmux sessions
  listSessions() {
    if (!this.isAvailable()) {
      const info = this.getInfo();
      return {
        available: false,
        sessions: [],
        wslAvailable: info.wslAvailable,
        wslTmuxMissing: info.wslTmuxMissing,
      };
    }

    try {
      // Format: session_name:num_windows:attached:created_timestamp
      const output = this.execTmux(
        'list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}:#{session_created}"'
      ).trim();

      if (!output) {
        return { available: true, sessions: [], useWSL: this.useWSL };
      }

      const sessions = output.split('\n').map(line => {
        const [name, windows, attached, created] = line.split(':');
        return {
          name,
          windows: parseInt(windows, 10),
          attached: attached === '1',
          createdAt: new Date(parseInt(created, 10) * 1000).toISOString(),
        };
      });

      return { available: true, sessions, useWSL: this.useWSL };
    } catch (error) {
      // No sessions or tmux server not running
      if (error.message.includes('no server running') || error.message.includes('no sessions')) {
        return { available: true, sessions: [], useWSL: this.useWSL };
      }
      console.error('[Tmux] Error listing sessions:', error.message);
      return { available: true, sessions: [], error: error.message, useWSL: this.useWSL };
    }
  }

  // Get windows for a specific session
  listWindows(sessionName) {
    if (!this.isAvailable()) return [];

    try {
      const output = this.execTmux(
        `list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}:#{window_active}"`
      ).trim();

      if (!output) return [];

      return output.split('\n').map(line => {
        const [index, name, active] = line.split(':');
        return {
          index: parseInt(index, 10),
          name,
          active: active === '1',
        };
      });
    } catch (error) {
      console.error('[Tmux] Error listing windows:', error.message);
      return [];
    }
  }

  // Create a PTY that attaches to an existing tmux session
  attachToSession(sessionName, cols = 80, rows = 24) {
    if (!this.isAvailable()) {
      throw new Error('tmux is not installed');
    }

    const env = {
      TERM: 'xterm-256color',
      HOME: os.homedir(),
      PATH: process.env.PATH,
      USER: process.env.USER || process.env.USERNAME || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    let shell, args;
    if (this.useWSL) {
      // On Windows with WSL, spawn wsl with tmux command
      shell = 'wsl';
      args = ['tmux', 'attach-session', '-t', sessionName];
    } else {
      shell = this.tmuxPath;
      args = ['attach-session', '-t', sessionName];
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env,
    });

    console.log(`[Tmux] Attached to session: ${sessionName}${this.useWSL ? ' (via WSL)' : ''}`);
    return ptyProcess;
  }

  // Create a new tmux session and return PTY attached to it
  createSession(sessionName, cols = 80, rows = 24) {
    if (!this.isAvailable()) {
      throw new Error('tmux is not installed');
    }

    const env = {
      TERM: 'xterm-256color',
      HOME: os.homedir(),
      PATH: process.env.PATH,
      USER: process.env.USER || process.env.USERNAME || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    let shell, args;
    if (this.useWSL) {
      // On Windows with WSL, spawn wsl with tmux command
      shell = 'wsl';
      args = ['tmux', 'new-session', '-A', '-s', sessionName];
    } else {
      shell = this.tmuxPath;
      args = ['new-session', '-A', '-s', sessionName];
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env,
    });

    console.log(`[Tmux] Created/attached session: ${sessionName}${this.useWSL ? ' (via WSL)' : ''}`);
    return ptyProcess;
  }

  // Detach from session (without killing it)
  detachSession(sessionName) {
    if (!this.isAvailable()) return false;

    try {
      this.execTmux(`detach-client -s "${sessionName}"`);
      return true;
    } catch {
      return false;
    }
  }

  // Kill a tmux session
  killSession(sessionName) {
    if (!this.isAvailable()) return false;

    try {
      this.execTmux(`kill-session -t "${sessionName}"`);
      console.log(`[Tmux] Killed session: ${sessionName}`);
      return true;
    } catch (error) {
      console.error('[Tmux] Error killing session:', error.message);
      return false;
    }
  }

  // Check if a session exists
  sessionExists(sessionName) {
    if (!this.isAvailable()) return false;

    try {
      this.execTmux(`has-session -t "${sessionName}"`);
      return true;
    } catch {
      return false;
    }
  }
}
