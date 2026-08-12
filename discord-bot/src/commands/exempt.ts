/**
 * /exempt — Manage Roblox usernames that are exempt from comms-check enforcement.
 *
 * Access is controlled exclusively by the hardcoded AUTHORIZED_USER_IDS set
 * in src/authorized.ts — NOT by Discord roles or server permissions.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getStore, addExemption, removeExemption } from "../store.js";
import { isStaff, replyError, replySuccess } from "../utils.js";
import { log } from "../logger.js";
import type { BotCommand } from "../types.js";


export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("exempt")
    .setDescription("Manage comms-check exemptions for specific Roblox users")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Exempt a Roblox user from comms-check enforcement")
        .addStringOption((o) =>
          o.setName("roblox").setDescription("Roblox username to exempt").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("note").setDescription("Reason for exemption").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a Roblox user's comms-check exemption")
        .addStringOption((o) =>
          o.setName("roblox").setDescription("Roblox username to un-exempt").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all currently exempted Roblox users")
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(
        interaction,
        "You are not authorized to manage comms exemptions.\n" +
        "Access is restricted to specific authorized users — not based on roles."
      );
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      const store   = getStore();
      const entries = Object.values(store.exemptedUsers);

      if (entries.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("🛡️  COMMS EXEMPTIONS")
              .setDescription("No users are currently exempted.")
              .setTimestamp(),
          ],
          ephemeral: true,
        });
        return;
      }

      const lines = entries.map(
        (e, i) =>
          `\`${String(i + 1).padStart(2, "0")}\` **${e.robloxUsername}**\n` +
          `　　Note: ${e.note || "—"}  •  Added by <@${e.addedBy}>  •  <t:${Math.floor(e.addedAt / 1000)}:D>`
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xeb459e)
            .setTitle(`🛡️  COMMS EXEMPTIONS  —  ${entries.length} user${entries.length !== 1 ? "s" : ""}`)
            .setDescription(lines.join("\n\n"))
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    const roblox = interaction.options.getString("roblox", true).trim();

    // ── add ───────────────────────────────────────────────────────────────────
    if (sub === "add") {
      const note = interaction.options.getString("note")?.trim() ?? "";
      addExemption({
        robloxUsername: roblox,
        note,
        addedBy: interaction.user.id,
        addedAt: Date.now(),
      });
      await replySuccess(
        interaction,
        `**${roblox}** has been exempted from comms-check enforcement.\n${note ? `Note: *${note}*` : ""}`
      );
      log.info("Exempt", `${interaction.user.tag} exempted ${roblox} — "${note}"`);
      return;
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === "remove") {
      const removed = removeExemption(roblox);
      if (!removed) {
        await replyError(interaction, `**${roblox}** is not on the exemption list.`);
        return;
      }
      await replySuccess(interaction, `Exemption for **${roblox}** has been removed.`);
      log.info("Exempt", `${interaction.user.tag} removed exemption for ${roblox}`);
    }
  },
};
