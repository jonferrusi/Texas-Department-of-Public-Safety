/**
 * /setlog — Configure operational channels (duty log, comms, priority, bot log).
 * Admin-only.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { getStore, setBotConfig } from "../store.js";
import { isStaff, replyError } from "../utils.js";
import { setLogChannelId } from "../logger.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setlog")
    .setDescription("Configure operational channels for the bot")
    .addSubcommand((sub) =>
      sub
        .setName("duty")
        .setDescription("Channel where /ssu and /ssd announcements are posted")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("comms")
        .setDescription("Channel where comms checks run by default")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("priority")
        .setDescription("Channel where /priority announcements are posted")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("logs")
        .setDescription("Channel where bot WARN/ERROR entries are mirrored")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show current channel configuration")
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to configure channels.");
      return;
    }

    const sub   = interaction.options.getSubcommand();
    const store = getStore();

    // ── show ──────────────────────────────────────────────────────────────────
    if (sub === "show") {
      const cfg = store.botConfig;
      const fmt = (id?: string) => (id ? `<#${id}>` : "*Not set*");
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⚙️  Channel Configuration")
            .addFields(
              { name: "🟢  Duty Log",    value: fmt(cfg.dutyChannelId),     inline: true },
              { name: "📡  Comms Check", value: fmt(cfg.commsChannelId),    inline: true },
              { name: "🚨  Priority",    value: fmt(cfg.priorityChannelId), inline: true },
              { name: "📋  Bot Logs",    value: fmt(cfg.logChannelId),      inline: true },
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as TextChannel;

    const KEY_MAP: Record<string, keyof typeof store.botConfig> = {
      duty:     "dutyChannelId",
      comms:    "commsChannelId",
      priority: "priorityChannelId",
      logs:     "logChannelId",
    };
    const LABEL_MAP: Record<string, string> = {
      duty:     "Duty Log",
      comms:    "Comms Check",
      priority: "Priority Announcements",
      logs:     "Bot Logs",
    };

    const key   = KEY_MAP[sub];
    const label = LABEL_MAP[sub];

    setBotConfig({ [key]: channel.id });

    if (sub === "logs") {
      setLogChannelId(channel.id);
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ **${label}** channel set to <#${channel.id}>.`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },
};
