import {
  ChannelType,
  ComponentType,
  ButtonStyle,
  PermissionFlagsBits,
  type Client,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { getOpenTicketForUser, addTicket, removeTicket, getTicket } from "./store.js";
import { log } from "./logger.js";
import type { TicketType } from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const GENERAL_CATEGORY_ID     = "1501036273916444853";
export const HIGHRANK_CATEGORY_ID    = "1501037177918853220";
export const FOUNDERSHIP_CATEGORY_ID = "1487165830826561737";
export const STAFF_ROLE_ID           = "1487127237898666070";
export const HIGHRANK_ROLE_ID        = "1487127238058180810";
export const FOUNDERSHIP_ROLE_ID     = "1528073083523694612";

export const TICKET_TYPE_PING: Record<TicketType, string> = {
  general:     `<@&${STAFF_ROLE_ID}>`,
  highrank:    `<@&${HIGHRANK_ROLE_ID}>`,
  foundership: `<@&${FOUNDERSHIP_ROLE_ID}>`,
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  general:     "General Support",
  highrank:    "High Rank Support",
  foundership: "Foundership Support",
};

export const TICKET_TYPE_COLORS: Record<TicketType, number> = {
  general:     0x5865f2,
  highrank:    0xfaa61a,
  foundership: 0xed4245,
};

// ── Roblox API ────────────────────────────────────────────────────────────────

interface RobloxUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export async function lookupRobloxUser(username: string): Promise<RobloxUser | null> {
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: { id: number; name: string }[] };
    const user = data.data?.[0];
    if (!user) return null;

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`
    );
    let avatarUrl: string | null = null;
    if (thumbRes.ok) {
      const thumbData = (await thumbRes.json()) as { data: { imageUrl: string }[] };
      avatarUrl = thumbData.data?.[0]?.imageUrl ?? null;
    }

    return { id: String(user.id), name: user.name, avatarUrl };
  } catch {
    return null;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function buildTicketEmbed(
  discordUsername: string,
  discordId: string,
  roblox: RobloxUser,
  reason: string,
  type: TicketType
) {
  return {
    color: TICKET_TYPE_COLORS[type],
    title: `🎫 ${TICKET_TYPE_LABELS[type]}`,
    thumbnail: roblox.avatarUrl ? { url: roblox.avatarUrl } : undefined,
    fields: [
      { name: "Discord Username", value: discordUsername, inline: true },
      { name: "Discord ID",       value: discordId,       inline: true },
      { name: "\u200b",           value: "\u200b",        inline: true },
      { name: "Roblox Username",  value: roblox.name,     inline: true },
      { name: "Roblox ID",        value: roblox.id,       inline: true },
      { name: "\u200b",           value: "\u200b",        inline: true },
      { name: "Reason",           value: reason },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `Ticket • ${TICKET_TYPE_LABELS[type]}` },
  };
}

const closeRow = {
  type: ComponentType.ActionRow as const,
  components: [
    {
      type: ComponentType.Button as const,
      customId: "ticket:close",
      label: "Close Ticket",
      style: ButtonStyle.Danger,
      emoji: { name: "🔒" },
    },
  ],
};

// ── Create ticket ─────────────────────────────────────────────────────────────

export async function createTicket(
  interaction: ModalSubmitInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const robloxUsername = interaction.fields.getTextInputValue("roblox_username").trim();
  const reason         = interaction.fields.getTextInputValue("reason").trim();

  // Prevent duplicate open tickets
  const existing = getOpenTicketForUser(interaction.user.id);
  if (existing) {
    await interaction.editReply({
      content: `❌ You already have an open ticket: <#${existing.channelId}>`,
    });
    return;
  }

  // Lookup Roblox account
  const roblox = await lookupRobloxUser(robloxUsername);
  if (!roblox) {
    await interaction.editReply({
      content: "❌ Could not find that Roblox username. Please check the spelling and try again.",
    });
    return;
  }

  const guild = interaction.guild!;

  // Create private text channel inside the general support category
  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: GENERAL_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
      { id: STAFF_ROLE_ID,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
    reason: `Ticket opened by ${interaction.user.tag}`,
  });

  const embed = buildTicketEmbed(
    interaction.user.tag,
    interaction.user.id,
    roblox,
    reason,
    "general"
  );

  await channel.send({
    content: `${TICKET_TYPE_PING["general"]} | <@${interaction.user.id}>`,
    embeds: [embed],
    components: [closeRow],
  });

  addTicket({
    channelId:       channel.id,
    discordId:       interaction.user.id,
    discordUsername: interaction.user.tag,
    robloxUsername:  roblox.name,
    robloxId:        roblox.id,
    reason,
    type:            "general",
    openedAt:        Date.now(),
  });

  log.info("Tickets", `Ticket opened by ${interaction.user.tag} (Roblox: ${roblox.name}) → <#${channel.id}>`);

  await interaction.editReply({ content: `✅ Your ticket has been opened: <#${channel.id}>` });
}

// ── Close ticket (deletes the channel) ───────────────────────────────────────

export async function closeTicket(
  interaction: ButtonInteraction,
  _client: Client
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const entry  = getTicket(interaction.channelId);
  const member = interaction.member as GuildMember;
  const isStaff = member.roles.cache.has(STAFF_ROLE_ID);
  const isOwner = entry?.discordId === interaction.user.id;

  if (!isStaff && !isOwner) {
    await interaction.editReply({ content: "❌ Only the ticket owner or staff can close this ticket." });
    return;
  }

  await interaction.editReply({ content: "🔒 Closing ticket in 5 seconds…" });

  // Give everyone a moment to read the closing notice
  await (interaction.channel as TextChannel).send({
    embeds: [{
      color: 0x57f287,
      description: `🔒 Ticket closed by <@${interaction.user.id}>. This channel will be deleted in 5 seconds.`,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => null);

  if (entry) removeTicket(entry.channelId);
  log.info("Tickets", `Ticket ${interaction.channelId} closed by ${interaction.user.tag}`);

  await new Promise<void>((r) => setTimeout(r, 5000));
  await (interaction.channel as TextChannel).delete(`Ticket closed by ${interaction.user.tag}`).catch(() => null);
}

// ── Escalate ticket ───────────────────────────────────────────────────────────

export async function escalateTicket(
  interaction: ChatInputCommandInteraction,
  client: Client,
  targetType: "highrank" | "foundership"
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member as GuildMember;
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    await interaction.editReply({ content: "❌ Only staff can escalate tickets." });
    return;
  }

  const entry = getTicket(interaction.channelId);
  if (!entry) {
    await interaction.editReply({ content: "❌ This command must be used inside a ticket channel." });
    return;
  }

  const targetCategoryId = targetType === "highrank" ? HIGHRANK_CATEGORY_ID : FOUNDERSHIP_CATEGORY_ID;
  const guild            = interaction.guild!;

  const channel = interaction.channel as TextChannel;

  // Move the channel into the target category and update permission overwrites
  await channel.edit({
    parent: targetCategoryId,
    permissionOverwrites: [
      { id: guild.id,           deny:  [PermissionFlagsBits.ViewChannel] },
      { id: STAFF_ROLE_ID,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: entry.discordId,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
    reason: `Ticket escalated to ${TICKET_TYPE_LABELS[targetType]} by ${interaction.user.tag}`,
  });

  // Notify in-channel with the new role ping
  await channel.send({
    content: `${TICKET_TYPE_PING[targetType]} | <@${entry.discordId}>`,
    embeds: [{
      color: TICKET_TYPE_COLORS[targetType],
      description: `⬆️ Ticket escalated to **${TICKET_TYPE_LABELS[targetType]}** by <@${interaction.user.id}>.`,
      timestamp: new Date().toISOString(),
    }],
  });

  // Update store in-place — same channel ID, new type
  addTicket({ ...entry, type: targetType });

  log.info("Tickets", `Ticket ${entry.channelId} escalated to ${TICKET_TYPE_LABELS[targetType]} by ${interaction.user.tag}`);
  await interaction.editReply({ content: `✅ Ticket moved to **${TICKET_TYPE_LABELS[targetType]}**.` });
}
