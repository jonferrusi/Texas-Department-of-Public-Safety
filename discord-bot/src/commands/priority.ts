import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { getStore } from "../store.js";
import { log } from "../logger.js";
import { isStaff, replyError } from "../utils.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("priority")
    .setDescription("Announce priority mode activation or deactivation")
    .addStringOption((o) =>
      o
        .setName("status")
        .setDescription("Activate or deactivate priority mode")
        .setRequired(true)
        .addChoices(
          { name: "ON  — Activate priority", value: "on" },
          { name: "OFF — Deactivate priority", value: "off" }
        )
    )
    .addStringOption((o) =>
      o.setName("location").setDescription("Location of the priority incident").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Brief reason / nature of the call").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to use this command.");
      return;
    }
    const status   = interaction.options.getString("status",   true) as "on" | "off";
    const location = interaction.options.getString("location") ?? "Not specified";
    const reason   = interaction.options.getString("reason")   ?? "Not specified";

    const store    = getStore();
    const entry    = store.dutyRoster[interaction.user.id];
    const callsign = entry?.callsign ?? "Unknown";
    const rank     = entry?.rank     ?? "Officer";
    const roblox   = entry?.robloxUsername ?? interaction.user.username;

    const isOn = status === "on";

    const embed = new EmbedBuilder()
      .setColor(isOn ? 0xed4245 : 0x57f287)
      .setTitle(isOn ? "🚨  PRIORITY MODE ACTIVATED" : "✅  PRIORITY MODE DEACTIVATED")
      .setDescription(
        isOn
          ? "**All units:** Maintain radio silence unless directly involved.\n**Senior units:** Respond Code 3 to the following incident."
          : "Priority mode has ended. Resume normal operations."
      )
      .addFields(
        { name: "📻  Reporting Unit",  value: `${callsign} — ${rank}`,               inline: true },
        { name: "👮  Officer",          value: `<@${interaction.user.id}> (${roblox})`, inline: true },
        { name: "📍  Location",         value: location,                               inline: true },
      );

    if (isOn) {
      embed.addFields({ name: "📋  Nature of Call", value: reason, inline: false });
    }

    embed
      .setFooter({ text: "ERLC Operations • Priority System" })
      .setTimestamp();

    // Post to priority channel if configured
    const priorityChannelId = store.botConfig.priorityChannelId;
    if (priorityChannelId && priorityChannelId !== interaction.channelId) {
      const ch = interaction.guild?.channels.cache.get(priorityChannelId) as TextChannel | undefined;
      if (ch) {
        await ch.send({ embeds: [embed] });
        await interaction.reply({
          content: `✅ Priority mode **${status.toUpperCase()}** announced in <#${priorityChannelId}>.`,
          ephemeral: true,
        });
        log.info("Priority", `${roblox} → ${status.toUpperCase()} at ${location}`);
        return;
      }
    }

    await interaction.reply({ embeds: [embed] });
    log.info("Priority", `${roblox} → ${status.toUpperCase()} at ${location}`);
  },
};
