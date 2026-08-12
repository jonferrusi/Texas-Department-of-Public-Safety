import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  ChannelType,
  type VoiceChannel,
} from "discord.js";
import { getStore, removeChannelType } from "../store.js";
import { deleteAllDynamicChannels } from "../channelManager.js";
import { isStaff, replyError, replySuccess } from "../utils.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("removechannel")
    .setDescription("Stop managing a voice channel type and optionally delete overflow channels")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The base voice channel to stop managing")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("cleanup")
        .setDescription("Delete all existing overflow channels for this type? (default: true)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need **Manage Channels** permission or an admin role.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel("channel", true) as VoiceChannel;
    const cleanup = interaction.options.getBoolean("cleanup") ?? true;
    const store = getStore();

    if (!store.channelTypes[channel.id]) {
      await replyError(interaction, `<#${channel.id}> is not a registered managed channel type.`);
      return;
    }

    const ct = store.channelTypes[channel.id];
    let deletedCount = 0;

    if (cleanup && interaction.guild) {
      deletedCount = await deleteAllDynamicChannels(interaction.guild, channel.id);
    }

    removeChannelType(channel.id);

    const cleanupNote =
      cleanup && deletedCount > 0
        ? `\n• Deleted **${deletedCount}** overflow channel(s).`
        : cleanup
          ? "\n• No overflow channels to delete."
          : "\n• Overflow channels were **not** deleted (cleanup=false).";

    await replySuccess(
      interaction,
      `Removed **${ct.baseName}** from managed channel types.${cleanupNote}`
    );
  },
};
