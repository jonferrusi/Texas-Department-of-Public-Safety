import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  Routes,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { getStore, setVoteSession, getVoteSession, setBotConfig } from "../store.js";
import { isHighRank, replyError } from "../utils.js";
import { fetchServerInfo, fetchQueue } from "../erlc.js";
import { buildSessionComponents } from "../sessionUpdater.js";
import { log } from "../logger.js";

// ── Banner URLs (from user's Discohook embed) ─────────────────────────────────

const BANNER_URL =
  "https://media.discordapp.net/attachments/1506339727580594267/1506339804915302521/FSRP_BANNERS_-_SESSIONS.png?ex=6a5c5903&is=6a5b0783&hm=ac9c76008b9a21390ed3b5a74b2cb474c2f4bca7ccd4d38db104f56e550a6cd0&=&format=webp&quality=lossless&width=1872&height=623";
const FOOTER_URL =
  "https://media.discordapp.net/attachments/1506339727580594267/1506343456556060742/Copy_of_VITAL_FOOTER_BANNER.png?ex=6a5c5c6a&is=6a5b0aea&hm=d69d22a01977d3c6027f7d2b60a7340dcfc7145838ae8a44981453eff24af7a9&=&format=webp&quality=lossless&width=1872&height=92";

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildVoteBody(current: number, threshold: number) {
  return {
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // Container
        components: [
          { type: 12, items: [{ media: { url: BANNER_URL } }] },
          { type: 14, spacing: 2 },
          {
            type: 10,
            content:
              " <@&1487127237730766858> \nIf you would like to have a session please click the button below to vote\n",
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2, // Grey
                custom_id: "ssuvote:vote",
                label: `Vote (${current}/${threshold})`,
              },
            ],
          },
          { type: 14, spacing: 2 },
          { type: 12, items: [{ media: { url: FOOTER_URL } }] },
        ],
      },
    ],
  };
}

// ── /ssuvote command ──────────────────────────────────────────────────────────

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ssuvote")
    .setDescription("Start a vote to determine if a session should begin"),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    if (!isHighRank(interaction)) {
      await replyError(interaction, "You need the **High Rank** role to start an SSU vote.");
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("ssuvote:modal")
      .setTitle("SSU Vote Setup");

    const thresholdInput = new TextInputBuilder()
      .setCustomId("threshold")
      .setLabel("How many votes to start the session?")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. 5")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(3);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput));
    await interaction.showModal(modal);
  },
};

// ── Modal submit — post the vote embed ────────────────────────────────────────

export async function handleVoteModal(
  interaction: ModalSubmitInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const raw       = interaction.fields.getTextInputValue("threshold").trim();
  const threshold = parseInt(raw, 10);

  if (isNaN(threshold) || threshold < 1 || threshold > 100) {
    await interaction.editReply({ content: "❌ Please enter a number between 1 and 100." });
    return;
  }

  // Cancel any existing vote session
  const existing = getVoteSession();
  if (existing) {
    await client.rest
      .delete(Routes.channelMessage(existing.channelId, existing.messageId))
      .catch(() => null);
    setVoteSession(null);
  }

  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.editReply({ content: "❌ Could not determine which channel to post the vote in." });
    return;
  }
  const body = buildVoteBody(0, threshold);

  const posted = (await client.rest.post(Routes.channelMessages(channelId), {
    body,
  })) as { id: string };

  setVoteSession({ messageId: posted.id, channelId, threshold, voterIds: [] });
  log.info("SSUVote", `Vote started by ${interaction.user.tag} — threshold: ${threshold}`);

  await interaction.editReply({
    content: `✅ Vote posted! Session starts when **${threshold}** vote${threshold === 1 ? "" : "s"} are reached.`,
  });
}

// ── Button click — record vote, update count, trigger SSU if reached ──────────

export async function handleVoteButton(
  interaction: ButtonInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const session = getVoteSession();
  if (!session) {
    await interaction.editReply({ content: "❌ There is no active vote session." });
    return;
  }

  if (session.voterIds.includes(interaction.user.id)) {
    await interaction.editReply({ content: "❌ You have already voted." });
    return;
  }

  // Record vote
  session.voterIds.push(interaction.user.id);
  setVoteSession(session);

  const current = session.voterIds.length;
  log.info("SSUVote", `${interaction.user.tag} voted — ${current}/${session.threshold}`);

  if (current >= session.threshold) {
    // ── Threshold reached — fire SSU ────────────────────────────────────────
    await interaction.editReply({
      content: "✅ Vote threshold reached! Starting the session now…",
    });

    // Capture voter IDs before clearing the session
    const voterIds = [...session.voterIds];

    // Delete the vote message
    await client.rest
      .delete(Routes.channelMessage(session.channelId, session.messageId))
      .catch(() => null);

    setVoteSession(null);

    // Fetch ERLC data and post SSU to duty channel (or vote channel as fallback)
    const store     = getStore();
    const targetId  = store.botConfig.dutyChannelId ?? session.channelId;

    // Sweep any old bot messages from the target channel first
    try {
      const ch   = (await client.channels.fetch(targetId)) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 50 });
      await Promise.all(
        msgs.filter((m) => m.author.id === client.user!.id).map((m) => m.delete().catch(() => null))
      );
    } catch { /* ignore */ }

    const [info, queue] = await Promise.all([fetchServerInfo(), fetchQueue()]);
    const isOnline    = info !== null;
    const playerCount = isOnline ? `${info!.CurrentPlayers}/${info!.MaxPlayers}` : "N/A";
    const queueCount  = queue.length;

    // Ping everyone who voted
    const voterPings = voterIds.map((id) => `<@${id}>`).join(" ");

    const ssuBody = buildSessionComponents(playerCount, queueCount, isOnline);
    const ssuPosted = (await client.rest.post(Routes.channelMessages(targetId), {
      body: ssuBody,
    })) as { id: string };

    // Send voter pings as a follow-up message in the same channel
    const ch = (await client.channels.fetch(targetId)) as TextChannel;
    await ch.send({ content: voterPings }).catch(() => null);

    setBotConfig({ sessionMessageId: ssuPosted.id, sessionChannelId: targetId, sessionActive: true });
    log.info("SSUVote", `Vote threshold reached — SSU auto-posted to <#${targetId}>`);
  } else {
    // Update button label with new count
    await client.rest.patch(
      Routes.channelMessage(session.channelId, session.messageId),
      { body: buildVoteBody(current, session.threshold) }
    );

    await interaction.editReply({
      content: `✅ Vote recorded! **${current}/${session.threshold}** votes so far.`,
    });
  }
}
