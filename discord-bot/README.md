# Texas DPS ER:LC — Discord Bot

A Discord bot for managing an ER:LC (Emergency Response: Liberty County) roleplay server: session up/down tracking, comms checks, priority calls, staff lists, tickets, and more.

## Configuration

Copy `.env.example` to `.env` and fill in:

- `DISCORD_TOKEN` — bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- `DISCORD_CLIENT_ID` — application (client) ID
- `DISCORD_GUILD_ID` — your Discord server ID
- `ERLC_API_KEY` — API key for ERLC integration

**Never commit `.env` or paste real tokens into code, commits, or issues** — `.env` is already git-ignored. If a token is ever exposed, regenerate it immediately in the Developer Portal.

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev mode with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript → dist/index.js |
| `npm start` | Run compiled bot |
| `npm run register` | Register slash commands with Discord |

## Hosting

GitHub itself only stores and version-controls this code — it doesn't run a persistent process, so pushing here doesn't make the bot come online. This repo includes a CI workflow (`.github/workflows/discord-bot-ci.yml`) that installs dependencies and type-checks/builds the bot on every push, so breakages are caught automatically, but it does not run the bot continuously.

To actually run the bot 24/7, deploy the `discord-bot/` folder to a host that keeps a Node process alive, e.g.:

- **Replit** (Reserved VM) — what this project was originally built for
- **Railway**, **Render**, or **Fly.io** — free/low-cost Node app hosting with a secrets manager
- Any VPS running `npm run build && npm start` under a process manager (`pm2`, `systemd`, etc.)

On whichever host you pick, set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `ERLC_API_KEY` as that host's environment variables/secrets — never in a file committed to git. Run `npm run register` once (locally or on the host) whenever slash commands change.
