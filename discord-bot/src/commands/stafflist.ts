import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getStore } from "../store.js";
import { isStaff, replyError } from "../utils.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stafflist")
    .setDescription("Show all units currently on duty"),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to use this command.");
      return;
    }
    await interaction.deferReply();

    const store = getStore();
    const entries = Object.values(store.dutyRoster).sort(
      (a, b) => a.signedOnAt - b.signedOnAt // oldest first
    );

    if (entries.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("📋  STAFF ON DUTY")
            .setDescription("No units are currently signed on.")
            .setTimestamp(),
        ],
      });
      return;
    }

    const lines = entries.map((e, i) => {
      const onSince = `<t:${Math.floor(e.signedOnAt / 1000)}:R>`;
      return `\`${String(i + 1).padStart(2, "0")}\` **${e.callsign}** — <@${e.discordId}>\n` +
             `　　🎮 \`${e.robloxUsername}\`  •  🏅 ${e.rank}  •  🕐 ${onSince}`;
    });

    // Split into pages of 10
    const pageSize = 10;
    const pages = Math.ceil(lines.length / pageSize);
    const page1 = lines.slice(0, pageSize).join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋  STAFF ON DUTY  —  ${entries.length} unit${entries.length !== 1 ? "s" : ""}`)
      .setDescription(page1)
      .setFooter({
        text: pages > 1
          ? `Showing 1–${Math.min(pageSize, entries.length)} of ${entries.length} units`
          : `${entries.length} unit${entries.length !== 1 ? "s" : ""} on duty`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
