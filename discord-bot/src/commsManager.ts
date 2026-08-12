/**
 * Manages live communications-verification sessions.
 *
 * Flow:
 *  1. Admin runs /commscheck start → startCommsCheck()
 *  2. Bot posts an embed with a ✅ Respond button into the target channel.
 *  3. Every 15 s the embed is edited with a live countdown.
 *  4. At 5 min remaining (if window > 5 min) → warning message.
 *  5. At 1 min remaining → urgent warning message.
 *  6. When time expires → endCommsCheck() posts results + applies enforcement.
 *
 * ERLC integration:
 *  If the ERLC API key is present, the check cross-references the duty roster
 *  against who is currently in-game. Only in-game duty members are required
 *  to respond. Without ERLC data, all duty roster members are required.
 */
import {
  type Client,
  type Guild,
  type TextChannel,
  type ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getStore } from "./store.js";
import { fetchPlayers, parseUsername } from "./erlc.js";
import { log } from "./logger.js";

export type Enforcement = "none" | "kick" | "mute";

interface CommsSession {
  sessionId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  startedAt: number;
  endsAt: number;
  windowMs: number;
  erlcPlayers: string[];        // roblox usernames (lowercase) in-game at session start
  respondedIds: Set<string>;    // Discord user IDs who clicked the button
  enforcement: Enforcement;
  interval: ReturnType<typeof setInterval>;
  warnedFiveMin: boolean;
  warnedOneMin: boolean;
}

/** One active session per channel (channelId → session). */
const sessions = new Map<string, CommsSession>();

// ── Embed / component builders ────────────────────────────────────────────────

function buildEmbed(s: CommsSession, ended = false): EmbedBuilder {
  const remaining = Math.max(0, s.endsAt - Date.now());
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1_000);
  const timeStr = ended ? "ENDED" : `${mins}m ${secs}s`;
  const isUrgent = !ended && remaining <= 60_000;

  const embed = new EmbedBuilder()
    .setColor(ended ? 0x95a5a6 : isUrgent ? 0xed4245 : 0xfee75c)
    .setTitle("📡  COMMUNICATIONS VERIFICATION")
    .setDescription(
      ended
        ? "Comms check has concluded. See results below."
        : "All active units **must** click **✅ Respond** before time expires."
    )
    .addFields(
      { name: "⏱  Time Remaining", value: `\`${timeStr}\``,                            inline: true },
      { name: "✅  Responded",      value: `\`${s.respondedIds.size}\``,                 inline: true },
      { name: "⚡  Enforcement",    value: `\`${s.enforcement.toUpperCase()}\``,         inline: true },
    );

  if (s.erlcPlayers.length > 0) {
    embed.addFields({
      name: "🎮  ERLC In-Game",
      value: `\`${s.erlcPlayers.length}\` player(s) detected at check start`,
      inline: true,
    });
  }

  embed
    .setFooter({ text: `Session ${s.sessionId}` })
    .setTimestamp(s.endsAt);

  return embed;
}

function buildRow(sessionId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`comms_respond:${sessionId}`)
      .setLabel("✅  Respond")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startCommsCheck(
  _client: Client,
  guild: Guild,
  channelId: string,
  windowMs: number,
  enforcement: Enforcement
): Promise<{ success: true } | { success: false; error: string }> {
  if (sessions.has(channelId)) {
    return { success: false, error: "A comms check is already active here. Use `/commscheck cancel` to stop it." };
  }

  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) {
    return { success: false, error: "Could not find the target text channel." };
  }

  // Snapshot ERLC players for cross-referencing
  const erlcRaw = await fetchPlayers().catch(() => []);
  const erlcPlayers = erlcRaw.map((p) => parseUsername(p.Player).toLowerCase());

  const sessionId = Date.now().toString(36).toUpperCase();
  const now = Date.now();

  const session: CommsSession = {
    sessionId,
    guildId: guild.id,
    channelId,
    messageId: "",
    startedAt: now,
    endsAt: now + windowMs,
    windowMs,
    erlcPlayers,
    respondedIds: new Set(),
    enforcement,
    interval: null!,
    warnedFiveMin: windowMs <= 300_000, // suppress 5-min warning if window ≤ 5 min
    warnedOneMin: false,
  };

  const msg = await channel.send({
    embeds: [buildEmbed(session)],
    components: [buildRow(sessionId)],
  });
  session.messageId = msg.id;

  const interval = setInterval(() => void tick(guild, channel, session), 15_000);
  session.interval = interval;
  sessions.set(channelId, session);

  log.info("CommsCheck", `Session ${sessionId} started in #${channel.name} — ${windowMs / 60_000} min, enforcement=${enforcement}`);
  return { success: true };
}

async function tick(guild: Guild, channel: TextChannel, session: CommsSession): Promise<void> {
  const remaining = session.endsAt - Date.now();

  // 5-minute warning
  if (!session.warnedFiveMin && remaining <= 300_000) {
    session.warnedFiveMin = true;
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription("⚠️  **5 MINUTES REMAINING** — All units respond to comms check now!")],
    }).catch(() => null);
  }

  // 1-minute warning
  if (!session.warnedOneMin && remaining <= 60_000 && remaining > 0) {
    session.warnedOneMin = true;
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚨  **1 MINUTE REMAINING** — Non-respondents face enforcement immediately after!")],
    }).catch(() => null);
  }

  // Update countdown embed
  try {
    const m = await channel.messages.fetch(session.messageId);
    await m.edit({
      embeds: [buildEmbed(session)],
      components: [buildRow(session.sessionId, remaining <= 0)],
    });
  } catch { /* message deleted or unavailable */ }

  // Expire
  if (remaining <= 0) {
    clearInterval(session.interval);
    sessions.delete(session.channelId);
    await concludeSession(guild, channel, session);
  }
}

async function concludeSession(guild: Guild, channel: TextChannel, session: CommsSession): Promise<void> {
  log.info("CommsCheck", `Session ${session.sessionId} ended — ${session.respondedIds.size} responded`);

  // Disable button on original message
  try {
    const m = await channel.messages.fetch(session.messageId);
    await m.edit({ embeds: [buildEmbed(session, true)], components: [buildRow(session.sessionId, true)] });
  } catch { /* ignore */ }

  // Determine who was expected to respond
  const store = getStore();
  const exempted = new Set(Object.keys(store.exemptedUsers)); // already lowercase
  const dutyEntries = Object.values(store.dutyRoster);

  type Expected = { discordId: string; robloxUsername: string };
  let expected: Expected[];

  if (session.erlcPlayers.length > 0) {
    expected = dutyEntries.filter(
      (e) =>
        session.erlcPlayers.includes(e.robloxUsername.toLowerCase()) &&
        !exempted.has(e.robloxUsername.toLowerCase())
    );
  } else {
    // No ERLC data — require all non-exempt duty members
    expected = dutyEntries.filter((e) => !exempted.has(e.robloxUsername.toLowerCase()));
  }

  const responded   = [...session.respondedIds];
  const noResponse  = expected.filter((e) => !responded.includes(e.discordId));

  // Results embed
  const resultEmbed = new EmbedBuilder()
    .setTitle("📋  COMMS CHECK — FINAL RESULTS")
    .setColor(noResponse.length === 0 ? 0x57f287 : 0xed4245)
    .setTimestamp();

  if (expected.length === 0) {
    resultEmbed.setDescription("No duty-roster units were required to respond (no ERLC data or empty roster).");
  } else {
    resultEmbed.addFields(
      {
        name: `✅  Responded (${responded.length}/${expected.length})`,
        value: responded.length > 0 ? responded.map((id) => `<@${id}>`).join("  ") : "*None*",
      },
      {
        name: `❌  No Response (${noResponse.length})`,
        value: noResponse.length > 0
          ? noResponse.map((e) => `<@${e.discordId}> *(${e.robloxUsername})*`).join("\n")
          : "*All units responded ✅*",
      }
    );
  }

  if (session.enforcement !== "none" && noResponse.length > 0) {
    resultEmbed.addFields({
      name: "⚡  Enforcement Applied",
      value: `\`${session.enforcement.toUpperCase()}\` on ${noResponse.length} unit(s)`,
    });
  }

  await channel.send({ embeds: [resultEmbed] });

  // Apply enforcement
  if (session.enforcement !== "none") {
    for (const entry of noResponse) {
      try {
        const member = await guild.members.fetch(entry.discordId).catch(() => null);
        if (!member) continue;
        if (session.enforcement === "kick" && member.voice.channel) {
          await member.voice.disconnect("ERLC Comms Check: no response").catch(() => null);
          log.info("CommsCheck", `Disconnected from voice: ${member.user.tag} (${entry.robloxUsername})`);
        } else if (session.enforcement === "mute" && member.voice.channel) {
          await member.voice.setMute(true, "ERLC Comms Check: no response").catch(() => null);
          log.info("CommsCheck", `Server-muted: ${member.user.tag} (${entry.robloxUsername})`);
        }
      } catch (err) {
        log.error("CommsCheck", `Enforcement failed for ${entry.discordId}`, err);
      }
    }
  }
}

/** Handle a ✅ Respond button click. */
export async function handleCommsResponse(interaction: ButtonInteraction): Promise<void> {
  const sessionId = interaction.customId.split(":")[1];
  const session = [...sessions.values()].find((s) => s.sessionId === sessionId);

  if (!session) {
    await interaction.reply({ content: "❌ This comms check has already ended.", ephemeral: true });
    return;
  }

  const already = session.respondedIds.has(interaction.user.id);
  session.respondedIds.add(interaction.user.id);

  await interaction.reply({
    content: already
      ? "✅ Already recorded — you're clear."
      : "✅ **Response recorded.** You are 10-4.",
    ephemeral: true,
  });
}

/** Cancel an active session. Returns false if none was active. */
export function cancelCommsCheck(channelId: string): boolean {
  const s = sessions.get(channelId);
  if (!s) return false;
  clearInterval(s.interval);
  sessions.delete(channelId);
  log.info("CommsCheck", `Session ${s.sessionId} cancelled`);
  return true;
}

export function hasActiveSession(channelId: string): boolean {
  return sessions.has(channelId);
}
