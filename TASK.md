# OpenClaw Task Tracker

## Current Sprint

### Completed Tasks

- [x] **Fork ClawdBody repository** (2025-02-13)
  - Forked `Prakshal-Jain/ClawdBody` to `Flufscut/ClawdBody`
  - Cloned locally to `/Users/petemcgraw/Desktop/OpenClaw`

- [x] **Create Railway project** (2025-02-13)
  - Project: "OpenClaw" (ID: `cda577ca-ad7f-46ed-aeaa-a48614d0591a`)
  - PostgreSQL database deployed with persistent volume
  - ClawdBody app service linked to GitHub fork

- [x] **Generate deployment secrets** (2025-02-13)
  - NextAuth session secret generated and set
  - Cron endpoint secret generated and set

- [x] **Configure Railway environment variables** (2025-02-13)
  - Database URLs (POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL)
  - NEXTAUTH_SECRET, NEXTAUTH_URL
  - CRON_SECRET
  - GOOGLE_REDIRECT_URI

- [x] **Generate Railway domain** (2025-02-13)
  - Domain: `clawdbody-app-production.up.railway.app`

- [x] **Set Google OAuth credentials** (2026-02-13)
  - Created Google Cloud project with Gmail API and Calendar API enabled
  - Configured OAuth consent screen and credentials
  - Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Railway

- [x] **Fix build issues** (2026-02-13)
  - Moved prisma db push from build to start command (Railway internal network issue)
  - Fixed Stripe client lazy initialization (missing env var at build time)
  - Both fixes pushed to fork and deployed successfully

- [x] **Prepare persona templates** (2026-02-13)
  - Created persona/ directory with SOUL.md, IDENTITY.md, USER.md, TOOLS.md
  - Ready to be copied to VM once provisioned

- [x] **Create security documentation** (2026-02-13)
  - SECURITY.md with access control, exec approval, skill management guidance

- [x] **Complete web UI setup** (2026-02-13)
  - Signed in with Google OAuth
  - Entered Claude API key and Orgo API key
  - VM provisioning initiated via Orgo
  - Enabled Gmail and Calendar connect buttons (upstream had them disabled)

- [x] **Enable Gmail/Calendar integration buttons** (2026-02-13)
  - Upstream repo had `available: false` for all connectors
  - Flipped Gmail and Calendar to `available: true` in learning-sources page
  - Pushed fix to fork and redeployed

- [x] **Add encryption keys** (2026-02-13)
  - Generated ENCRYPTION_KEY and USER_DATA_ENCRYPTION_KEY
  - Set in Railway for AES-256-GCM encryption of API keys and user PII

### In Progress

- [ ] **Install ClawRouter on Orgo VM** (2026-02-13)
  - Created `scripts/setup-clawrouter.sh` for VM execution
  - Configures auto routing profile and USDC wallet
  - Run via web terminal once VM is fully provisioned

- [ ] **Enable all OpenClaw skills** (2026-02-13)
  - Created `scripts/enable-all-skills.sh` for VM execution
  - Enables 40+ bundled skills (coding, email, calendar, GitHub, browser, etc.)
  - Run via web terminal after ClawRouter setup

- [ ] **Fund ClawRouter USDC wallet**
  - Wallet auto-generated at `~/.openclaw/blockrun/wallet.key`
  - Send USDC (Base L2) to wallet address
  - $5-10 provides substantial runway at ~92% savings

### Pending Tasks

- [ ] **Deploy persona files to VM**
  - Copy persona/ templates to /home/user/clawd/ on the Orgo VM
  - Customize USER.md with personal details

- [ ] **Verify full stack operation**
  - Test ClawRouter cost routing (simple vs complex queries)
  - Test skills (GitHub, email, calendar, web browsing)
  - Test memory persistence across sessions
  - Run /stats to check cost breakdown

- [ ] **Optional integrations**
  - ElevenLabs TTS (text-to-speech)
  - Telegram bot for mobile access
  - Memory backup strategy (git-based)
  - Additional channels (WhatsApp, Slack, Discord)

## Discovered During Work

- Railway PostgreSQL uses internal networking (`postgres.railway.internal`) for
  service-to-service communication -- no SSL required on the internal network
- The Prisma schema expects `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`
  (not the standard `DATABASE_URL`) -- both are set
- ClawdBody's build command includes Prisma generation and schema push as part
  of the Railway deploy pipeline via `railway.toml`
- The app uses Node.js 20+ (set via nixpacks in `railway.toml`)

## Reference

- **Railway Project URL**: https://railway.app/project/cda577ca-ad7f-46ed-aeaa-a48614d0591a
- **App URL**: https://clawdbody-app-production.up.railway.app
- **GitHub Fork**: https://github.com/Flufscut/ClawdBody
- **Upstream ClawdBody**: https://github.com/Prakshal-Jain/ClawdBody
- **OpenClaw Core**: https://github.com/openclaw/openclaw
- **ClawRouter**: https://github.com/BlockRunAI/ClawRouter
