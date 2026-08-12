import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { getConfig } from "./config.js";
import { onReady } from "./events/ready.js";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { onInteractionCreate } from "./events/interactionCreate.js";

async function main(): Promise<void> {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (err) {
    console.error("[Fatal] Configuration error:", (err as Error).message);
    console.error("  → Set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID as environment secrets.");
    console.error("  → Or copy config.example.json → config.json and fill it in.");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      // GatewayIntentBits.GuildMembers — needed for jail monitor; enable in Discord Dev Portal first:
      // Bot → Privileged Gateway Intents → Server Members Intent → Save Changes → then uncomment this line.
    ],
    partials: [Partials.Channel],
  });

  // ── Event handlers ──────────────────────────────────────────────────────────

  client.once("ready", async (c) => {
    try { await onReady(c); }
    catch (err) { console.error("[Ready] Unhandled error:", err); }
  });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    try { await onVoiceStateUpdate(oldState, newState, client); }
    catch (err) { console.error("[VoiceStateUpdate] Unhandled error:", err); }
  });

  client.on("interactionCreate", async (interaction) => {
    try { await onInteractionCreate(interaction, client); }
    catch (err) { console.error("[InteractionCreate] Unhandled error:", err); }
  });

  // ── Global error handling ───────────────────────────────────────────────────

  client.on("error", (err) => console.error("[Discord] Client error:", err));
  client.on("warn",  (info) => console.warn("[Discord] Warning:", info));

  process.on("unhandledRejection", (reason) => {
    console.error("[Process] Unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[Process] Uncaught exception:", err);
    // Don't exit — keep the bot running
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────

  const shutdown = (signal: string) => {
    console.log(`[Bot] Received ${signal}, shutting down…`);
    client.destroy();
    process.exit(0);
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // ── Health server (required for Replit deployment) ──────────────────────────

  const port = parseInt(process.env.PORT ?? "3000", 10);
  http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  }).listen(port, () => {
    console.log(`[Bot] Health server listening on port ${port}`);
  });

  // ── Login ───────────────────────────────────────────────────────────────────

  console.log("[Bot] Connecting to Discord…");
  try {
    await client.login(config.token);
  } catch (err) {
    console.error("[Fatal] Login failed:", err);
    process.exit(1);
  }
}

main();
