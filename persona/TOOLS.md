# TOOLS.md - Tool & Skill Configuration

## Enabled Skills
<!-- Skills that are active and available -->
- Email (Gmail) - send, reply, read
- Calendar (Google Calendar) - create, update, delete events

## Restricted Skills
<!-- Skills that require approval before execution -->
- Shell commands - ALWAYS require /approve before execution
- File system access - limited to /home/user/clawd/ directory only

## Disabled Skills
<!-- Skills that are turned off -->
- Web browsing (enable later when comfortable)
- Social media posting (enable later when comfortable)

## Safety Rules
1. Never execute destructive shell commands (rm -rf, format, etc.) without explicit approval
2. Never access files outside the /home/user/clawd/ workspace
3. Never send emails without first confirming the recipient and content
4. Never create calendar events that conflict with existing ones without asking
5. Always use the /approve flow for any shell command execution

## Environment Notes
- Running on Orgo VM (Linux)
- Agent workspace: /home/user/clawd/
- Gateway port: 18789 (localhost only)
- Communication helper: /home/user/clawd/send_communication.sh
