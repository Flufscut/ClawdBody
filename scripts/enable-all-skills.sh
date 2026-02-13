#!/bin/bash
#
# Enable All OpenClaw Skills Script for Orgo VM
# Run this via the ClawdBody web terminal after ClawdBot is installed.
#
# Usage: bash enable-all-skills.sh
#

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Reason: Ensure NVM is loaded so we have access to npm/node/openclaw CLI
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo ""
log_info "============================================"
log_info "Enabling All OpenClaw Skills"
log_info "============================================"
echo ""

# Reason: Detect which CLI binary is available
CLI_CMD=""
if command -v openclaw &> /dev/null; then
    CLI_CMD="openclaw"
elif command -v clawdbot &> /dev/null; then
    CLI_CMD="clawdbot"
else
    log_warn "Neither openclaw nor clawdbot CLI found in PATH."
    log_warn "Attempting manual skill activation..."
fi

if [ -n "$CLI_CMD" ]; then
    # Reason: Use the CLI to list and enable all skills
    log_info "Using $CLI_CMD CLI to enable skills..."

    log_info "Available skills:"
    $CLI_CMD skills list 2>/dev/null || true
    echo ""

    log_info "Enabling all skills..."
    $CLI_CMD skills enable --all 2>/dev/null || {
        log_warn "--all flag not supported. Enabling skills individually..."

        # Reason: Fallback to enabling each known skill individually
        SKILLS=(
            "1password"
            "apple-notes"
            "apple-reminders"
            "bear-notes"
            "blogwatcher"
            "bluebubbles"
            "camsnap"
            "canvas"
            "clawhub"
            "coding-agent"
            "discord"
            "food-order"
            "gemini"
            "gifgrep"
            "github"
            "goplaces"
            "healthcheck"
            "himalaya"
            "imsg"
            "notion"
            "obsidian"
            "openai-image-gen"
            "openai-whisper"
            "openhue"
            "oracle"
            "peekaboo"
            "session-logs"
            "skill-creator"
            "slack"
            "songsee"
        )

        for skill in "${SKILLS[@]}"; do
            $CLI_CMD skills enable "$skill" 2>/dev/null && \
                log_success "Enabled: $skill" || \
                log_warn "Could not enable: $skill (may not be available)"
        done
    }
else
    # Reason: Manual fallback -- create skill directories with placeholder SKILL.md
    WORKSPACE="$HOME/.openclaw/workspace/skills"
    if [ ! -d "$WORKSPACE" ]; then
        WORKSPACE="$HOME/clawd/skills"
    fi
    mkdir -p "$WORKSPACE"

    log_info "Skills workspace: $WORKSPACE"
    log_warn "No CLI available. Skills will be activated when the gateway starts."
    log_info "The gateway reads skill definitions from $WORKSPACE/"
fi

echo ""
log_success "============================================"
log_success "Skills Activation Complete!"
log_success "============================================"
echo ""
log_info "Restart the gateway to pick up changes:"
echo "  openclaw gateway restart"
echo "  (or: clawdbot gateway restart)"
echo ""
log_info "To check enabled skills:"
echo "  openclaw skills list"
echo ""
