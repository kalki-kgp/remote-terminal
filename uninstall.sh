#!/bin/bash

# Connect Uninstaller

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="$HOME/.connect"
PLIST="$HOME/Library/LaunchAgents/com.connect.plist"

echo ""
echo -e "${BLUE}Uninstalling Connect...${NC}"
echo ""

# Stop daemon if running
if [[ -f "$PLIST" ]]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm "$PLIST"
    echo -e "${GREEN}✓ Removed LaunchAgent${NC}"
fi

# Kill any running processes
pkill -f "node.*connect" 2>/dev/null || true

# Remove command symlinks
if [[ -L /usr/local/bin/connect ]]; then
    sudo rm /usr/local/bin/connect
    echo -e "${GREEN}✓ Removed connect command${NC}"
fi

if [[ -L /usr/local/bin/connect-ctl ]]; then
    sudo rm /usr/local/bin/connect-ctl
    echo -e "${GREEN}✓ Removed connect-ctl command${NC}"
fi

# Remove installation directory
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Removed installation directory${NC}"
fi

echo ""
echo -e "${GREEN}Connect has been uninstalled.${NC}"
echo ""
