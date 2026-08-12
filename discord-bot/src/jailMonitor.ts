/**
 * Jail Monitor
 *
 * Every 30 s, fetches the ERLC player list and checks each player against
 * the Discord server. A player is "compliant" if:
 *   1. They have a Discord member whose nickname / display name matches their
 *      Roblox username (case-insensitive), AND
 *   2. That Discord member is currently in any voice channel.
 *
 * Non-compliant players are tracked with a timer:
 *   ~2.5 min  → Warning 1 (in-game :pm)
 *   ~4.5 min  → Warning 2 (in-game :pm)
 *    5.0 min  → :jail <username>
 *
 * Exempted players (via /exempt) are always skipped.
 */

import type { Client, Guild } from "discord.js";
import { fetchPlayers, parseUsername, parseUserId, sendCommand } from "./erlc.js";
import { isExempted, isHardcoded } from "./store.js";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

// ── Timing ────────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 30_000;  // how often we scan
const WARN1_MS          = 150_000; // 2 min 30 s → send warning 1
const WARN2_MS          = 270_000; // 4 min 30 s → send warning 2
const JAIL_MS           = 300_000; // 5 min      → jail

// ── State ─────────────────────────────────────────────────────────────────────

interface TrackedPlayer {
  firstDetectedAt: number; // epoch ms
  warnCount: number;       // 0 | 1 | 2
}

/** Roblox username (lowercase) → tracking entry */
const tracked = new Map<string, TrackedPlayer>();

let _interval: ReturnType<typeof setInterval> | null = null;

// ── Core check ────────────────────────────────────────────────────────────────

async function runCheck(guild: Guild): Promise<void> {
  // ── 1. Fetch ERLC player list ──────────────────────────────────────────────
  const players = await fetchPlayers();
  if (!players.length) return; // server empty or API unavailable

  const inGameLower = new Set(players.map((p) => parseUsername(p.Player).toLowerCase()));

  // ── 2. Build set of nicknames/display-names of members in any voice channel.
  //       guild.voiceStates.cache is populated by GuildVoiceStates intent
  //       (already enabled) — no privileged GuildMembers intent required.
  const inVoiceNames = new Set<string>();
  for (const [, vs] of guild.voiceStates.cache) {
    if (!vs.channelId || !vs.member) continue;
    const name = (vs.member.nickname ?? vs.member.displayName).toLowerCase();
    inVoiceNames.add(name);
  }

  const now = Date.now();

  // ── 3. Prune players who left the game ─────────────────────────────────────
  for (const [lowerName] of tracked) {
    if (!inGameLower.has(lowerName)) {
      log.info("JailMonitor", `${lowerName} left — removing from tracking`);
      tracked.delete(lowerName);
    }
  }

  // ── 4. Evaluate each in-game player ────────────────────────────────────────
  for (const player of players) {
    const username  = parseUsername(player.Player);
    const lowerName = username.toLowerCase();

    // Skip exempted players (by username) or hardcoded bypasses (by Roblox ID)
    const robloxId = parseUserId(player.Player);
    if (isExempted(username) || isHardcoded(robloxId)) {
      tracked.delete(lowerName);
      continue;
    }

    // Compliant = their Roblox username matches a Discord member in a VC
    const compliant = inVoiceNames.has(lowerName);

    if (compliant) {
      if (tracked.has(lowerName)) {
        log.info("JailMonitor", `${username} joined comms — cleared`);
        tracked.delete(lowerName);
      }
      continue;
    }

    // ── Non-compliant path ──────────────────────────────────────────────────

    if (!tracked.has(lowerName)) {
      log.info("JailMonitor", `Tracking ${username} — not in a Discord voice channel`);
      tracked.set(lowerName, { firstDetectedAt: now, warnCount: 0 });
      continue; // give them the initial grace period
    }

    const entry   = tracked.get(lowerName)!;
    const elapsed = now - entry.firstDetectedAt;

    if (elapsed >= JAIL_MS && entry.warnCount >= 2) {
      // ── Jail ─────────────────────────────────────────────────────────────
      log.info("JailMonitor", `Jailing ${username} (5 min without voice channel)`);
      await sendCommand(`:jail ${username}`);
      tracked.delete(lowerName);

    } else if (elapsed >= WARN2_MS && entry.warnCount < 2) {
      // ── Warning 2 — :h shows as on-screen overlay, bypasses chat filter ──
      const cmd = `:h ${username}: Your not in vc join fsrp5`;
      log.info("JailMonitor", `Sending warn 2 to ${username}`);
      const ok = await sendCommand(cmd);
      if (ok) {
        entry.warnCount = 2;
        log.info("JailMonitor", `Warning 2/2 sent to ${username}`);
      } else {
        log.warn("JailMonitor", `Warning 2 FAILED for ${username} — check ERLC IP allowlist`);
      }
      await new Promise<void>((r) => setTimeout(r, 4000));

    } else if (elapsed >= WARN1_MS && entry.warnCount < 1) {
      // ── Warning 1 — :h shows as on-screen overlay, bypasses chat filter ──
      const cmd = `:h ${username}: Your not in vc join fsrp5`;
      log.info("JailMonitor", `Sending warn 1 to ${username}`);
      const ok = await sendCommand(cmd);
      if (ok) {
        entry.warnCount = 1;
        log.info("JailMonitor", `Warning 1/2 sent to ${username}`);
      } else {
        log.warn("JailMonitor", `Warning 1 FAILED for ${username} — check ERLC IP allowlist`);
      }
      await new Promise<void>((r) => setTimeout(r, 4000));
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startJailMonitor(client: Client): void {
  if (_interval) return; // already running

  log.info("JailMonitor", `Starting — checking every ${CHECK_INTERVAL_MS / 1000}s`);
  log.info("JailMonitor", `Thresholds: warn1=${WARN1_MS / 60000}min  warn2=${WARN2_MS / 60000}min  jail=${JAIL_MS / 60000}min`);

  _interval = setInterval(async () => {
    const config = getConfig();
    const guild  =
      client.guilds.cache.get(config.guildId) ??
      await client.guilds.fetch(config.guildId).catch(() => null);

    if (!guild) {
      log.warn("JailMonitor", "Guild not in cache — skipping check");
      return;
    }

    try {
      await runCheck(guild);
    } catch (err) {
      log.error("JailMonitor", "Unhandled error during check", err);
    }
  }, CHECK_INTERVAL_MS);
}

export function stopJailMonitor(): void {
  if (!_interval) return;
  clearInterval(_interval);
  _interval = null;
  tracked.clear();
  log.info("JailMonitor", "Stopped and cleared tracking state");
}

/** How many players are currently being tracked (for /status or debugging). */
export function trackedCount(): number {
  return tracked.size;
}
