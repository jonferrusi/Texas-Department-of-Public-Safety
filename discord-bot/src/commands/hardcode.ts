/**
 * /hardcode — Bypass jail-monitor enforcement by Roblox user ID.
 *
 * Unlike /exempt (which uses the mutable Roblox username), this stores
 * the numeric Roblox user ID — which never changes even if the player
 * renames their account.
 *
 * Access is restricted to AUTHORIZED_USER_IDS (src/authorized.ts).
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getStore, addHardcoded, removeHardcoded } from "../store.js";
import { isFoundership, replyError, replySuccess } from "../utils.js";
import { log } from "../logger.js";
import type { BotCommand } from "../types.js";


export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("hardcode")
    .setDescription("Bypass jail-monitor enforcement by Roblox user ID (permanent, rename-proof)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a Roblox user ID to the permanent bypass list")
        .addStringOption((o) =>
          o.setName("roblox_id").setDescription("Numeric Roblox user ID").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("username").setDescription("Roblox username (for reference only)").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("note").setDescription("Reason for bypass").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a Roblox user ID from the bypass list")
        .addStringOption((o) =>
          o.setName("roblox_id").setDescription("Numeric Roblox user ID to remove").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all hardcoded bypass entries")
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isFoundership(interaction)) {
      await replyError(
        interaction,
        "You are not authorized to manage hardcoded bypasses.\n" +
          "Access is restricted to specific authorized users."
      );
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      const entries = Object.values(getStore().hardcodedIds);

      if (entries.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("🔒  HARDCODED BYPASSES")
              .setDescription("No hardcoded bypass entries.")
              .setTimestamp(),
          ],
          ephemeral: true,
        });
        return;
      }

      const lines = entries.map(
        (e, i) =>
          `\`${String(i + 1).padStart(2, "0")}\` **${e.robloxUsername}** (ID: \`${e.robloxId}\`)\n` +
          `　　Note: ${e.note || "—"}  •  Added by <@${e.addedBy}>  •  <t:${Math.floor(e.addedAt / 1000)}:D>`
      );

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`🔒  HARDCODED BYPASSES  —  ${entries.length} entr${entries.length !== 1 ? "ies" : "y"}`)
            .setDescription(lines.join("\n\n"))
            .setFooter({ text: "Bypasses are matched by Roblox ID — rename-proof." })
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }

    const robloxId = interaction.options.getString("roblox_id", true).trim();

    // Validate: must be numeric
    if (!/^\d+$/.test(robloxId)) {
      await replyError(interaction, `\`${robloxId}\` is not a valid Roblox user ID — must be numeric.`);
      return;
    }

    // ── add ───────────────────────────────────────────────────────────────────
    if (sub === "add") {
      const username = interaction.options.getString("username", true).trim();
      const note     = interaction.options.getString("note")?.trim() ?? "";
      addHardcoded({
        robloxId,
        robloxUsername: username,
        note,
        addedBy: interaction.user.id,
        addedAt: Date.now(),
      });
      await replySuccess(
        interaction,
        `**${username}** (ID: \`${robloxId}\`) has been added to the hardcoded bypass list.\n` +
          (note ? `Note: *${note}*` : "")
      );
      log.info("Hardcode", `${interaction.user.tag} added bypass for ${username} (${robloxId}) — "${note}"`);
      return;
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === "remove") {
      const removed = removeHardcoded(robloxId);
      if (!removed) {
        await replyError(interaction, `No bypass entry found for Roblox ID \`${robloxId}\`.`);
        return;
      }
      await replySuccess(interaction, `Bypass for Roblox ID \`${robloxId}\` has been removed.`);
      log.info("Hardcode", `${interaction.user.tag} removed bypass for ID ${robloxId}`);
    }
  },
};
