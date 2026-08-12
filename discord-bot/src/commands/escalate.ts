import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import type { BotCommand } from "../types.js";
import { escalateTicket } from "../tickets.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("escalate")
    .setDescription("Escalate this ticket to a higher support tier (staff only)")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Where to escalate the ticket")
        .setRequired(true)
        .addChoices(
          { name: "High Rank Support",    value: "highrank" },
          { name: "Foundership Support",  value: "foundership" }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, client: Client) {
    const type = interaction.options.getString("type", true) as "highrank" | "foundership";
    await escalateTicket(interaction, client, type);
  },
};
