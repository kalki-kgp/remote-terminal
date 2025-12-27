#!/bin/bash

# Remote Terminal Installer for macOS (M Series)
# This script installs the remote-terminal application

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installation directory
INSTALL_DIR="$HOME/.remote-terminal"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           🖥️  Remote Terminal Installer                    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This installer is for macOS only.${NC}"
    exit 1
fi

# Check for M series chip
CHIP=$(uname -m)
if [[ "$CHIP" != "arm64" ]]; then
    echo -e "${YELLOW}Warning: This installer is optimized for Apple Silicon (M series).${NC}"
    echo -e "${YELLOW}Detected architecture: $CHIP${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for Node.js
echo -e "${BLUE}Checking for Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing via Homebrew...${NC}"

    # Check for Homebrew
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}Error: Homebrew is not installed.${NC}"
        echo "Please install Homebrew first: https://brew.sh"
        exit 1
    fi

    brew install node
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"

# Check Node version (need 18+)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
if [[ $NODE_MAJOR -lt 18 ]]; then
    echo -e "${RED}Error: Node.js 18 or higher is required. Found: $NODE_VERSION${NC}"
    echo "Please upgrade Node.js: brew upgrade node"
    exit 1
fi

# Create installation directory
echo -e "${BLUE}Creating installation directory...${NC}"
mkdir -p "$INSTALL_DIR"

# Copy files
echo -e "${BLUE}Installing remote-terminal...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp -r "$SCRIPT_DIR/src" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/public" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
cd "$INSTALL_DIR"
npm install --silent

# Fix node-pty spawn-helper permissions (required for PTY to work)
echo -e "${BLUE}Fixing permissions...${NC}"
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    chmod +x "$INSTALL_DIR/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" 2>/dev/null || true
else
    chmod +x "$INSTALL_DIR/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper" 2>/dev/null || true
fi

# Create launcher script
echo -e "${BLUE}Creating launcher script...${NC}"
cat > "$INSTALL_DIR/remote-terminal" << 'EOF'
#!/bin/bash

# Remote Terminal Launcher

INSTALL_DIR="$HOME/.remote-terminal"

# Parse arguments
TUNNEL="ngrok"
while [[ $# -gt 0 ]]; do
    case $1 in
        --cloudflare)
            TUNNEL="cloudflare"
            shift
            ;;
        --ngrok-token)
            export NGROK_AUTHTOKEN="$2"
            shift 2
            ;;
        --port)
            export PORT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: remote-terminal [options]"
            echo ""
            echo "Options:"
            echo "  --cloudflare      Use Cloudflare Tunnel instead of ngrok"
            echo "  --ngrok-token     Set ngrok auth token"
            echo "  --port PORT       Set local port (default: 3000)"
            echo "  -h, --help        Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

export TUNNEL="$TUNNEL"

cd "$INSTALL_DIR"
node src/server.js
EOF

chmod +x "$INSTALL_DIR/remote-terminal"

# Create symlink in /usr/local/bin
echo -e "${BLUE}Creating command symlink...${NC}"
sudo mkdir -p /usr/local/bin
sudo ln -sf "$INSTALL_DIR/remote-terminal" /usr/local/bin/remote-terminal

# Optional: Install cloudflared for Cloudflare Tunnel support
echo ""
read -p "Install cloudflared for Cloudflare Tunnel support? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Installing cloudflared...${NC}"
    brew install cloudflared
    echo -e "${GREEN}✓ cloudflared installed${NC}"
fi

# Optional: Setup auto-start on boot
echo ""
read -p "Enable auto-start on boot (LaunchAgent)? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Setting up LaunchAgent...${NC}"

    # Create logs directory
    mkdir -p "$INSTALL_DIR/logs"

    # Find node path
    NODE_PATH=$(which node)

    # Copy and configure plist
    PLIST_SRC="$SCRIPT_DIR/scripts/com.remote-terminal.plist"
    PLIST_DEST="$HOME/Library/LaunchAgents/com.remote-terminal.plist"

    if [[ -f "$PLIST_SRC" ]]; then
        # Replace placeholders
        sed -e "s|INSTALL_PATH|$INSTALL_DIR|g" \
            -e "s|HOME_PATH|$HOME|g" \
            -e "s|/usr/local/bin/node|$NODE_PATH|g" \
            "$PLIST_SRC" > "$PLIST_DEST"

        # Load the LaunchAgent
        launchctl unload "$PLIST_DEST" 2>/dev/null || true
        launchctl load "$PLIST_DEST"

        echo -e "${GREEN}✓ LaunchAgent installed and loaded${NC}"
        echo -e "${YELLOW}  Server will start automatically on login${NC}"
        echo -e "${YELLOW}  Logs: $INSTALL_DIR/logs/${NC}"
    else
        echo -e "${RED}Warning: LaunchAgent plist not found${NC}"
    fi
fi

# Create daemon control script
cat > "$INSTALL_DIR/remote-terminal-ctl" << 'CTLEOF'
#!/bin/bash

# Remote Terminal Control Script

PLIST="$HOME/Library/LaunchAgents/com.remote-terminal.plist"
INSTALL_DIR="$HOME/.remote-terminal"

case "$1" in
    start)
        if [[ -f "$PLIST" ]]; then
            launchctl load "$PLIST" 2>/dev/null
            echo "Remote Terminal started (daemon mode)"
        else
            echo "LaunchAgent not installed. Run: remote-terminal"
        fi
        ;;
    stop)
        if [[ -f "$PLIST" ]]; then
            launchctl unload "$PLIST" 2>/dev/null
            echo "Remote Terminal stopped"
        else
            pkill -f "node.*remote-terminal" 2>/dev/null
            echo "Remote Terminal stopped"
        fi
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        if pgrep -f "node.*remote-terminal" > /dev/null; then
            echo "Remote Terminal is running"
            pgrep -f "node.*remote-terminal"
        else
            echo "Remote Terminal is not running"
        fi
        ;;
    logs)
        if [[ -f "$INSTALL_DIR/logs/stdout.log" ]]; then
            tail -f "$INSTALL_DIR/logs/stdout.log" "$INSTALL_DIR/logs/stderr.log"
        else
            echo "No logs found. Server may not be running as daemon."
        fi
        ;;
    enable)
        if [[ -f "$PLIST" ]]; then
            launchctl load "$PLIST"
            echo "Auto-start enabled"
        else
            echo "LaunchAgent not installed. Re-run install.sh"
        fi
        ;;
    disable)
        if [[ -f "$PLIST" ]]; then
            launchctl unload "$PLIST"
            echo "Auto-start disabled"
        fi
        ;;
    *)
        echo "Usage: remote-terminal-ctl {start|stop|restart|status|logs|enable|disable}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the server (daemon mode)"
        echo "  stop     - Stop the server"
        echo "  restart  - Restart the server"
        echo "  status   - Check if server is running"
        echo "  logs     - Tail the server logs"
        echo "  enable   - Enable auto-start on login"
        echo "  disable  - Disable auto-start on login"
        exit 1
        ;;
esac
CTLEOF

chmod +x "$INSTALL_DIR/remote-terminal-ctl"
sudo ln -sf "$INSTALL_DIR/remote-terminal-ctl" /usr/local/bin/remote-terminal-ctl

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ Installation Complete!                        ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║  To start the remote terminal server:                     ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║    remote-terminal          (foreground)                  ║${NC}"
echo -e "${GREEN}║    remote-terminal-ctl start (daemon)                     ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║  Daemon control:                                          ║${NC}"
echo -e "${GREEN}║    remote-terminal-ctl status|stop|restart|logs           ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║  Options:                                                 ║${NC}"
echo -e "${GREEN}║    --cloudflare     Use Cloudflare Tunnel                 ║${NC}"
echo -e "${GREEN}║    --ngrok-token    Set ngrok auth token                  ║${NC}"
echo -e "${GREEN}║    --port PORT      Set local port                        ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
