import {
  SlashCommandBuilder,
  Routes,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { getStore, setBotConfig } from "../store.js";
import { isHighRank, replyError } from "../utils.js";
import { fetchServerInfo, fetchQueue, sendCommand } from "../erlc.js";
import { log } from "../logger.js";
import type { BotCommand } from "../types.js";

const BANNER_URL =
  "https://cdn.discordapp.com/attachments/1506339727580594267/1506339804915302521/FSRP_BANNERS_-_SESSIONS.png";
const FOOTER_URL =
  "https://cdn.discordapp.com/attachments/1506339727580594267/1506343456556060742/Copy_of_VITAL_FOOTER_BANNER.png";

const WIFI_EMOJI   = { id: "1508913854048899192", name: "wifi",   animated: false };
const ROBLOX_EMOJI = { id: "1459963102782033963", name: "ROBLOX", animated: false };
const JOIN_URL     = "https://policeroleplay.community/join/FSRPD";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ssd")
    .setDescription("Shut down the session, post final stats, and kick all players"),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    if (!isHighRank(interaction)) {
      await replyError(interaction, "You need the **High Rank** role to shut down a session.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch final stats at moment of shutdown
    const [info, queue] = await Promise.all([fetchServerInfo(), fetchQueue()]);
    const playerCount = info !== null ? `${info.CurrentPlayers}/${info.MaxPlayers}` : "N/A";
    const queueCount  = queue.length;

    // Build the shutdown Components v2 payload
    const body = {
      flags: 32768, // IS_COMPONENTS_V2
      components: [
        {
          type: 17, // Container
          components: [
            // ── Banner image ────────────────────────────────────────────────
            {
              type: 12,
              items: [{ media: { url: BANNER_URL } }],
            },
            { type: 14, spacing: 2 },
            // ── Description (no ping) ───────────────────────────────────────
            {
              type: 10,
              content:
                "**The session has shut down. Thanks for the amazing Roleplays. Stay tuned for the next session.**",
            },
            { type: 14, spacing: 2 },
            // ── Final stat buttons ──────────────────────────────────────────
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  custom_id: "ssd_players",
                  label: `Players: ${playerCount}`,
                  disabled: true,
                },
                {
                  type: 2,
                  style: 2,
                  custom_id: "ssd_queue",
                  label: `Queue: ${queueCount}`,
                  disabled: true,
                },
              ],
            },
            { type: 14, spacing: 2 },
            // ── Offline indicator + Join button ─────────────────────────────
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  custom_id: "ssd_status",
                  emoji: WIFI_EMOJI,
                  label: "Offline",
                  disabled: true,
                },
                {
                  type: 2,
                  style: 2, // Secondary (grey) — link buttons can't be disabled
                  custom_id: "ssd_join_disabled",
                  label: " Join in-game",
                  emoji: ROBLOX_EMOJI,
                  disabled: true,
                },
              ],
            },
            { type: 14, spacing: 2 },
            // ── Footer image ────────────────────────────────────────────────
            {
              type: 12,
              items: [{ media: { url: FOOTER_URL } }],
            },
          ],
        },
      ],
    };

    // Post to duty channel or current channel
    const store     = getStore();
    const channelId = store.botConfig.dutyChannelId ?? interaction.channelId;

    // Delete any previous bot messages in the target channel (SSU leftovers)
    try {
      const ch = (await client.channels.fetch(channelId)) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 50 });
      const botMsgs = msgs.filter((m) => m.author.id === client.user!.id);
      await Promise.all(botMsgs.map((m) => m.delete().catch(() => null)));
    } catch { /* ignore */ }

    const posted = await client.rest.post(Routes.channelMessages(channelId), { body }) as { id: string };

    // Store SSD message ID so the next /ssu can delete it, and mark session inactive
    // so the live updater stops trying to patch this message.
    setBotConfig({ sessionMessageId: posted.id, sessionChannelId: channelId, sessionActive: false });

    // Kick all players
    const kicked = await sendCommand(":kickall");
    if (kicked) {
      log.info("SSD", "Sent :kickall to ERLC server");
    } else {
      log.warn("SSD", ":kickall failed — IP may not be allowlisted yet");
    }

    await interaction.editReply({
      content: kicked
        ? `✅ Session shut down. Final stats posted. All players kicked.`
        : `✅ Session shut down. Final stats posted. (Kick failed — allowlist \`34.24.100.9\` at api.erlc.gg/server-owners)`,
    });

    log.info("SSD", `${interaction.user.tag} shut down session (players=${playerCount}, queue=${queueCount})`);
  },
};
