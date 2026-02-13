# OpenClaw Project Planning

## Project Overview

OpenClaw is a personal deployment of an autonomous AI assistant built on three open-source
repositories that work together:

1. **OpenClaw** (`openclaw/openclaw`) -- The core AI assistant runtime with 16+ messaging
   channels, 40+ skills, persistent memory, browser automation, and a WebSocket gateway.
2. **ClawdBody** (`Prakshal-Jain/ClawdBody`) -- A one-click deployment platform (Next.js)
   that manages VM provisioning, integrations, and the web dashboard.
3. **ClawRouter** (`BlockRunAI/ClawRouter`) -- A smart LLM cost router that routes requests
   to the cheapest capable model across 30+ LLMs, saving ~92% on API costs.

The agent runs 24/7 on a cloud VM with persistent memory, intelligent reasoning, and the
ability to act in the real world (send emails, manage calendar, browse the web, run commands,
control smart home devices, etc.).

## Architecture

### Three-Repo Ecosystem

| Repository | Role | Technology |
|-----------|------|------------|
| **OpenClaw** | Core agent runtime, gateway, channels, skills, memory, CLI | TypeScript, Node.js, pnpm monorepo |
| **ClawdBody** | Web deployment platform, VM management, OAuth integrations | Next.js 14, Prisma, PostgreSQL |
| **ClawRouter** | LLM cost optimization, multi-model routing, x402 payments | TypeScript, viem (Ethereum) |

### High-Level Components

1. **ClawdBody (Web Platform)** -- Next.js 14 app deployed on Railway
   - User authentication via Google OAuth (NextAuth)
   - VM provisioning and lifecycle management
   - Web terminal for real-time agent interaction (xterm.js + WebSocket)
   - Integration management (Gmail, Calendar, Telegram)
   - PostgreSQL database for persistent state (Prisma ORM)

2. **OpenClaw (Agent Runtime)** -- TypeScript-based autonomous agent on Orgo VM
   - Gateway WebSocket server at `ws://localhost:18789`
   - 16+ messaging channels (Telegram, WhatsApp, Slack, Discord, etc.)
   - 40+ skills (coding, email, calendar, GitHub, browser, smart home, etc.)
   - Persistent memory system (SQLite-vec, markdown files, daily logs)
   - Pi agent runtime with tool streaming and multi-agent support
   - Native companion apps for macOS, iOS, Android

3. **ClawRouter (Cost Router)** -- OpenClaw extension for LLM optimization
   - 15-dimension local scoring engine (<1ms, zero external calls)
   - Routes simple queries to cheap/free models, complex to premium
   - 30+ models across OpenAI, Anthropic, Google, DeepSeek, xAI, Moonshot
   - x402 USDC micropayments on Base L2 (non-custodial)
   - 4 routing profiles: auto, eco, premium, free

4. **PostgreSQL Database** -- Railway-managed instance
   - User accounts and sessions
   - OAuth tokens (encrypted via AES-256-GCM)
   - VM configuration and state
   - Chat message history
   - Integration metadata

### Tech Stack

| Layer         | Technology                                      |
|---------------|-------------------------------------------------|
| Frontend      | Next.js 14, React 18, Tailwind CSS              |
| Backend       | Next.js API Routes, Prisma 5                    |
| Database      | PostgreSQL (Railway)                             |
| Auth          | NextAuth v4, Google OAuth 2.0                   |
| Terminal      | xterm.js, SSH2, WebSocket                        |
| Agent Runtime | OpenClaw (TypeScript), Pi agent, Claude API      |
| LLM Router    | ClawRouter, 30+ models, x402 micropayments       |
| VM Provider   | Orgo (managed cloud VMs)                         |
| Deployment    | Railway (nixpacks, Node.js 20)                   |

### Data Flow

```
User (Browser) --> ClawdBody (Railway) --> PostgreSQL (Railway)
                        |
                        +--> SSH/WebSocket --> OpenClaw Gateway (Orgo VM :18789)
                                                  |
                                                  +--> ClawRouter --> 30+ LLM Models
                                                  |                   (routes by complexity)
                                                  +--> Skills (40+)
                                                  |     +--> Gmail API
                                                  |     +--> Calendar API
                                                  |     +--> GitHub API
                                                  |     +--> Browser (Playwright)
                                                  |     +--> Smart Home (OpenHue)
                                                  |
                                                  +--> Memory System
                                                  |     +--> SQLite-vec (vector search)
                                                  |     +--> memory.md (long-term)
                                                  |     +--> YYYY-MM-DD.md (daily logs)
                                                  |
                                                  +--> Channels (16+)
                                                        +--> Telegram, WhatsApp, Slack
                                                        +--> Discord, Signal, iMessage
                                                        +--> WebChat, Google Chat, etc.
```

## Key Files & Directories

```
/
├── prisma/schema.prisma       # Database schema (User, VM, Integration, etc.)
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── api/               # API routes (auth, integrations, VM management)
│   │   ├── dashboard/         # Main dashboard UI
│   │   ├── learning-sources/  # Integration management (Gmail, Calendar)
│   │   ├── select-vm/         # VM provider selection
│   │   ├── welcome/           # Onboarding flow
│   │   └── templates/         # Agent template marketplace
│   ├── components/            # Reusable React components
│   ├── lib/                   # Shared utilities and helpers
│   └── types/                 # TypeScript type definitions
├── railway.toml               # Railway deployment configuration
├── install-clawdbot.sh        # Agent installation script for VMs
├── ralph_wiggum.py            # Python agent management script
└── CLAWDBOT_COMMUNICATION.md  # Communication API documentation
```

## Environment Variables

### Required
- `POSTGRES_PRISMA_URL` -- PostgreSQL connection string (pooled)
- `POSTGRES_URL_NON_POOLING` -- PostgreSQL direct connection (for migrations)
- `NEXTAUTH_SECRET` -- Session encryption key
- `NEXTAUTH_URL` -- App base URL
- `GOOGLE_CLIENT_ID` -- Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` -- Google OAuth client secret

### Optional
- `ORGO_API_KEY` -- Orgo VM provider API key
- `GOOGLE_REDIRECT_URI` -- Gmail/Calendar OAuth callback URL
- `CRON_SECRET` -- Cron endpoint protection
- `TELEGRAM_BOT_TOKEN` -- Telegram bot integration
- `TELEGRAM_USER_ID` -- Telegram user ID for bot access
- `ELEVENLABS_API_KEY` -- Text-to-speech via ElevenLabs

## Security Considerations

1. **Access Control** -- The Railway URL should be kept private; Google OAuth does not
   restrict sign-up by default
2. **Agent Isolation** -- ClawdBot runs in a sandboxed Orgo VM, separate from personal systems
3. **Execution Approval** -- Shell commands require explicit `/approve` before execution
4. **Token Encryption** -- OAuth tokens are encrypted in the database
5. **Memory Safety** -- Agent memory files are plain text; protect the VM from unauthorized access

## Naming Conventions

- **Files**: kebab-case for filenames (e.g., `install-clawdbot.sh`)
- **Components**: PascalCase for React components
- **Variables**: camelCase for JS/TS variables, SCREAMING_SNAKE_CASE for env vars
- **Database**: PascalCase for Prisma models, camelCase for fields

## Deployment

- **Platform**: Railway (Pro plan, $20/month for no timeout limits)
- **Build**: nixpacks with Node.js 20
- **Database**: Railway PostgreSQL plugin with persistent volume
- **Domain**: `clawdbody-app-production.up.railway.app`

## VM Setup Scripts

Located in `scripts/`:
- `setup-clawrouter.sh` -- Installs ClawRouter extension, configures routing profile
- `enable-all-skills.sh` -- Enables all 40+ OpenClaw skills

Run these via the ClawdBody web terminal after the Orgo VM is provisioned.

## Source Repositories

- **OpenClaw Core**: https://github.com/openclaw/openclaw
- **ClawdBody**: https://github.com/Prakshal-Jain/ClawdBody (fork: Flufscut/ClawdBody)
- **ClawRouter**: https://github.com/BlockRunAI/ClawRouter
