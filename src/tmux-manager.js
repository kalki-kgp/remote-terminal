import { spawn, execSync } from 'child_process';
import pty from 'node-pty';
import os from 'os';

export class TmuxManager {
  constructor() {
    this.tmuxPath = this.findTmux();
  }

  findTmux() {
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

  // List all tmux sessions
  listSessions() {
    if (!this.isAvailable()) {
      return { available: false, sessions: [] };
    }

    try {
      // Format: session_name:num_windows:attached:created_timestamp
      const output = execSync(
        `${this.tmuxPath} list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}:#{session_created}"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();

      if (!output) {
        return { available: true, sessions: [] };
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

      return { available: true, sessions };
    } catch (error) {
      // No sessions or tmux server not running
      if (error.message.includes('no server running') || error.message.includes('no sessions')) {
        return { available: true, sessions: [] };
      }
      console.error('[Tmux] Error listing sessions:', error.message);
      return { available: true, sessions: [], error: error.message };
    }
  }

  // Get windows for a specific session
  listWindows(sessionName) {
    if (!this.isAvailable()) return [];

    try {
      const output = execSync(
        `${this.tmuxPath} list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}:#{window_active}"`,
        { encoding: 'utf8', timeout: 5000 }
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
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    // Attach to existing session
    const ptyProcess = pty.spawn(this.tmuxPath, ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env,
    });

    console.log(`[Tmux] Attached to session: ${sessionName}`);
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
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    // Create new session (or attach if exists)
    const ptyProcess = pty.spawn(this.tmuxPath, ['new-session', '-A', '-s', sessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env,
    });

    console.log(`[Tmux] Created/attached session: ${sessionName}`);
    return ptyProcess;
  }

  // Detach from session (without killing it)
  detachSession(sessionName) {
    if (!this.isAvailable()) return false;

    try {
      execSync(`${this.tmuxPath} detach-client -s "${sessionName}"`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // Kill a tmux session
  killSession(sessionName) {
    if (!this.isAvailable()) return false;

    try {
      execSync(`${this.tmuxPath} kill-session -t "${sessionName}"`, { timeout: 5000 });
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
      execSync(`${this.tmuxPath} has-session -t "${sessionName}"`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
