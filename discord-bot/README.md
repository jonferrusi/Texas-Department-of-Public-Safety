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

To actually run the bot 24/7, deploy the `discord-bot/` folder to a host that keeps a Node process alive. The bot already exposes a small HTTP health-check server on `$PORT`, so it deploys cleanly as a web service.

### Render (free) + uptime pinger — recommended free setup

This repo includes a `render.yaml` Blueprint at the repo root pointing at `discord-bot/`.

1. [render.com](https://render.com) → **New** → **Blueprint** → select this repo. Render reads `render.yaml` and creates the `texas-dps-discord-bot` web service on the **free** plan.
2. When prompted (the blueprint marks these `sync: false` so Render asks instead of storing them), enter `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ERLC_API_KEY`.
3. Deploy. Once live, copy the service's public URL from the Render dashboard (looks like `https://texas-dps-discord-bot.onrender.com`).
4. Then run `npm run register` once (see below) to register the slash commands.

**Render's free tier spins the service down after 15 minutes with no incoming HTTP traffic.** A Discord bot only makes outbound connections, so nothing would ping it on its own — it'd go to sleep and drop offline. Fix: keep something pinging the health-check URL from step 3.

5. Sign up free at [uptimerobot.com](https://uptimerobot.com).
6. **Add New Monitor** → Monitor Type: `HTTP(s)` → URL: your Render service URL from step 3 → Monitoring Interval: `5 minutes` (the free-plan minimum).
7. Save. UptimeRobot will now hit the bot every 5 minutes, which keeps Render from ever spinning it down.

One caveat to know about, not something to act on: Render's free plan also caps *total* free-service hours at 750/month account-wide. A single service running 24/7 uses ~720–744 hours depending on the month, which fits — but if you spin up other free Render services alongside this one, they'll draw from the same pool and could push you over.

### Other options

- **Fly.io** — usually a couple dollars/month or less for a bot this light, no sleep behavior, no pinger needed
- **Oracle Cloud free-tier VM** — genuinely free forever with a real always-on server, but more setup (create the VM yourself, SSH in, run the bot under `pm2`/`systemd`)
- **Replit** (Reserved VM) or **Railway** — paid, simplest click-through setup if you'd rather pay a small amount than deal with a pinger
- Any VPS running `npm run build && npm start` under a process manager

On whichever host you pick, set the four variables above as that host's environment variables/secrets — never in a file committed to git. Slash commands only need re-registering when they change:

```
DISCORD_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... npm run register
```

Run that from your own machine (with `.env` filled in) or as a one-off command on the host — it doesn't need to run continuously like the bot itself.
