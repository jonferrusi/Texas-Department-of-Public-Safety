import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type Interaction,
  type Client,
  type TextInputModalData,
} from "discord.js";
import { commandMap } from "../commands/index.js";
import { handleCommsResponse } from "../commsManager.js";
import { createTicket, closeTicket } from "../tickets.js";
import { handleVoteModal, handleVoteButton } from "../commands/ssuvote.js";
import { log } from "../logger.js";

export async function onInteractionCreate(
  interaction: Interaction,
  client: Client
): Promise<void> {
  // ── Button interactions ───────────────────────────────────────────────────
  if (interaction.isButton()) {
    // Comms response
    if (interaction.customId.startsWith("comms_respond:")) {
      try {
        await handleCommsResponse(interaction);
      } catch (err) {
        console.error("[InteractionCreate] Error handling comms button:", err);
        await interaction
          .reply({ content: "❌ An error occurred recording your response.", ephemeral: true })
          .catch(() => null);
      }
      return;
    }

    // Open ticket → show modal
    if (interaction.customId === "ticket:open") {
      const modal = new ModalBuilder()
        .setCustomId("ticket:modal")
        .setTitle("Open a Support Ticket");

      const robloxInput = new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your exact Roblox username")
        .setRequired(true)
        .setMaxLength(50);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for opening this ticket")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Briefly describe why you need support…")
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(robloxInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Close ticket
    if (interaction.customId === "ticket:close") {
      try {
        await closeTicket(interaction, client);
      } catch (err) {
        console.error("[InteractionCreate] Error closing ticket:", err);
        await interaction
          .reply({ content: "❌ An error occurred closing this ticket.", ephemeral: true })
          .catch(() => null);
      }
      return;
    }

    // SSU vote button
    if (interaction.customId === "ssuvote:vote") {
      try {
        await handleVoteButton(interaction, client);
      } catch (err) {
        console.error("[InteractionCreate] Error handling vote button:", err);
        await interaction
          .reply({ content: "❌ An error occurred recording your vote.", ephemeral: true })
          .catch(() => null);
      }
      return;
    }

    return;
  }

  // ── Modal submissions ─────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ticket:modal") {
      try {
        await createTicket(interaction, client);
      } catch (err) {
        console.error("[InteractionCreate] Error creating ticket:", err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: "❌ An error occurred creating your ticket.", ephemeral: true })
            .catch(() => null);
        }
      }
      return;
    }

    if (interaction.customId === "ssuvote:modal") {
      try {
        await handleVoteModal(interaction, client);
      } catch (err) {
        console.error("[InteractionCreate] Error handling vote modal:", err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: "❌ An error occurred starting the vote.", ephemeral: true })
            .catch(() => null);
        }
      }
      return;
    }

    return;
  }

  // ── Slash commands ────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    console.warn(`[Interaction] Unknown command: /${interaction.commandName}`);
    return;
  }

  // Log every command run to #bot-logs
  const opts = interaction.options.data
    .map((o) => `${o.name}: ${o.value ?? o.options?.map((s) => s.name).join("/") ?? ""}`)
    .join(", ");
  log.info("Command", `/${interaction.commandName}${opts ? ` (${opts})` : ""} — used by ${interaction.user.tag} in <#${interaction.channelId}>`);

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[Interaction] Error in /${interaction.commandName}:`, err);
    const payload = {
      embeds: [{ color: 0xed4245, description: "❌ An unexpected error occurred." }],
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
}
