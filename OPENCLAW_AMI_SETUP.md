# OpenClaw AMI setup and VM flow

This doc covers:

1. **What runs on AWS VMs in this app** (default AMI vs custom/OpenClaw AMI).
2. **Post-install steps** after running `install_openclaw_ami.sh` (Docker, config, **starting the gateway**).
3. **How the app code supports OpenClaw AMIs** (verify → configure → start gateway).

References: [OpenClaw docs](https://docs.openclaw.ai/llms-full.txt), [Gateway CLI](https://docs.openclaw.ai/cli/gateway).

---

## 1. What this app does on AWS VMs

When users provision an AWS VM through this app, the following steps run (see `src/lib/aws-setup-process.ts` and `src/lib/aws-vm-setup.ts`).

### Default AMI (no custom AMI)

1. **Wait for VM** – SSH readiness and cloud-init.
2. **Install Python and tools** – `apt-get install` python3, pip, git, openssh-client, procps, curl.
3. **Install Anthropic SDK** – `pip3 install anthropic langchain-anthropic requests Pillow`.
4. **Install Clawdbot** – NVM → Node.js 22 → `npm install -g clawdbot@latest`.
5. **Configure** – `setupClawdbotTelegram()`: creates `~/.clawdbot/clawdbot.json`, `~/clawd/CLAUDE.md`, env in `~/.bashrc`.
6. **Start gateway** – `startClawdbotGateway()`: runs `clawdbot gateway run` in background (port 18789), logs to `/tmp/clawdbot.log`.

So on a **default** AMI, the app installs **Clawdbot** (npm) and then configures and starts the gateway.

### Custom AMI with OpenClaw (`CLAWDBODY_AWS_CUSTOM_AMI_ID` + `CLAWDBODY_AWS_OPENCLAW_AMI=1`)

When both env vars are set, the app treats the custom AMI as an **OpenClaw (openclaw.ai)** AMI:

1. **Skip installation** – OpenClaw and Docker are expected to be pre-installed (e.g. via `install_openclaw_ami.sh` and post-install steps).
2. **Verify** – `verifyOpenClawInstalled()`: checks for OpenClaw repo (e.g. `~/openclaw`), Docker, and `docker compose`.
3. **Configure** – `setupOpenClawTelegram()`: writes `~/.openclaw/openclaw.json` (agents, channels.telegram, gateway), creates `~/openclaw/.env` (gateway token, bind, port), and ensures `~/.openclaw/workspace` exists.
4. **Start gateway** – `startOpenClawGateway()`: runs `docker compose up -d` from the OpenClaw repo; gateway listens on port 18789 (mapped from container).

SSH user for OpenClaw AMI is **ubuntu** (typical for Ubuntu-based AMI where `install_openclaw_ami.sh` was run).

### Custom AMI with Clawdbot only (`CLAWDBODY_AWS_CUSTOM_AMI_ID`, no `OPENCLAW_AMI`)

If only the custom AMI ID is set and **not** `CLAWDBODY_AWS_OPENCLAW_AMI`:

1. **Skip installation** – Clawdbot (NVM + global `clawdbot`) is expected on the AMI.
2. **Verify** – `verifyClawdbotInstalled()`.
3. **Configure** – `setupClawdbotTelegram()`.
4. **Start gateway** – `startClawdbotGateway()`.

SSH user is **ec2-user** (Amazon Linux style).

---

## 2. Post-install steps after `install_openclaw_ami.sh`

After running `install_openclaw_ami.sh` on an AWS VM (e.g. Ubuntu), use these steps to prepare a **Docker-based OpenClaw** AMI. The installer clones the repo to `~/openclaw` (e.g. `/home/ubuntu/openclaw`).

### 2.1 Install Docker on the VM

```bash
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Log out and back in, or: newgrp docker
```

### 2.2 Create persistent host directories

Config and workspace live on the host and are mounted into the container (survive restarts and are part of the AMI).

```bash
mkdir -p ~/.openclaw ~/.openclaw/workspace
# If using root later: sudo mkdir -p /root/.openclaw /root/.openclaw/workspace && sudo chown -R 1000:1000 /root/.openclaw
```

For Ubuntu user `ubuntu`: `~` = `/home/ubuntu`, so paths are `/home/ubuntu/.openclaw` and `/home/ubuntu/.openclaw/workspace`.

### 2.3 Configure environment (OpenClaw repo `.env`)

Create `.env` in the OpenClaw repo root (e.g. `~/openclaw/.env`). **Do not commit this file.**

```bash
cd ~/openclaw
cat > .env << 'ENVEOF'
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_CONFIG_DIR=$HOME/.openclaw
OPENCLAW_WORKSPACE_DIR=$HOME/.openclaw/workspace
GOG_KEYRING_PASSWORD=$(openssl rand -hex 32)
XDG_CONFIG_HOME=/home/node/.openclaw
ENVEOF
```

Replace the two `$(openssl rand -hex 32)` with actual values (run the commands and paste), or the app will inject token and paths when it configures the VM.

### 2.4 Dockerfile and Docker Compose

- **Dockerfile**: Install any required binaries (e.g. `gog`, `wacli`) in the image for AMI consistency.
- **docker-compose.yml**: Define the gateway service with:
  - `image` / `build` from `.env`
  - `env_file: .env` and required env vars
  - Volume mounts: `OPENCLAW_CONFIG_DIR` → `/home/node/.openclaw`, `OPENCLAW_WORKSPACE_DIR` → `/home/node/.openclaw/workspace`
  - Port: `127.0.0.1:${OPENCLAW_GATEWAY_PORT}:18789`
  - Command: `node dist/index.js gateway --bind ${OPENCLAW_GATEWAY_BIND} --port 18789` (or equivalent; see OpenClaw gateway docs)

### 2.5 Build the image (on the VM, before creating the AMI)

```bash
cd ~/openclaw
docker compose build
```

### 2.6 Start the gateway

After config and build, start the gateway (e.g. for a one-time onboarding or for the AMI to be “ready”):

```bash
cd ~/openclaw
docker compose up -d
```

- Gateway listens on **port 18789** (host). To access from your machine:  
  `ssh -N -L 18789:127.0.0.1:18789 ubuntu@<AWS_VM_IP>`
- Open https://docs.openclaw.ai/cli/gateway for auth (token from `OPENCLAW_GATEWAY_TOKEN` or `gateway.auth.token` in `~/.openclaw/openclaw.json`).
- Optional: channel login, e.g.  
  `docker compose exec openclaw openclaw channels login --channel telegram`

To stop (if the AMI should not auto-start the gateway):

```bash
docker compose down
```

### 2.7 Optional: first-run onboarding

For a working AMI you may start the gateway once to create default config and complete channel logins, then stop it:

```bash
docker compose up -d
# SSH tunnel, then open http://127.0.0.1:18789/ and paste OPENCLAW_GATEWAY_TOKEN
# e.g.: docker compose exec openclaw openclaw channels login --channel telegram
docker compose down
```

---

## 3. How the app supports OpenClaw AMI (code)

When `CLAWDBODY_AWS_CUSTOM_AMI_ID` and `CLAWDBODY_AWS_OPENCLAW_AMI=1` are set:

| Step        | Function                     | What it does |
|------------|------------------------------|--------------|
| Verify     | `verifyOpenClawInstalled()`  | Checks `~/openclaw` exists, `docker` and `docker compose` available. |
| Configure  | `setupOpenClawTelegram()`    | Writes `~/.openclaw/openclaw.json` (agents.defaults, channels.telegram, gateway.mode=local, gateway.auth.token), creates `~/.openclaw/workspace`, writes `~/openclaw/.env` with token and paths. |
| Start      | `startOpenClawGateway()`     | `cd ~/openclaw && docker compose up -d`, then verifies port 18789 is listening. |

- **SSH user** for OpenClaw AMI is **ubuntu** (set in `aws-vm-setup.ts` when `CLAWDBODY_AWS_OPENCLAW_AMI` is set).
- Config format follows [OpenClaw docs](https://docs.openclaw.ai): `~/.openclaw/openclaw.json` with `gateway.mode: "local"`, `gateway.auth.token`, `channels.telegram`, `agents.defaults.workspace` and heartbeat.

---

## Summary

| Flow | When | What runs |
|------|------|-----------|
| **Default AMI** | New VM from stock AMI | Install Python → Clawdbot (NVM + npm) → config → start gateway (`clawdbot gateway run`) |
| **Custom AMI (OpenClaw)** | New VM from `CLAWDBODY_AWS_CUSTOM_AMI_ID` with `CLAWDBODY_AWS_OPENCLAW_AMI=1` | Verify OpenClaw + Docker → config `~/.openclaw/openclaw.json` + `.env` → start gateway (`docker compose up -d`) |
| **Custom AMI (Clawdbot)** | New VM from `CLAWDBODY_AWS_CUSTOM_AMI_ID` only | Verify Clawdbot → config → start gateway (`clawdbot gateway run`) |
| **Manual (AMI build)** | After `install_openclaw_ami.sh` | Docker, dirs, `.env`, Dockerfile, compose, build; **start gateway**: `docker compose up -d` |

Use `install_openclaw_ami.sh` when building an AMI that will have OpenClaw (openclaw.ai) installed; use the post-install steps above to make that AMI Docker-based and ready for gateway runs.

**Environment variables (app server):**

- `CLAWDBODY_AWS_CUSTOM_AMI_ID` – custom AMI ID to launch (skip install on VM).
- `CLAWDBODY_AWS_OPENCLAW_AMI=1` – treat that custom AMI as OpenClaw (Ubuntu, Docker): use `ubuntu` for SSH, verify OpenClaw + Docker, configure `~/.openclaw/openclaw.json` and `~/openclaw/.env`, start gateway with `docker compose up -d`. If unset, the custom AMI is treated as Clawdbot (ec2-user, `clawdbot` npm, `clawdbot gateway run`).
