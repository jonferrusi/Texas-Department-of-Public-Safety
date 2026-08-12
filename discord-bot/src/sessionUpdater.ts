import { Routes, type Client } from "discord.js";
import { fetchServerInfo, fetchQueue } from "./erlc.js";
import { getStore } from "./store.js";
import { log } from "./logger.js";

const UPDATE_INTERVAL_MS = 60_000;

// Permanent CDN URLs (never expire, unlike media.discordapp.net links)
const BANNER_URL =
  "https://cdn.discordapp.com/attachments/1506339727580594267/1506339804915302521/FSRP_BANNERS_-_SESSIONS.png";
const FOOTER_URL =
  "https://cdn.discordapp.com/attachments/1506339727580594267/1506343456556060742/Copy_of_VITAL_FOOTER_BANNER.png";

const WIFI_EMOJI   = { id: "1508913854048899192", name: "wifi",   animated: false };
const ROBLOX_EMOJI = { id: "1459963102782033963", name: "ROBLOX", animated: false };
const JOIN_URL     = "https://policeroleplay.community/join/FSRPD";

/**
 * Builds the full Components v2 payload matching the user's Discohook design.
 * Only the two grey stat buttons are dynamic — everything else is static.
 */
export function buildSessionComponents(
  playerCount: string,
  queueCount: number,
  isOnline: boolean,
): object {
  return {
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // Container
        components: [
          // ── Banner image ──────────────────────────────────────────────────
          {
            type: 12, // Media Gallery
            items: [{ media: { url: BANNER_URL } }],
          },
          { type: 14, spacing: 2 }, // Separator
          // ── Description + role ping ───────────────────────────────────────
          {
            type: 10, // Text Display
            content: "<@&1487127237777031183> An SSU has started. Join up and have some great role plays. ",
          },
          { type: 14, spacing: 2 }, // Separator
          // ── Live stat buttons (grey badges) ───────────────────────────────
          {
            type: 1, // Action Row
            components: [
              {
                type: 2,
                style: 2, // Secondary (grey)
                custom_id: "stat_players",
                label: `Players: ${playerCount}`,
                disabled: true,
              },
              {
                type: 2,
                style: 2,
                custom_id: "stat_queue",
                label: `Queue: ${queueCount}`,
                disabled: true,
              },
            ],
          },
          { type: 14, spacing: 2 }, // Separator
          // ── Online indicator + Join button ────────────────────────────────
          {
            type: 1, // Action Row
            components: [
              {
                type: 2,
                style: 2,
                custom_id: "stat_status",
                emoji: WIFI_EMOJI,
                label: isOnline ? "Online" : "Offline",
                disabled: true,
              },
              {
                type: 2,
                style: 5, // Link — no custom_id allowed
                label: " Join in-game",
                emoji: ROBLOX_EMOJI,
                url: JOIN_URL,
              },
            ],
          },
          { type: 14, spacing: 2 }, // Separator
          // ── Footer image ──────────────────────────────────────────────────
          {
            type: 12, // Media Gallery
            items: [{ media: { url: FOOTER_URL } }],
          },
        ],
      },
    ],
  };
}

async function refreshSessionPanel(client: Client): Promise<void> {
  const store = getStore();
  const { sessionMessageId, sessionChannelId, sessionActive } = store.botConfig;
  if (!sessionMessageId || !sessionChannelId || !sessionActive) return;

  try {
    const [info, queue] = await Promise.all([fetchServerInfo(), fetchQueue()]);

    const isOnline    = info !== null;
    const playerCount = isOnline ? `${info!.CurrentPlayers}/${info!.MaxPlayers}` : "N/A";
    const queueCount  = queue.length;

    await client.rest.patch(
      Routes.channelMessage(sessionChannelId, sessionMessageId),
      { body: buildSessionComponents(playerCount, queueCount, isOnline) },
    );

    log.info("Session", `Stats refreshed — players=${playerCount} queue=${queueCount}`);
  } catch (err) {
    log.warn("Session", `Failed to refresh session panel: ${(err as Error).message}`);
  }
}

export function startSessionUpdater(client: Client): void {
  setInterval(() => void refreshSessionPanel(client), UPDATE_INTERVAL_MS);
  log.info("Session", `Live stats updater started (interval: ${UPDATE_INTERVAL_MS / 1000}s)`);
}
