import { ChannelType, type Client, type TextChannel } from "discord.js";
import { cleanupStaleChannels } from "../channelManager.js";
import { getConfig } from "../config.js";
import { getStore, setBotConfig } from "../store.js";
import { initLogger, setLogChannelId, log } from "../logger.js";
import { startSessionUpdater } from "../sessionUpdater.js";
import { startJailMonitor } from "../jailMonitor.js";

/** Find or create the #bot-logs channel and return its ID. */
async function ensureLogChannel(client: Client<true>, guildId: string): Promise<string | null> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    // Check if stored channel still exists
    const store = getStore();
    if (store.botConfig.logChannelId) {
      const existing = guild.channels.cache.get(store.botConfig.logChannelId);
      if (existing) return store.botConfig.logChannelId;
    }

    // Look for an existing channel named bot-logs
    const found = guild.channels.cache.find(
      (ch) => ch.name === "bot-logs" && ch.type === ChannelType.GuildText
    ) as TextChannel | undefined;
    if (found) {
      setBotConfig({ logChannelId: found.id });
      return found.id;
    }

    // Create it at the very bottom (high position number)
    const created = await guild.channels.create({
      name: "bot-logs",
      type: ChannelType.GuildText,
      topic: "Live feed of all bot activity — jail monitor, commands, warnings, errors.",
      position: 999,
    });
    setBotConfig({ logChannelId: created.id });
    return created.id;
  } catch (err) {
    console.error("[Ready] Could not ensure bot-logs channel:", err);
    return null;
  }
}

export async function onReady(client: Client<true>): Promise<void> {
  const config = getConfig();
  const store  = getStore();

  // Wire up the logger
  initLogger(client);

  // Find or create #bot-logs, then enable Discord mirroring for all log levels
  const logChannelId = await ensureLogChannel(client, config.guildId);
  if (logChannelId) {
    setLogChannelId(logChannelId);
  }

  const typeCount    = Object.keys(store.channelTypes).length;
  const dynamicCount = Object.keys(store.dynamicChannels).length;
  const dutyCount    = Object.keys(store.dutyRoster).length;

  log.info("Bot", `Logged in as ${client.user.tag}`);
  log.info("Bot", `Guild: ${config.guildId}`);
  log.info("Bot", `Channel types: ${typeCount}  Dynamic: ${dynamicCount}  On-duty: ${dutyCount}`);

  // Fetch the guild and populate channel cache
  const guild = await client.guilds.fetch(config.guildId).catch((err) => {
    log.error("Ready", "Failed to fetch guild", err);
    return null;
  });

  if (!guild) {
    log.error("Ready", "Guild not found — check DISCORD_GUILD_ID");
    return;
  }

  await guild.channels.fetch().catch((err) => {
    log.warn("Ready", `Failed to pre-fetch channels: ${(err as Error).message}`);
  });

  // Clean up stale dynamic-channel references from before the bot was offline
  await cleanupStaleChannels(guild);

  log.info("Bot", `Ready! Monitoring ${typeCount} channel type(s).`);

  client.user.setActivity("ERLC Operations", { type: 3 /* Watching */ });

  // Start the live session stats updater
  startSessionUpdater(client);

  // Start the jail monitor (checks every 30s for players not in Discord VC)
  startJailMonitor(client);
}
