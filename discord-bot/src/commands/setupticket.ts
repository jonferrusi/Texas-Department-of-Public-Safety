import {
  Routes,
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../types.js";
import { setBotConfig } from "../store.js";
import { isStaff, replyError } from "../utils.js";
import { log } from "../logger.js";

// ── Components v2 payload from Discohook ──────────────────────────────────────
// Button custom_id changed to "ticket:open" so our handler fires on click.
// The "flow" field is Discohook-only and stripped here.

const TICKET_PANEL_BODY = {
  flags: 32768, // IS_COMPONENTS_V2
  components: [
    {
      type: 17, // Container
      components: [
        {
          type: 12, // Media Gallery — header banner
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1506339727580594267/1506357369418944623/FSRP_BANNERS_-_SUPPORT_1.png?ex=6a5c695f&is=6a5b17df&hm=7b7a08e0fbd51f2b2ed0a1ed857d22f273ba3eaaffa24197b08a30cd5475b624&=&format=webp&quality=lossless&width=1768&height=589",
              },
            },
          ],
        },
        { type: 14, spacing: 2 }, // Separator
        {
          type: 10, // Text Display
          content:
            "Welcome to our Support Channel. Open a ticket below and our staff will assist you shortly.",
        },
        { type: 14, spacing: 2 }, // Separator
        {
          type: 1, // Action Row
          components: [
            {
              type: 2,            // Button
              style: 2,           // Secondary (grey)
              label: "Support",
              custom_id: "ticket:open", // ← wired to our ticket modal
            },
          ],
        },
        { type: 14, spacing: 2 }, // Separator
        {
          type: 12, // Media Gallery — footer banner
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1506339727580594267/1506343456556060742/Copy_of_VITAL_FOOTER_BANNER.png?ex=6a5c5c6a&is=6a5b0aea&hm=d69d22a01977d3c6027f7d2b60a7340dcfc7145838ae8a44981453eff24af7a9&=&format=webp&quality=lossless&width=1872&height=92",
              },
            },
          ],
        },
      ],
    },
  ],
};

export const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setupticket")
    .setDescription("Post the support ticket panel in a channel")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post the ticket panel in")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, client: Client) {
    if (!isStaff(interaction)) {
      await replyError(interaction, "You need the **Staff** role to use this command.");
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel("channel", true) as TextChannel;

    const posted = (await client.rest.post(Routes.channelMessages(channel.id), {
      body: TICKET_PANEL_BODY,
    })) as { id: string };

    setBotConfig({ ticketPanelChannelId: channel.id, ticketPanelMessageId: posted.id });
    log.info("Tickets", `Ticket panel posted in <#${channel.id}> by ${interaction.user.tag}`);

    await interaction.editReply({ content: `✅ Ticket panel posted in <#${channel.id}>.` });
  },
};
