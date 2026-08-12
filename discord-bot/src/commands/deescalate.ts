import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import type { BotCommand } from "../types.js";
import {
  GENERAL_CATEGORY_ID,
  HIGHRANK_CATEGORY_ID,
  STAFF_ROLE_ID,
  HIGHRANK_ROLE_ID,
  TICKET_TYPE_COLORS,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_PING,
} from "../tickets.js";
import { getTicket, addTicket } from "../store.js";
import { log } from "../logger.js";
import { PermissionFlagsBits, type GuildMember, type TextChannel } from "discord.js";
import type { TicketType } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("deescalate")
    .setDescription("Move this ticket down to a lower support tier (staff only)")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Where to move the ticket")
        .setRequired(true)
        .addChoices(
          { name: "High Rank Support", value: "highrank" },
          { name: "General Support",   value: "general"  }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember;
    if (!member.roles.cache.has(STAFF_ROLE_ID)) {
      await interaction.editReply({ content: "❌ Only staff can de-escalate tickets." });
      return;
    }

    const entry = getTicket(interaction.channelId);
    if (!entry) {
      await interaction.editReply({ content: "❌ This command must be used inside a ticket channel." });
      return;
    }

    const targetType      = interaction.options.getString("type", true) as TicketType;
    const targetCategoryId = targetType === "general" ? GENERAL_CATEGORY_ID : HIGHRANK_CATEGORY_ID;
    const guild            = interaction.guild!;
    const channel          = interaction.channel as TextChannel;

    await channel.edit({
      parent: targetCategoryId,
      permissionOverwrites: [
        { id: guild.id,        deny:  [PermissionFlagsBits.ViewChannel] },
        { id: STAFF_ROLE_ID,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: entry.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
      reason: `Ticket de-escalated to ${TICKET_TYPE_LABELS[targetType]} by ${interaction.user.tag}`,
    });

    await channel.send({
      content: `${TICKET_TYPE_PING[targetType]} | <@${entry.discordId}>`,
      embeds: [{
        color: TICKET_TYPE_COLORS[targetType],
        description: `⬇️ Ticket de-escalated to **${TICKET_TYPE_LABELS[targetType]}** by <@${interaction.user.id}>.`,
        timestamp: new Date().toISOString(),
      }],
    });

    addTicket({ ...entry, type: targetType });

    log.info("Tickets", `Ticket ${entry.channelId} de-escalated to ${TICKET_TYPE_LABELS[targetType]} by ${interaction.user.tag}`);
    await interaction.editReply({ content: `✅ Ticket moved to **${TICKET_TYPE_LABELS[targetType]}**.` });
  },
};
