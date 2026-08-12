/**
 * /server — Display live ERLC server status and player list.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import {
  fetchServerInfo,
  fetchPlayers,
  fetchQueue,
  parseUsername,
} from "../erlc.js";
import { isStaff, replyError } from "../utils.js";
import type { BotCommand } from "../types.js";

const TEAM_EMOJI: Record<string, string> = {
  Police:   "🚔",
  Sheriff:  "⭐",
  Fire:     "🚒",
  Civilian: "🧑",
  DOT:      "🚧",
  Dispatch: "📟",
};

function teamEmoji(team: string): string {
  return TEAM_EMOJI[team] ?? "🎮";
}

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Show live ERLC server status and online players"),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to use this command.");
      return;
    }
    await interaction.deferReply();

    const [info, players, queue] = await Promise.all([
      fetchServerInfo(),
      fetchPlayers(),
      fetchQueue(),
    ]);

    if (!info) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("❌  ERLC API Unavailable")
            .setDescription(
              "Could not reach the ERLC API. Check that your `ERLC_API_KEY` secret is correct " +
              "and the server is online."
            )
            .setTimestamp(),
        ],
      });
      return;
    }

    // Group players by team
    const byTeam = new Map<string, string[]>();
    for (const p of players) {
      const username = parseUsername(p.Player);
      const team     = p.Team || "Unknown";
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team)!.push(
        `${teamEmoji(team)} \`${username}\`${p.Callsign ? ` (${p.Callsign})` : ""}`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎮  ${info.Name}`)
      .addFields(
        {
          name: "👥  Players",
          value: `\`${info.CurrentPlayers} / ${info.MaxPlayers}\``,
          inline: true,
        },
        {
          name: "🔑  Join Key",
          value: `\`${info.JoinKey}\``,
          inline: true,
        },
        {
          name: "⏳  Queue",
          value: `\`${queue.length}\``,
          inline: true,
        },
      );

    // Add a field per team (up to 8 teams, truncate large lists)
    const MAX_PER_TEAM = 12;
    for (const [team, names] of byTeam) {
      const display =
        names.length > MAX_PER_TEAM
          ? names.slice(0, MAX_PER_TEAM).join("\n") + `\n*…and ${names.length - MAX_PER_TEAM} more*`
          : names.join("\n");
      embed.addFields({ name: `${teamEmoji(team)}  ${team} (${names.length})`, value: display, inline: true });
    }

    if (players.length === 0) {
      embed.setDescription("*No players currently online.*");
    }

    embed.setFooter({ text: "ERLC Operations • Live Data" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
