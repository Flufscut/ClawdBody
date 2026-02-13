# OpenClaw Security Hardening Guide

## Access Control

### Railway App URL
- **Keep the URL private.** Do not share `clawdbody-app-production.up.railway.app`
  publicly. Anyone who finds it could potentially attempt to sign in.
- **Google OAuth test mode** provides a natural restriction: only test users
  added in the Google Cloud Console consent screen can sign in. Keep the app
  in "Testing" mode for personal use.
- **Optional: VPN gating.** Install Tailscale on your devices and restrict
  access to the Railway URL via Tailscale's access controls.

### Orgo VM
- The VM is sandboxed and separate from your personal machine.
- ClawdBot cannot access your local files, browser, or network.
- Access the VM only through ClawdBody's web terminal or the Orgo dashboard.

## Agent Execution Safety

### Exec Approval (Required)
ClawdBot supports an execution approval flow for shell commands:
- The agent pauses before running any shell command.
- It shows you the command and waits for `/approve` in the chat.
- Only after your explicit approval does it execute.
- **Enable this from day one.** Do not disable it until you fully trust
  the agent's behavior patterns.

### Skill Management
Start with the minimum set of skills and expand gradually:

**Phase 1 (Initial):**
- Email (Gmail) - read, send, reply
- Calendar - create, update, delete events

**Phase 2 (After 1-2 weeks):**
- Web browsing (research and summarization)
- File management (within workspace only)

**Phase 3 (After comfort):**
- Shell command execution (with approval)
- Additional integrations (Slack, etc.)

### File System Restrictions
- Restrict agent file access to `/home/user/clawd/` only.
- Do not give the agent sudo privileges.
- Run ClawdBot under a limited Linux user account.

## Secrets Management

### Environment Variables
- All secrets are stored as Railway environment variables (masked in logs).
- The Prisma schema encrypts OAuth tokens in the database.
- Never store API keys, passwords, or tokens on the Orgo VM filesystem
  where ClawdBot can read them.

### Memory File Safety
- Agent memory files (`memory.md`, daily logs) are plain text on the VM.
- These may contain snippets of conversations and learned facts.
- Treat the VM like a server with sensitive logs.
- Consider periodic backups of memory files to a private git repo.
- **Memory poisoning risk:** If an attacker writes to these files, they
  could manipulate the agent's behavior. Secure VM access accordingly.

## Monitoring

### What to Watch
- **Railway Logs:** Check for errors, unexpected API calls, or auth failures.
- **Memory files:** Periodically review `memory.md` and daily logs to ensure
  the agent isn't storing incorrect or sensitive information.
- **Email activity:** After enabling Gmail integration, review sent emails
  to ensure the agent isn't sending unintended messages.
- **Calendar events:** Check that created events are correct.

### Regular Maintenance
- Update ClawdBody and ClawdBot when new releases are available.
- Review and rotate API keys periodically.
- Audit the agent's TOOLS.md whitelist regularly.
- Back up the PostgreSQL database (Railway provides snapshots).

## Incident Response

If the agent does something unexpected:
1. **Stop the gateway:** In the web terminal, run `pkill -f 'clawdbot gateway'`
2. **Review logs:** Check `/tmp/clawdbot.log` on the VM
3. **Review memory:** Read `memory.md` and recent daily logs
4. **Correct and restart:** Edit the relevant persona/config files and restart
