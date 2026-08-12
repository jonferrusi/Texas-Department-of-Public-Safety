import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  ChannelType,
  type VoiceChannel,
} from "discord.js";
import { getStore, addChannelType } from "../store.js";
import { isStaff, replyError, replySuccess } from "../utils.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Register a voice channel as a managed dynamic channel type")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The base voice channel to manage (e.g. Traffic Stop)")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("userlimit")
        .setDescription(
          "User limit for overflow channels (0 = inherit from base, default: inherit)"
        )
        .setMinValue(0)
        .setMaxValue(99)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to use this command.");
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as VoiceChannel;
    const userLimit = interaction.options.getInteger("userlimit") ?? 0;
    const store = getStore();

    if (store.channelTypes[channel.id]) {
      await replyError(
        interaction,
        `<#${channel.id}> is already registered as a managed channel type.\nUse \`/removechannel\` first if you want to re-configure it.`
      );
      return;
    }

    // Strip any trailing number so "Traffic Stop 1" and "Traffic Stop" both
    // produce baseName = "Traffic Stop"
    const baseName = channel.name.replace(/\s+\d+$/, "");

    addChannelType({
      baseChannelId: channel.id,
      baseName,
      categoryId: channel.parentId,
      userLimit,
      positionOffset: 1,
    });

    // Rename the channel to "Name 1" if it isn't already
    const expectedBaseName = `${baseName} 1`;
    if (channel.name !== expectedBaseName) {
      await channel.setName(expectedBaseName, "ERLC setup: renaming base to #1").catch((e) =>
        console.error("[Setup] Failed to rename base channel:", e)
      );
    }

    await replySuccess(
      interaction,
      `Registered **${expectedBaseName}** as a dynamic channel type.\n` +
        `• User limit: ${userLimit > 0 ? userLimit : "inherit from base"}\n` +
        `• Overflow channels will be created in the same category.\n\n` +
        `Channels will be numbered **${baseName} 1**, **${baseName} 2**, **${baseName} 3**, and so on.`
    );
  },
};
