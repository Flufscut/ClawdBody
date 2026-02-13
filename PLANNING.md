# OpenClaw Project Planning

## Project Overview

OpenClaw is a personal deployment of ClawdBody -- a one-click deployment platform for ClawdBot,
an autonomous AI agent built on the OpenClaw framework. The agent runs 24/7 on a cloud VM with
persistent memory, intelligent reasoning (via Claude API), and the ability to act in the real
world (send emails, manage calendar, browse the web, run commands, etc.).

## Architecture

### High-Level Components

1. **ClawdBody (Web Platform)** -- Next.js 14 app deployed on Railway
   - User authentication via Google OAuth (NextAuth)
   - VM provisioning and lifecycle management
   - Web terminal for real-time agent interaction (xterm.js + WebSocket)
   - Integration management (Gmail, Calendar, Telegram)
   - PostgreSQL database for persistent state (Prisma ORM)

2. **ClawdBot (AI Agent)** -- Python-based autonomous agent running on Orgo VM
   - Claude API for reasoning and task execution
   - Persistent memory system (markdown files + daily logs)
   - Communication helper scripts (email, calendar)
   - Sandboxed execution environment

3. **PostgreSQL Database** -- Railway-managed instance
   - User accounts and sessions
   - OAuth tokens (encrypted)
   - VM configuration and state
   - Chat message history
   - Integration metadata

### Tech Stack

| Layer         | Technology                              |
|---------------|----------------------------------------|
| Frontend      | Next.js 14, React 18, Tailwind CSS     |
| Backend       | Next.js API Routes, Prisma 5           |
| Database      | PostgreSQL (Railway)                    |
| Auth          | NextAuth v4, Google OAuth 2.0          |
| Terminal      | xterm.js, SSH2, WebSocket              |
| Agent         | Python, Claude API (Anthropic)         |
| VM Provider   | Orgo (managed cloud VMs)               |
| Deployment    | Railway (nixpacks, Node.js 20)         |

### Data Flow

```
User (Browser) --> ClawdBody (Railway) --> PostgreSQL (Railway)
                        |
                        +--> SSH/WebSocket --> ClawdBot Agent (Orgo VM)
                                                  |
                                                  +--> Claude API (Anthropic)
                                                  +--> Gmail API (Google)
                                                  +--> Calendar API (Google)
                                                  +--> Memory Files (local disk)
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
