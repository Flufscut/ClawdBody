# TOOLS.md - Tool & Skill Configuration

## LLM Routing (ClawRouter)

ClawRouter is installed as an OpenClaw extension. It automatically routes
each request to the cheapest model capable of handling it.

- **Profile:** auto (balanced cost/quality)
- **Simple queries:** routed to nvidia/kimi-k2.5 (~$0.001/M tokens)
- **Medium queries:** routed to grok-code-fast-1 (~$1.50/M tokens)
- **Complex queries:** routed to gemini-2.5-pro (~$10/M tokens)
- **Reasoning tasks:** routed to grok-4-1-fast-reasoning (~$0.50/M tokens)
- **Fallback (no funds):** gpt-oss-120b (free)
- **Payment:** x402 USDC micropayments on Base L2
- **Stats command:** /stats to see cost breakdown

## Enabled Skills (All)

### Productivity
- apple-notes -- Read/write Apple Notes
- apple-reminders -- Manage Apple Reminders
- bear-notes -- Interact with Bear note-taking app
- notion -- Sync with Notion workspace
- obsidian -- Manage Obsidian vault

### Communication
- himalaya (email) -- Read, send, reply to emails
- discord -- Discord server management and messaging
- slack -- Slack workspace interaction
- bluebubbles -- iMessage relay via BlueBubbles

### Development
- coding-agent -- Autonomous code writing and debugging
- github -- Repository management, issues, PRs
- skill-creator -- Create new OpenClaw skills

### Media & Vision
- camsnap -- Take photos via device camera
- openai-image-gen -- Generate images via DALL-E
- openai-whisper -- Speech-to-text transcription
- gifgrep -- Search and create GIFs
- peekaboo -- Screenshot and visual analysis
- songsee -- Music recognition and lookup

### Automation
- blogwatcher -- Monitor websites for changes
- food-order -- Place food delivery orders
- goplaces -- Location search and directions
- healthcheck -- Monitor service health
- oracle -- Ask and answer complex questions
- session-logs -- Review past conversation logs

### Smart Home
- openhue -- Control Philips Hue smart lights

### AI & Platform
- canvas -- A2UI live canvas workspace
- gemini -- Access Google Gemini models
- clawhub -- Browse and install skills from ClawHub registry

## Safety Rules

1. Never execute destructive shell commands (rm -rf, format, etc.) without explicit /approve
2. Never send emails without first confirming the recipient and content
3. Never create calendar events that conflict with existing ones without asking
4. Never post to social media or public channels without explicit approval
5. Never access files outside the workspace directory without asking
6. Always use the /approve flow for any shell command execution
7. Be cautious with smart home commands -- confirm before changing lighting/devices
8. Never share the ClawRouter wallet key or any API credentials

## Environment Notes

- Running on Orgo VM (Linux)
- Agent workspace: /home/user/clawd/ (or ~/.openclaw/workspace/)
- Gateway port: 18789 (localhost only)
- Communication helper: /home/user/clawd/send_communication.sh
- ClawRouter config: ~/.openclaw/openclaw.json (extensions.clawrouter)
- Wallet key: ~/.openclaw/blockrun/wallet.key
- Memory: ~/.openclaw/workspace/memory.md + memory/YYYY-MM-DD.md
