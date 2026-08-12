import fs from "node:fs";
import path from "node:path";

export interface BotConfig {
  token: string;
  clientId: string;
  guildId: string;
  adminRoleIds: string[];
  settings: {
    checkIntervalMs: number;
    defaultUserLimit: number;
    deleteDelayMs: number;
    maxChannelsPerType: number;
    /** Default comms-check window in ms (default 5 min) */
    commsWindowMs: number;
    /** Default enforcement when comms check ends: none | kick | mute */
    commsEnforcement: "none" | "kick" | "mute";
  };
}

const CONFIG_PATH = path.join(process.cwd(), "config.json");

function loadConfig(): BotConfig {
  const tokenFromEnv    = process.env.DISCORD_TOKEN;
  const clientIdFromEnv = process.env.DISCORD_CLIENT_ID;
  const guildIdFromEnv  = process.env.DISCORD_GUILD_ID;

  let fileConfig: Partial<BotConfig> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Partial<BotConfig>;
    } catch (err) {
      console.error("[Config] Failed to parse config.json:", err);
    }
  }

  const token    = tokenFromEnv    ?? fileConfig.token    ?? "";
  const clientId = clientIdFromEnv ?? fileConfig.clientId ?? "";
  const guildId  = guildIdFromEnv  ?? fileConfig.guildId  ?? "";

  if (!token)    throw new Error("No Discord token. Set DISCORD_TOKEN or config.json → token.");
  if (!clientId) throw new Error("No client ID. Set DISCORD_CLIENT_ID or config.json → clientId.");
  if (!guildId)  throw new Error("No guild ID. Set DISCORD_GUILD_ID or config.json → guildId.");

  const settings = {
    checkIntervalMs:   5_000,
    defaultUserLimit:  5,
    deleteDelayMs:     2_000,
    maxChannelsPerType: 10,
    commsWindowMs:     300_000,   // 5 minutes
    commsEnforcement:  "none" as const,
    ...fileConfig.settings,
  };

  return {
    token,
    clientId,
    guildId,
    adminRoleIds: fileConfig.adminRoleIds ?? [],
    settings,
  };
}

let _config: BotConfig | null = null;

export function getConfig(): BotConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function reloadConfig(): BotConfig {
  _config = null;
  return getConfig();
}
