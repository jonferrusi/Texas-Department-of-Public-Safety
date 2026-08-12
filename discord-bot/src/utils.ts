import {
  type ChatInputCommandInteraction,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { getConfig } from "./config.js";

// ── Role IDs ──────────────────────────────────────────────────────────────────

export const STAFF_ROLE_ID       = "1487127237898666070";
export const HIGHRANK_ROLE_ID    = "1487127238058180810";
export const FOUNDERSHIP_ROLE_ID = "1528073083523694612";

// ── Role helpers ──────────────────────────────────────────────────────────────

function memberHasRole(interaction: ChatInputCommandInteraction, roleId: string): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(roleId);
}

/** Any staff member (or higher) */
export function isStaff(interaction: ChatInputCommandInteraction): boolean {
  return memberHasRole(interaction, STAFF_ROLE_ID);
}

/** High Rank or higher only */
export function isHighRank(interaction: ChatInputCommandInteraction): boolean {
  return memberHasRole(interaction, HIGHRANK_ROLE_ID);
}

/** Foundership only */
export function isFoundership(interaction: ChatInputCommandInteraction): boolean {
  return memberHasRole(interaction, FOUNDERSHIP_ROLE_ID);
}

/**
 * Legacy: Check whether the interaction member has admin access.
 * Kept for compatibility — prefer isStaff/isHighRank/isFoundership for new checks.
 */
export function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  const { adminRoleIds } = getConfig();
  if (adminRoleIds.length > 0) {
    return member.roles.cache.some((r) => adminRoleIds.includes(r.id));
  }
  return false;
}

/** Reply with a styled error embed */
export async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
  ephemeral = true
): Promise<void> {
  const payload = {
    embeds: [
      {
        color: 0xed4245, // Discord red
        description: `❌ ${message}`,
      },
    ],
    ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}

/** Reply with a styled success embed */
export async function replySuccess(
  interaction: ChatInputCommandInteraction,
  message: string,
  ephemeral = true
): Promise<void> {
  const payload = {
    embeds: [
      {
        color: 0x57f287, // Discord green
        description: `✅ ${message}`,
      },
    ],
    ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}
