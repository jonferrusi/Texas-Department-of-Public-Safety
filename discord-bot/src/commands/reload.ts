import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { reloadConfig } from "../config.js";
import { reloadStore } from "../store.js";
import { cleanupStaleChannels } from "../channelManager.js";
import { isStaff, replyError, replySuccess } from "../utils.js";
import type { BotCommand } from "../types.js";

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription(
      "Reload config and data store from disk, and clean up any stale channel references"
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need **Manage Channels** permission or an admin role.");
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      reloadConfig();
      reloadStore();

      if (interaction.guild) {
        await cleanupStaleChannels(interaction.guild);
      }

      await replySuccess(
        interaction,
        "Config and store reloaded from disk.\nStale channel references have been cleaned up."
      );
    } catch (err) {
      console.error("[Reload] Error during reload:", err);
      await replyError(
        interaction,
        `Reload failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};
