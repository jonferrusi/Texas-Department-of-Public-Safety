import {
  Routes,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getStore, setBotConfig } from "../store.js";
import { isHighRank, replyError } from "../utils.js";
import { fetchServerInfo, fetchQueue } from "../erlc.js";
import { buildSessionComponents } from "../sessionUpdater.js";
import { log } from "../logger.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ssu")
    .setDescription("Post the Florida State Roleplay session announcement with live stats"),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    if (!isHighRank(interaction)) {
      await replyError(interaction, "You need the **High Rank** role to post a session.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch live ERLC data
    const [info, queue] = await Promise.all([fetchServerInfo(), fetchQueue()]);

    const isOnline    = info !== null;
    const playerCount = isOnline ? `${info!.CurrentPlayers}/${info!.MaxPlayers}` : "N/A";
    const queueCount  = queue.length;

    // Determine target channel
    const store  = getStore();
    const target = store.botConfig.dutyChannelId
      ? (interaction.guild?.channels.cache.get(store.botConfig.dutyChannelId) as TextChannel | undefined)
      : null;

    const channelId = target?.id ?? interaction.channelId;

    // Delete any previous bot messages in the target channel (SSU or SSD leftovers)
    try {
      const ch = (await client.channels.fetch(channelId)) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 50 });
      const botMsgs = msgs.filter((m) => m.author.id === client.user!.id);
      await Promise.all(botMsgs.map((m) => m.delete().catch(() => null)));
    } catch { /* ignore */ }

    // Post as raw Components v2 message
    const body = buildSessionComponents(playerCount, queueCount, isOnline);
    const posted = await client.rest.post(Routes.channelMessages(channelId), {
      body,
    }) as { id: string };

    // Persist message reference for the live updater and mark session active
    setBotConfig({ sessionMessageId: posted.id, sessionChannelId: channelId, sessionActive: true });

    await interaction.editReply({
      content: target
        ? `✅ Session posted in <#${target.id}>. Stats refresh every 60 s.`
        : "✅ Session posted! Stats refresh every 60 s.",
    });

    log.info(
      "SSU",
      `${interaction.user.tag} posted session (online=${isOnline}, players=${playerCount}, queue=${queueCount})`,
    );
  },
};
