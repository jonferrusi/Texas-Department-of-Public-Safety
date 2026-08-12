import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getStore } from "../store.js";
import { getConfig } from "../config.js";
import { isStaff, replyError, replySuccess } from "../utils.js";
import { startCommsCheck, cancelCommsCheck, hasActiveSession } from "../commsManager.js";
import type { BotCommand } from "../types.js";
import type { Enforcement } from "../commsManager.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("commscheck")
    .setDescription("Run a communications verification check")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a comms check in this (or the configured) channel")
        .addIntegerOption((o) =>
          o
            .setName("window")
            .setDescription("Response window in minutes (1–30, default: 5)")
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false)
        )
        .addStringOption((o) =>
          o
            .setName("enforcement")
            .setDescription("Action taken against non-respondents (default: none)")
            .setRequired(false)
            .addChoices(
              { name: "None — log only",             value: "none" },
              { name: "Kick — disconnect from voice", value: "kick" },
              { name: "Mute — server-mute in voice",  value: "mute" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel the active comms check in this channel")
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to run a comms check.");
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── cancel ────────────────────────────────────────────────────────────────
    if (sub === "cancel") {
      const store = getStore();
      const targetChannelId = store.botConfig.commsChannelId ?? interaction.channelId;
      const cancelled = cancelCommsCheck(targetChannelId);
      if (cancelled) {
        await replySuccess(interaction, "Comms check cancelled.");
      } else {
        await replyError(interaction, "No active comms check found in this channel.");
      }
      return;
    }

    // ── start ─────────────────────────────────────────────────────────────────
    const config     = getConfig();
    const store      = getStore();
    const windowMins = interaction.options.getInteger("window") ?? Math.round(config.settings.commsWindowMs / 60_000);
    const windowMs   = windowMins * 60_000;
    const enforcement = (interaction.options.getString("enforcement") ?? config.settings.commsEnforcement) as Enforcement;

    const targetChannelId = store.botConfig.commsChannelId ?? interaction.channelId;

    if (hasActiveSession(targetChannelId)) {
      await replyError(interaction, "A comms check is already running. Use `/commscheck cancel` first.");
      return;
    }

    if (!interaction.guild) {
      await replyError(interaction, "This command must be used inside a server.");
      return;
    }

    // Fetch channels if needed
    if (!interaction.guild.channels.cache.size) {
      await interaction.guild.channels.fetch().catch(() => null);
    }

    const result = await startCommsCheck(client, interaction.guild, targetChannelId, windowMs, enforcement);

    if (!result.success) {
      await replyError(interaction, result.error);
      return;
    }

    const channelMention = targetChannelId === interaction.channelId
      ? "this channel"
      : `<#${targetChannelId}>`;

    await replySuccess(
      interaction,
      `Comms check started in ${channelMention}.\n` +
      `• Window: **${windowMins} min**\n` +
      `• Enforcement: **${enforcement.toUpperCase()}**`
    );
  },
};
