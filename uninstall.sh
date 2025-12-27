#!/bin/bash

# Remote Terminal Uninstaller

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="$HOME/.remote-terminal"

echo ""
echo -e "${BLUE}Uninstalling Remote Terminal...${NC}"
echo ""

# Remove symlink
if [[ -L /usr/local/bin/remote-terminal ]]; then
    sudo rm /usr/local/bin/remote-terminal
    echo -e "${GREEN}✓ Removed command symlink${NC}"
fi

# Remove installation directory
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Removed installation directory${NC}"
fi

echo ""
echo -e "${GREEN}Remote Terminal has been uninstalled.${NC}"
echo ""
