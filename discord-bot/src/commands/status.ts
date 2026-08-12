import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type VoiceChannel,
} from "discord.js";
import { getStore, getDynamicChannelsForType } from "../store.js";
import { isStaff, replyError } from "../utils.js";
import type { BotCommand } from "../types.js";
import { getConfig } from "../config.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show the current status of all managed dynamic voice channel types"),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need **Manage Channels** permission or an admin role.");
      return;
    }

    const store = getStore();
    const guild = interaction.guild!;
    const config = getConfig();
    const typeEntries = Object.entries(store.channelTypes);

    if (typeEntries.length === 0) {
      await interaction.reply({
        embeds: [
          {
            color: 0xfee75c,
            title: "📋 ERLC Dynamic Channels",
            description:
              "No channel types are registered yet.\nUse `/setup` or `/addchannel` to register a base voice channel.",
          },
        ],
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📋 ERLC Dynamic Channel Status")
      .setTimestamp()
      .setFooter({ text: `Max ${config.settings.maxChannelsPerType} channels per type` });

    for (const [baseChannelId, ct] of typeEntries) {
      const baseChannel = guild.channels.cache.get(baseChannelId) as VoiceChannel | undefined;
      const dynamicChannels = getDynamicChannelsForType(baseChannelId);

      const baseStatus = baseChannel
        ? `<#${baseChannelId}> — ${baseChannel.members.size}/${baseChannel.userLimit || "∞"} members`
        : `~~<#${baseChannelId}>~~ *(channel deleted)*`;

      const overflowLines = dynamicChannels.map((dc) => {
        const ch = guild.channels.cache.get(dc.channelId) as VoiceChannel | undefined;
        if (!ch) return `  • **${ct.baseName} ${dc.number}** — *(missing)*`;
        return `  • <#${dc.channelId}> — ${ch.members.size}/${ch.userLimit || "∞"} members`;
      });

      const totalActive = dynamicChannels.length + 1; // +1 for base
      const fieldValue = [baseStatus, ...overflowLines].join("\n");

      embed.addFields({
        name: `${ct.baseName} (${totalActive} channel${totalActive !== 1 ? "s" : ""})`,
        value: fieldValue || "No active channels",
        inline: false,
      });
    }

    const totalDynamic = Object.keys(store.dynamicChannels).length;
    embed.setDescription(
      `Managing **${typeEntries.length}** channel type(s) with **${totalDynamic}** active overflow channel(s).`
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
