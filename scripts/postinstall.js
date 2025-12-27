#!/usr/bin/env node

/**
 * Post-install script for terminal-connect
 * Handles platform-specific setup after npm install
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

console.log('\n\x1b[36m[Connect]\x1b[0m Running post-install setup...\n');

// Fix node-pty spawn-helper permissions on macOS
if (isMac) {
  try {
    const nodeModules = join(__dirname, '..', 'node_modules');
    const ptyPath = join(nodeModules, 'node-pty', 'prebuilds');

    if (existsSync(ptyPath)) {
      execSync(`chmod +x ${ptyPath}/darwin-*/spawn-helper 2>/dev/null || true`, {
        stdio: 'inherit'
      });
      console.log('\x1b[32m✓\x1b[0m Fixed node-pty permissions');
    }
  } catch (err) {
    // Ignore errors - spawn-helper might not exist in all installations
  }
}

// Windows-specific checks
if (isWindows) {
  console.log('\x1b[33m!\x1b[0m Windows detected');
  console.log('  • PowerShell will be used as default shell');
  console.log('  • For tmux support, install WSL: wsl --install');
  console.log('  • Then install tmux in WSL: sudo apt install tmux\n');
}

// Check Node.js version
const nodeVersion = process.versions.node.split('.')[0];
if (parseInt(nodeVersion) < 18) {
  console.log('\x1b[31m✗\x1b[0m Node.js 18+ required (you have v' + process.versions.node + ')');
  console.log('  Please upgrade: https://nodejs.org\n');
  process.exit(1);
}

console.log('\x1b[32m✓\x1b[0m Setup complete!\n');
console.log('Run \x1b[36mconnect\x1b[0m or \x1b[36mnpx terminal-connect\x1b[0m to start.\n');
