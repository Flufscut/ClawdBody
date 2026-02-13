#!/bin/bash
#
# ClawRouter Setup Script for Orgo VM
# Run this via the ClawdBody web terminal after ClawdBot is installed.
#
# Usage: bash setup-clawrouter.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
log_info "============================================"
log_info "ClawRouter Setup for OpenClaw"
log_info "============================================"
echo ""

# Reason: Ensure NVM is loaded so we have access to npm/node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Step 1: Verify OpenClaw/ClawdBot is installed
log_info "Step 1: Verifying ClawdBot installation..."
if command -v clawdbot &> /dev/null || command -v openclaw &> /dev/null; then
    log_success "ClawdBot/OpenClaw CLI found"
else
    log_error "ClawdBot/OpenClaw CLI not found. Please install ClawdBot first."
    exit 1
fi

# Step 2: Install ClawRouter as an OpenClaw extension
log_info "Step 2: Installing ClawRouter extension..."
EXTENSIONS_DIR="$HOME/.openclaw/extensions"
if [ ! -d "$EXTENSIONS_DIR" ]; then
    # Reason: Try alternate path used by older ClawdBot versions
    EXTENSIONS_DIR="$HOME/.clawdbot/extensions"
fi
mkdir -p "$EXTENSIONS_DIR/clawrouter"
cd "$EXTENSIONS_DIR/clawrouter"

# Reason: Initialize npm package and install ClawRouter
npm init -y > /dev/null 2>&1
npm install @blockrun/clawrouter@latest 2>&1
log_success "ClawRouter installed at $EXTENSIONS_DIR/clawrouter"

# Step 3: Configure ClawRouter in OpenClaw config
log_info "Step 3: Configuring ClawRouter..."

# Reason: Detect which config file exists (openclaw.json or clawdbot.json)
CONFIG_FILE=""
if [ -f "$HOME/.openclaw/openclaw.json" ]; then
    CONFIG_FILE="$HOME/.openclaw/openclaw.json"
elif [ -f "$HOME/.clawdbot/clawdbot.json" ]; then
    CONFIG_FILE="$HOME/.clawdbot/clawdbot.json"
else
    log_warn "No config file found. ClawRouter will use defaults."
    log_info "You can manually add ClawRouter config later."
fi

if [ -n "$CONFIG_FILE" ]; then
    # Reason: Check if jq is available for JSON manipulation
    if command -v jq &> /dev/null; then
        # Reason: Add ClawRouter extension config to existing config using jq
        TEMP_FILE=$(mktemp)
        jq '. + {"extensions": (.extensions // {} | . + {"clawrouter": {"enabled": true, "routing": {"profile": "auto"}}})}' "$CONFIG_FILE" > "$TEMP_FILE"
        mv "$TEMP_FILE" "$CONFIG_FILE"
        log_success "ClawRouter configured in $CONFIG_FILE with 'auto' routing profile"
    else
        log_warn "jq not installed. Please manually add ClawRouter config to $CONFIG_FILE"
        log_info "Add this to your config:"
        echo '  "extensions": { "clawrouter": { "enabled": true, "routing": { "profile": "auto" } } }'
    fi
fi

# Step 4: Display wallet info
log_info "Step 4: Wallet setup..."
WALLET_FILE="$HOME/.openclaw/blockrun/wallet.key"
if [ -f "$WALLET_FILE" ]; then
    log_success "Wallet already exists at $WALLET_FILE"
else
    log_info "A wallet will be auto-generated when ClawRouter first processes a request."
    log_info "Wallet location: $WALLET_FILE"
fi

echo ""
log_success "============================================"
log_success "ClawRouter Setup Complete!"
log_success "============================================"
echo ""
log_info "Next steps:"
echo "  1. Restart the gateway: openclaw gateway restart (or clawdbot gateway restart)"
echo "  2. Fund your wallet with USDC on Base L2"
echo "     - Run /wallet in the agent chat to get your address"
echo "     - Send USDC (Base L2) to that address"
echo "     - Even \$5-10 goes a long way (~92% savings)"
echo "  3. Test routing: ask a simple and complex question"
echo "  4. Check stats: run /stats in the agent chat"
echo ""
log_info "Routing profiles (change in config):"
echo "  auto    - Balanced cost/quality (default)"
echo "  eco     - Maximum savings"
echo "  premium - Best quality"
echo "  free    - Zero cost (uses gpt-oss-120b)"
echo ""
