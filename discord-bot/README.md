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

To actually run the bot 24/7, deploy the `discord-bot/` folder to a host that keeps a Node process alive. The bot already exposes a small HTTP health-check server on `$PORT`, so it deploys cleanly as a web service on either of these:

### Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repo.
2. In the service's **Settings**, set **Root Directory** to `discord-bot`. Railway will pick up `discord-bot/railway.json` for the build/start commands automatically.
3. In **Variables**, add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ERLC_API_KEY`.
4. Deploy. Then run `npm run register` once (see below) to register the slash commands.

### Render

This repo includes a `render.yaml` Blueprint at the repo root pointing at `discord-bot/`.

1. [render.com](https://render.com) → **New** → **Blueprint** → select this repo. Render will read `render.yaml` and create the `texas-dps-discord-bot` web service on the free plan.
2. When prompted (the blueprint marks these `sync: false` so Render asks instead of storing them), enter `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ERLC_API_KEY`.
3. Deploy. Then run `npm run register` once (see below) to register the slash commands.

### Other options

- **Replit** (Reserved VM) — what this project was originally built for
- Any VPS running `npm run build && npm start` under a process manager (`pm2`, `systemd`, etc.)

On whichever host you pick, set the four variables above as that host's environment variables/secrets — never in a file committed to git. Slash commands only need re-registering when they change:

```
DISCORD_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... npm run register
```

Run that from your own machine (with `.env` filled in) or as a one-off command on the host — it doesn't need to run continuously like the bot itself.
