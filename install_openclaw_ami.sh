#!/bin/bash
# Install OpenClaw on an AWS VM for AMI creation.
# Does not start the gateway. See OPENCLAW_AMI_SETUP.md for post-install steps.
set -euo pipefail

echo "=== OpenClaw AMI install (no gateway start) ==="

# Update package lists
sudo apt-get update -y

# Install essential tools if not present
sudo apt-get install -y curl git bash

# Pre-install Node.js 22 and pnpm so the OpenClaw installer finds them (avoids "pnpm: command not found")
if ! command -v node &>/dev/null || [[ $(node -v 2>/dev/null) != v22* ]]; then
  echo "Installing Node.js 22 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# Ensure pnpm is available (OpenClaw install script expects it; Corepack in the installer's subshell often isn't on PATH)
if ! command -v pnpm &>/dev/null; then
  echo "Enabling Corepack and pnpm..."
  sudo corepack enable
  sudo corepack prepare pnpm@latest --activate
fi
echo "pnpm: $(pnpm -v)"

# Install OpenClaw CLI and dependencies (git method, non-interactive, no onboarding)
echo "Installing OpenClaw using the git method (non-interactive, no onboarding)..."
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method git --no-onboard --no-prompt

echo "OpenClaw installation completed. Gateway was not started."
echo "Next: see OPENCLAW_AMI_SETUP.md for Docker, persistent storage, and AMI steps."
