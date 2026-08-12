/**
 * Structured logger — writes to console with timestamps and mirrors
 * all entries to the configured Discord #bot-logs channel.
 *
 * INFO  → plain text message (lightweight, readable stream)
 * WARN  → yellow embed
 * ERROR → red embed
 */
import { type Client, EmbedBuilder, type TextChannel } from "discord.js";

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

let _client: Client | null = null;
let _channelId: string | null = null;

const CONSOLE_COLORS: Record<Level, string> = {
  INFO:  "\x1b[36m",
  WARN:  "\x1b[33m",
  ERROR: "\x1b[31m",
  DEBUG: "\x1b[35m",
};
const EMBED_COLORS: Record<Level, number> = {
  INFO:  0x5865f2,
  WARN:  0xfee75c,
  ERROR: 0xed4245,
  DEBUG: 0xeb459e,
};
const RESET = "\x1b[0m";

const LEVEL_EMOJI: Record<Level, string> = {
  INFO:  "🔵",
  WARN:  "⚠️",
  ERROR: "🔴",
  DEBUG: "🟣",
};

function ts(): string {
  return new Date().toISOString();
}

function shortTs(): string {
  // HH:MM:SS UTC for Discord messages
  return new Date().toISOString().slice(11, 19) + " UTC";
}

async function toDiscord(level: Level, tag: string, message: string): Promise<void> {
  if (!_client || !_channelId) return;
  if (level === "DEBUG") return; // never send debug noise

  try {
    const ch = _client.channels.cache.get(_channelId) as TextChannel | undefined;
    if (!ch?.isTextBased()) return;

    if (level === "INFO") {
      // Plain text — keeps the channel readable as a live feed
      await ch.send(`\`${shortTs()}\` ${LEVEL_EMOJI[level]} **[${tag}]** ${message}`);
    } else {
      // WARN / ERROR — embed so they stand out
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(EMBED_COLORS[level])
            .setDescription(`${LEVEL_EMOJI[level]} **[${tag}]** ${message}`)
            .setFooter({ text: level })
            .setTimestamp(),
        ],
      });
    }
  } catch {
    // Never let logging itself throw
  }
}

export const log = {
  info(tag: string, msg: string): void {
    console.log(`${CONSOLE_COLORS.INFO}[${ts()}] [INFO ] [${tag}]${RESET} ${msg}`);
    void toDiscord("INFO", tag, msg);
  },
  warn(tag: string, msg: string): void {
    console.warn(`${CONSOLE_COLORS.WARN}[${ts()}] [WARN ] [${tag}]${RESET} ${msg}`);
    void toDiscord("WARN", tag, msg);
  },
  error(tag: string, msg: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : "";
    const full   = detail ? `${msg} — ${detail}` : msg;
    console.error(`${CONSOLE_COLORS.ERROR}[${ts()}] [ERROR] [${tag}]${RESET} ${full}`);
    void toDiscord("ERROR", tag, full);
  },
  debug(tag: string, msg: string): void {
    if (process.env.DEBUG) {
      console.debug(`${CONSOLE_COLORS.DEBUG}[${ts()}] [DEBUG] [${tag}]${RESET} ${msg}`);
    }
  },
};

/** Call once in the ready handler so the logger can post to Discord. */
export function initLogger(client: Client): void {
  _client = client;
}

/** Set (or clear) the Discord channel to mirror log entries. */
export function setLogChannelId(channelId: string | null): void {
  _channelId = channelId;
}
