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

### In Progress

- [ ] **Complete web UI setup** (2026-02-13)
  - Sign in with Google OAuth
  - Enter Claude API key
  - Select VM provider and provision Orgo VM
  - Connect Gmail and Calendar integrations

### Pending Tasks

- [ ] **Deploy persona files to VM**
  - Copy persona/ templates to /home/user/clawd/ on the Orgo VM
  - Customize USER.md with personal details

- [ ] **Apply security hardening on VM**
  - Enable exec approval for shell commands
  - Restrict agent skills to minimum needed
  - Verify file system restrictions

- [ ] **Optional integrations**
  - ElevenLabs TTS (text-to-speech)
  - Telegram bot for mobile access
  - Memory backup strategy (git-based)

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
- **Upstream Repo**: https://github.com/Prakshal-Jain/ClawdBody
