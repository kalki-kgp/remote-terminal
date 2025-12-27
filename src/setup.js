import { execSync, spawn } from 'child_process';
import readline from 'readline';

const isWindows = process.platform === 'win32';

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',

  orange: '\x1b[38;5;208m',
  pink: '\x1b[38;5;205m',
  purple: '\x1b[38;5;141m',
  lime: '\x1b[38;5;118m',
};

// Fun ASCII art logos
const LOGO = `
${c.orange}   ██████╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗ ██████╗████████╗
  ██╔════╝██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔════╝╚══██╔══╝
  ██║     ██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██║        ██║
  ██║     ██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██║        ██║
  ╚██████╗╚██████╔╝██║ ╚████║██║ ╚████║███████╗╚██████╗   ██║
   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═╝${c.reset}
`;

const SETUP_WIZARD = `
${c.cyan}  ┌─────────────────────────────────────────────────────────┐
  │  ${c.bold}${c.white}🧙 SETUP WIZARD${c.reset}${c.cyan}                                        │
  │  ${c.dim}Making sure everything is ready for you...${c.reset}${c.cyan}              │
  └─────────────────────────────────────────────────────────┘${c.reset}
`;

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const loadingMessages = [
  'Consulting the tech spirits...',
  'Warming up the servers...',
  'Aligning the bits...',
  'Calibrating quantum flux...',
  'Brewing digital coffee...',
  'Waking up the hamsters...',
  'Polishing the pixels...',
  'Summoning the code wizards...',
];

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Animated spinner
class Spinner {
  constructor(text) {
    this.text = text;
    this.frameIndex = 0;
    this.interval = null;
  }

  start() {
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      const frame = spinnerFrames[this.frameIndex];
      process.stdout.write(`\r  ${c.cyan}${frame}${c.reset} ${this.text}`);
      this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length;
    }, 80);
  }

  update(text) {
    this.text = text;
  }

  stop(finalText, success = true) {
    clearInterval(this.interval);
    const icon = success ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    process.stdout.write(`\r  ${icon} ${finalText}\x1b[K\n`);
    process.stdout.write('\x1b[?25h'); // Show cursor
  }
}

// Animated progress bar
async function progressBar(text, duration = 2000) {
  const width = 30;
  const steps = 20;
  const stepTime = duration / steps;

  process.stdout.write('\x1b[?25l'); // Hide cursor

  for (let i = 0; i <= steps; i++) {
    const filled = Math.round((i / steps) * width);
    const empty = width - filled;
    const percent = Math.round((i / steps) * 100);

    const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
    const randomMsg = i < steps ? loadingMessages[Math.floor(Math.random() * loadingMessages.length)] : text;

    process.stdout.write(`\r  ${bar} ${c.bold}${percent}%${c.reset} ${c.dim}${randomMsg}${c.reset}\x1b[K`);
    await sleep(stepTime);
  }

  process.stdout.write(`\r  ${c.green}${'█'.repeat(width)}${c.reset} ${c.bold}100%${c.reset} ${c.green}${text}${c.reset}\x1b[K\n`);
  process.stdout.write('\x1b[?25h'); // Show cursor
}

// Typewriter effect
async function typewriter(text, speed = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(speed);
  }
  console.log();
}

// Fancy box
function box(lines, color = c.cyan, icon = '') {
  const maxLen = Math.max(...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').length));
  const width = maxLen + 4;

  console.log(`  ${color}╭${'─'.repeat(width)}╮${c.reset}`);
  for (const line of lines) {
    const plainLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(maxLen - plainLen);
    console.log(`  ${color}│${c.reset}  ${line}${padding}  ${color}│${c.reset}`);
  }
  console.log(`  ${color}╰${'─'.repeat(width)}╯${c.reset}`);
}

// Big success message
function successBanner(text) {
  console.log();
  console.log(`  ${c.bgGreen}${c.bold}${c.white}                                                    ${c.reset}`);
  console.log(`  ${c.bgGreen}${c.bold}${c.white}   ✨ ${text.padEnd(44)} ${c.reset}`);
  console.log(`  ${c.bgGreen}${c.bold}${c.white}                                                    ${c.reset}`);
  console.log();
}

// Warning banner
function warningBanner(text) {
  console.log();
  console.log(`  ${c.bgYellow}${c.bold}${c.white}                                                    ${c.reset}`);
  console.log(`  ${c.bgYellow}${c.bold}${c.white}   ⚠️  ${text.padEnd(43)} ${c.reset}`);
  console.log(`  ${c.bgYellow}${c.bold}${c.white}                                                    ${c.reset}`);
  console.log();
}

// Create readline interface for user prompts
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Fancy yes/no prompt
async function ask(question) {
  return new Promise((resolve) => {
    const rl = createPrompt();
    process.stdout.write(`\n  ${c.yellow}?${c.reset} ${c.bold}${question}${c.reset} ${c.dim}(y/n)${c.reset} `);

    rl.question('', (answer) => {
      rl.close();
      const yes = answer.toLowerCase().startsWith('y');
      console.log(`  ${yes ? c.green + '→ Yes!' : c.dim + '→ No'}${c.reset}\n`);
      resolve(yes);
    });
  });
}

// Check if WSL is installed
function checkWSL() {
  try {
    const output = execSync('wsl -l -q', { encoding: 'utf8', timeout: 5000 });
    const distros = output.split('\n').map(d => d.replace(/\0/g, '').trim()).filter(Boolean);
    return distros.length > 0;
  } catch {
    return false;
  }
}

// Check if tmux is installed in WSL
function checkWSLTmux() {
  try {
    execSync('wsl which tmux', { encoding: 'utf8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Check if tmux is installed (Unix)
function checkTmux() {
  try {
    execSync('which tmux', { encoding: 'utf8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Check if cloudflared is installed
function checkCloudflared() {
  try {
    if (isWindows) {
      execSync('where cloudflared', { encoding: 'utf8', timeout: 5000 });
    } else {
      execSync('which cloudflared', { encoding: 'utf8', timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}

// Install cloudflared on macOS
async function installCloudflaredMac() {
  // Check if Homebrew is installed
  try {
    execSync('which brew', { encoding: 'utf8' });
  } catch {
    console.log();
    box([
      `${c.yellow}Homebrew not found!${c.reset}`,
      ``,
      `${c.dim}Install Homebrew first:${c.reset}`,
      `${c.cyan}/bin/bash -c "$(curl -fsSL${c.reset}`,
      `${c.cyan}  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"${c.reset}`,
      ``,
      `${c.dim}Then run:${c.reset} ${c.cyan}brew install cloudflared${c.reset}`,
    ], c.yellow);
    return false;
  }

  console.log();
  box([
    `${c.bold}${c.purple}🍺 Installing cloudflared via Homebrew${c.reset}`,
    `${c.dim}This enables secure tunneling...${c.reset}`,
  ], c.purple);
  console.log();

  const spinner = new Spinner('Brewing cloudflared...');
  spinner.start();

  return new Promise((resolve) => {
    const child = spawn('brew', ['install', 'cloudflared'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const messages = ['Brewing cloudflared...', 'Downloading...', 'Installing...', 'Almost ready...'];
    let msgIndex = 0;
    const updateInterval = setInterval(() => {
      spinner.update(messages[msgIndex % messages.length]);
      msgIndex++;
    }, 2000);

    child.on('close', async (code) => {
      clearInterval(updateInterval);

      if (code === 0) {
        spinner.stop('cloudflared installed successfully!', true);
        await sleep(300);
        successBanner('Tunnel ready!');
        resolve(true);
      } else {
        spinner.stop('Installation failed', false);
        console.log();
        box([
          `${c.red}Oops! Something went wrong.${c.reset}`,
          `${c.dim}Try:${c.reset} ${c.cyan}brew install cloudflared${c.reset}`,
        ], c.red);
        resolve(false);
      }
    });

    child.on('error', () => {
      clearInterval(updateInterval);
      spinner.stop('Installation failed', false);
      resolve(false);
    });
  });
}

// Install cloudflared on Linux
async function installCloudflaredLinux() {
  console.log();
  box([
    `${c.bold}${c.purple}📦 Installing cloudflared${c.reset}`,
    `${c.dim}Downloading from Cloudflare...${c.reset}`,
  ], c.purple);
  console.log();

  const spinner = new Spinner('Detecting system architecture...');
  spinner.start();

  // Detect architecture
  let arch;
  try {
    const uname = execSync('uname -m', { encoding: 'utf8' }).trim();
    if (uname === 'x86_64' || uname === 'amd64') {
      arch = 'amd64';
    } else if (uname === 'aarch64' || uname === 'arm64') {
      arch = 'arm64';
    } else if (uname.startsWith('arm')) {
      arch = 'arm';
    } else {
      arch = 'amd64'; // fallback
    }
  } catch {
    arch = 'amd64';
  }

  spinner.update(`Downloading cloudflared (${arch})...`);

  return new Promise((resolve) => {
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    const installPath = '/usr/local/bin/cloudflared';

    // Try to download and install
    const child = spawn('bash', ['-c', `
      curl -L --progress-bar "${url}" -o /tmp/cloudflared && \
      chmod +x /tmp/cloudflared && \
      sudo mv /tmp/cloudflared ${installPath}
    `], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.on('close', async (code) => {
      if (code === 0) {
        spinner.stop('cloudflared installed successfully!', true);
        await sleep(300);
        successBanner('Tunnel ready!');
        resolve(true);
      } else {
        spinner.stop('Installation failed', false);
        console.log();
        box([
          `${c.yellow}Could not auto-install cloudflared${c.reset}`,
          ``,
          `${c.dim}Try manually:${c.reset}`,
          `${c.cyan}curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch} -o cloudflared${c.reset}`,
          `${c.cyan}chmod +x cloudflared${c.reset}`,
          `${c.cyan}sudo mv cloudflared /usr/local/bin/${c.reset}`,
        ], c.yellow);
        resolve(false);
      }
    });

    child.on('error', () => {
      spinner.stop('Installation failed', false);
      resolve(false);
    });
  });
}

// Install cloudflared on Windows
async function installCloudflaredWindows() {
  console.log();
  box([
    `${c.bold}${c.purple}📦 Installing cloudflared${c.reset}`,
    `${c.dim}Downloading from Cloudflare...${c.reset}`,
  ], c.purple);
  console.log();

  const spinner = new Spinner('Downloading cloudflared...');
  spinner.start();

  return new Promise((resolve) => {
    // Use PowerShell to download and install
    const script = `
      $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
      $dest = "$env:LOCALAPPDATA\\cloudflared"
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Invoke-WebRequest -Uri $url -OutFile "$dest\\cloudflared.exe"
      $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
      if ($currentPath -notlike "*$dest*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$dest", "User")
      }
    `;

    const child = spawn('powershell', ['-Command', script], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.on('close', async (code) => {
      if (code === 0) {
        spinner.stop('cloudflared installed successfully!', true);
        await sleep(300);
        successBanner('Tunnel ready!');
        console.log();
        box([
          `${c.cyan}Note: You may need to restart your terminal${c.reset}`,
          `${c.dim}for the PATH changes to take effect.${c.reset}`,
        ], c.cyan);
        resolve(true);
      } else {
        spinner.stop('Installation failed', false);
        console.log();
        box([
          `${c.yellow}Could not auto-install cloudflared${c.reset}`,
          ``,
          `${c.dim}Download manually from:${c.reset}`,
          `${c.cyan}https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/${c.reset}`,
        ], c.yellow);
        resolve(false);
      }
    });

    child.on('error', () => {
      spinner.stop('Installation failed', false);
      resolve(false);
    });
  });
}

// Install tmux in WSL
async function installTmuxInWSL() {
  console.log();
  box([
    `${c.bold}${c.purple}📦 Installing tmux in WSL${c.reset}`,
    `${c.dim}This might take a minute...${c.reset}`,
  ], c.purple);
  console.log();

  const spinner = new Spinner('Updating package lists...');
  spinner.start();

  return new Promise((resolve) => {
    const child = spawn('wsl', ['bash', '-c', 'sudo apt update && sudo apt install -y tmux'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let dots = 0;
    const updateInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      spinner.update(`Installing tmux${'.'.repeat(dots)}${' '.repeat(3 - dots)}`);
    }, 500);

    child.on('close', async (code) => {
      clearInterval(updateInterval);

      if (code === 0) {
        spinner.stop('tmux installed successfully!', true);
        await sleep(300);
        successBanner('tmux is ready to go!');
        resolve(true);
      } else {
        spinner.stop('Installation failed', false);
        console.log();
        box([
          `${c.red}Hmm, something went wrong.${c.reset}`,
          `${c.dim}Try installing manually:${c.reset}`,
          `${c.cyan}wsl sudo apt install tmux${c.reset}`,
        ], c.red);
        resolve(false);
      }
    });

    child.on('error', () => {
      clearInterval(updateInterval);
      spinner.stop('Installation failed', false);
      resolve(false);
    });
  });
}

// Install tmux on macOS
async function installTmuxMac() {
  // Check if Homebrew is installed
  try {
    execSync('which brew', { encoding: 'utf8' });
  } catch {
    console.log();
    box([
      `${c.yellow}Homebrew not found!${c.reset}`,
      ``,
      `${c.dim}Install Homebrew first:${c.reset}`,
      `${c.cyan}/bin/bash -c "$(curl -fsSL${c.reset}`,
      `${c.cyan}  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"${c.reset}`,
      ``,
      `${c.dim}Then run:${c.reset} ${c.cyan}brew install tmux${c.reset}`,
    ], c.yellow);
    return false;
  }

  console.log();
  box([
    `${c.bold}${c.purple}🍺 Installing tmux via Homebrew${c.reset}`,
    `${c.dim}Sit back and relax...${c.reset}`,
  ], c.purple);
  console.log();

  const spinner = new Spinner('Brewing tmux...');
  spinner.start();

  return new Promise((resolve) => {
    const child = spawn('brew', ['install', 'tmux'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const messages = ['Brewing tmux...', 'Pouring ingredients...', 'Almost ready...', 'Adding final touches...'];
    let msgIndex = 0;
    const updateInterval = setInterval(() => {
      spinner.update(messages[msgIndex % messages.length]);
      msgIndex++;
    }, 2000);

    child.on('close', async (code) => {
      clearInterval(updateInterval);

      if (code === 0) {
        spinner.stop('tmux installed successfully!', true);
        await sleep(300);
        successBanner('tmux is ready to go!');
        resolve(true);
      } else {
        spinner.stop('Installation failed', false);
        console.log();
        box([
          `${c.red}Oops! Something went wrong.${c.reset}`,
          `${c.dim}Try:${c.reset} ${c.cyan}brew install tmux${c.reset}`,
        ], c.red);
        resolve(false);
      }
    });

    child.on('error', () => {
      clearInterval(updateInterval);
      spinner.stop('Installation failed', false);
      resolve(false);
    });
  });
}

// Install tmux on Linux
async function installTmuxLinux() {
  // Detect package manager
  let pm = null;
  let installCmd = null;

  try {
    execSync('which apt', { encoding: 'utf8' });
    pm = 'apt';
    installCmd = ['sudo', 'apt', 'install', '-y', 'tmux'];
  } catch {
    try {
      execSync('which dnf', { encoding: 'utf8' });
      pm = 'dnf';
      installCmd = ['sudo', 'dnf', 'install', '-y', 'tmux'];
    } catch {
      try {
        execSync('which yum', { encoding: 'utf8' });
        pm = 'yum';
        installCmd = ['sudo', 'yum', 'install', '-y', 'tmux'];
      } catch {
        try {
          execSync('which pacman', { encoding: 'utf8' });
          pm = 'pacman';
          installCmd = ['sudo', 'pacman', '-S', '--noconfirm', 'tmux'];
        } catch {
          box([
            `${c.yellow}Could not detect package manager${c.reset}`,
            `${c.dim}Please install tmux manually${c.reset}`,
          ], c.yellow);
          return false;
        }
      }
    }
  }

  console.log();
  box([
    `${c.bold}${c.purple}📦 Installing tmux via ${pm}${c.reset}`,
    `${c.dim}This might ask for your password...${c.reset}`,
  ], c.purple);
  console.log();

  return new Promise((resolve) => {
    const child = spawn(installCmd[0], installCmd.slice(1), {
      stdio: 'inherit',
    });

    child.on('close', async (code) => {
      if (code === 0) {
        await sleep(300);
        successBanner('tmux is ready to go!');
        resolve(true);
      } else {
        box([
          `${c.red}Installation failed${c.reset}`,
          `${c.dim}Try:${c.reset} ${c.cyan}${installCmd.join(' ')}${c.reset}`,
        ], c.red);
        resolve(false);
      }
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

// Main setup function
export async function runSetup() {
  console.clear();
  console.log(LOGO);
  await sleep(500);
  console.log(SETUP_WIZARD);
  await sleep(300);

  // Quick system check animation
  await progressBar('System check complete!', 1500);
  console.log();

  if (isWindows) {
    // Windows setup
    const spinner = new Spinner('Checking for WSL...');
    spinner.start();
    await sleep(800);

    const hasWSL = checkWSL();

    if (!hasWSL) {
      spinner.stop('WSL not found', false);

      console.log();
      box([
        `${c.bold}${c.yellow}WSL (Windows Subsystem for Linux)${c.reset}`,
        `${c.dim}is not installed on your system.${c.reset}`,
        ``,
        `${c.white}WSL enables powerful features like:${c.reset}`,
        `  ${c.green}●${c.reset} tmux session persistence`,
        `  ${c.green}●${c.reset} Sessions survive server restarts`,
        `  ${c.green}●${c.reset} Linux tools on Windows`,
      ], c.yellow);

      const install = await ask('Would you like to install WSL now?');

      if (install) {
        console.log();
        box([
          `${c.bold}${c.purple}🚀 Installing WSL${c.reset}`,
          `${c.dim}This requires Administrator privileges${c.reset}`,
          `${c.dim}A popup may appear asking for permission${c.reset}`,
        ], c.purple);
        console.log();

        const wslSpinner = new Spinner('Launching WSL installer...');
        wslSpinner.start();

        try {
          await sleep(1000);
          execSync('powershell -Command "Start-Process wsl -ArgumentList \'--install\' -Verb RunAs -Wait"', {
            stdio: 'inherit',
          });
          wslSpinner.stop('WSL installation initiated!', true);

          console.log();
          successBanner('WSL is installing!');

          box([
            `${c.bold}${c.cyan}🔄 RESTART REQUIRED${c.reset}`,
            ``,
            `${c.white}Please restart your computer to${c.reset}`,
            `${c.white}complete the WSL installation.${c.reset}`,
            ``,
            `${c.dim}Then run ${c.cyan}npm start${c.dim} again!${c.reset}`,
          ], c.cyan);
          console.log();

          process.exit(0);
        } catch (error) {
          wslSpinner.stop('Installation cancelled or failed', false);

          console.log();
          box([
            `${c.yellow}No worries! You can install later:${c.reset}`,
            ``,
            `${c.dim}Run PowerShell as Admin and execute:${c.reset}`,
            `${c.cyan}wsl --install${c.reset}`,
          ], c.yellow);
        }
      } else {
        box([
          `${c.dim}Skipping WSL installation${c.reset}`,
          `${c.dim}tmux features will be disabled${c.reset}`,
          ``,
          `${c.dim}You can install later with:${c.reset}`,
          `${c.cyan}wsl --install${c.reset}`,
        ], c.dim);
      }
    } else {
      spinner.stop('WSL is installed!', true);

      // Check for tmux in WSL
      const tmuxSpinner = new Spinner('Checking for tmux in WSL...');
      tmuxSpinner.start();
      await sleep(600);

      const hasTmux = checkWSLTmux();

      if (!hasTmux) {
        tmuxSpinner.stop('tmux not found in WSL', false);

        console.log();
        box([
          `${c.bold}${c.yellow}tmux is not installed in WSL${c.reset}`,
          ``,
          `${c.white}tmux enables:${c.reset}`,
          `  ${c.green}●${c.reset} Persistent terminal sessions`,
          `  ${c.green}●${c.reset} Sessions survive disconnects`,
          `  ${c.green}●${c.reset} Multiple windows & panes`,
        ], c.yellow);

        const install = await ask('Install tmux in WSL now?');

        if (install) {
          await installTmuxInWSL();
        } else {
          box([
            `${c.dim}Skipping tmux installation${c.reset}`,
            `${c.dim}Install later with:${c.reset}`,
            `${c.cyan}wsl sudo apt install tmux${c.reset}`,
          ], c.dim);
        }
      } else {
        tmuxSpinner.stop('tmux is ready! (via WSL)', true);
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS setup
    const spinner = new Spinner('Checking for tmux...');
    spinner.start();
    await sleep(800);

    const hasTmux = checkTmux();

    if (!hasTmux) {
      spinner.stop('tmux not found', false);

      console.log();
      box([
        `${c.bold}${c.yellow}tmux is not installed${c.reset}`,
        ``,
        `${c.white}tmux enables:${c.reset}`,
        `  ${c.green}●${c.reset} Persistent terminal sessions`,
        `  ${c.green}●${c.reset} Sessions survive server restarts`,
        `  ${c.green}●${c.reset} Multiple windows & panes`,
      ], c.yellow);

      const install = await ask('Install tmux via Homebrew?');

      if (install) {
        await installTmuxMac();
      } else {
        box([
          `${c.dim}Skipping tmux installation${c.reset}`,
          `${c.dim}Install later with:${c.reset}`,
          `${c.cyan}brew install tmux${c.reset}`,
        ], c.dim);
      }
    } else {
      spinner.stop('tmux is ready!', true);
    }
  } else {
    // Linux setup
    const spinner = new Spinner('Checking for tmux...');
    spinner.start();
    await sleep(800);

    const hasTmux = checkTmux();

    if (!hasTmux) {
      spinner.stop('tmux not found', false);

      console.log();
      box([
        `${c.bold}${c.yellow}tmux is not installed${c.reset}`,
        ``,
        `${c.white}tmux enables:${c.reset}`,
        `  ${c.green}●${c.reset} Persistent terminal sessions`,
        `  ${c.green}●${c.reset} Sessions survive server restarts`,
        `  ${c.green}●${c.reset} Multiple windows & panes`,
      ], c.yellow);

      const install = await ask('Install tmux now?');

      if (install) {
        await installTmuxLinux();
      } else {
        box([
          `${c.dim}Skipping tmux installation${c.reset}`,
          `${c.dim}Install later with your package manager${c.reset}`,
        ], c.dim);
      }
    } else {
      spinner.stop('tmux is ready!', true);
    }
  }

  // Check for cloudflared (tunnel provider)
  console.log();
  const cfSpinner = new Spinner('Checking for cloudflared (tunnel)...');
  cfSpinner.start();
  await sleep(600);

  const hasCloudflared = checkCloudflared();

  if (!hasCloudflared) {
    cfSpinner.stop('cloudflared not found', false);

    console.log();
    box([
      `${c.bold}${c.yellow}cloudflared is not installed${c.reset}`,
      ``,
      `${c.white}cloudflared enables:${c.reset}`,
      `  ${c.green}●${c.reset} Secure public URL for your terminal`,
      `  ${c.green}●${c.reset} No account or setup required`,
      `  ${c.green}●${c.reset} Free, no connection limits`,
    ], c.yellow);

    const install = await ask('Install cloudflared now?');

    if (install) {
      if (isWindows) {
        await installCloudflaredWindows();
      } else if (process.platform === 'darwin') {
        await installCloudflaredMac();
      } else {
        await installCloudflaredLinux();
      }
    } else {
      box([
        `${c.dim}Skipping cloudflared installation${c.reset}`,
        `${c.dim}You can still use --ngrok if you have it${c.reset}`,
        ``,
        `${c.dim}Or install later:${c.reset}`,
        isWindows
          ? `${c.cyan}https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/${c.reset}`
          : process.platform === 'darwin'
            ? `${c.cyan}brew install cloudflared${c.reset}`
            : `${c.cyan}See: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/${c.reset}`,
      ], c.dim);
    }
  } else {
    cfSpinner.stop('cloudflared is ready!', true);
  }

  // Final ready message
  console.log();
  console.log(`  ${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${c.green}${c.bold}  ✅ Setup complete! Starting Connect server...${c.reset}`);
  console.log(`  ${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();

  await sleep(500);
}
