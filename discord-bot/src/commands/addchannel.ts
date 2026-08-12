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

// Alias for /setup — kept as a separate command for discoverability
export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("addchannel")
    .setDescription("Add a new voice channel type for dynamic management")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("The base voice channel to manage (e.g. Bank Robbery)")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("userlimit")
        .setDescription("Max users per overflow channel (0 = inherit from base)")
        .setMinValue(0)
        .setMaxValue(99)
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription(
          "Override the display name used for overflow channels (default: channel name)"
        )
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need **Manage Channels** permission or an admin role.");
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as VoiceChannel;
    const userLimit = interaction.options.getInteger("userlimit") ?? 0;
    const nameOverride = interaction.options.getString("name");
    const baseName = nameOverride?.trim() || channel.name;
    const store = getStore();

    if (store.channelTypes[channel.id]) {
      await replyError(
        interaction,
        `<#${channel.id}> is already registered.\nUse \`/removechannel\` first to reconfigure it.`
      );
      return;
    }

    addChannelType({
      baseChannelId: channel.id,
      baseName,
      categoryId: channel.parentId,
      userLimit,
      positionOffset: 1,
    });

    const typeCount = Object.keys(store.channelTypes).length + 1;

    await replySuccess(
      interaction,
      `Added **${baseName}** (<#${channel.id}>) as dynamic channel type #${typeCount}.\n` +
        `• User limit per overflow: ${userLimit > 0 ? userLimit : "inherit from base channel"}\n` +
        `• When full: **${baseName} 2** → **${baseName} 3** → …\n` +
        `• Empty numbered channels are deleted automatically.`
    );
  },
};
