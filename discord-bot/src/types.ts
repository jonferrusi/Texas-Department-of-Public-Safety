import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction, Client } from "discord.js";

// ── Dynamic voice channels ────────────────────────────────────────────────────

export interface ChannelType {
  baseChannelId: string;
  baseName: string;
  categoryId: string | null;
  userLimit: number;
  positionOffset: number;
}

export interface DynamicChannel {
  channelId: string;
  baseChannelId: string;
  number: number;
}

// ── Duty roster ───────────────────────────────────────────────────────────────

export interface DutyEntry {
  discordId: string;
  robloxUsername: string;
  callsign: string;
  rank: string;
  signedOnAt: number; // Unix ms
}

// ── Comms-check exemptions ────────────────────────────────────────────────────

export interface ExemptedUser {
  robloxUsername: string;
  note: string;
  addedBy: string;  // Discord user ID
  addedAt: number;  // Unix ms
}

// ── Hardcoded Roblox ID bypasses ──────────────────────────────────────────────

export interface HardcodedEntry {
  robloxId: string;           // numeric Roblox user ID (never changes)
  robloxUsername: string;     // stored for display only
  note: string;
  addedBy: string;            // Discord user ID
  addedAt: number;            // Unix ms
}

// ── SSU Vote session ──────────────────────────────────────────────────────────

export interface VoteSession {
  messageId: string;
  channelId: string;
  threshold: number;
  voterIds: string[]; // Discord user IDs — prevents double-voting
}

// ── Support tickets ───────────────────────────────────────────────────────────

export type TicketType = 'general' | 'highrank' | 'foundership';

export interface TicketEntry {
  channelId: string;
  discordId: string;
  discordUsername: string;
  robloxUsername: string;
  robloxId: string;
  reason: string;
  type: TicketType;
  openedAt: number; // Unix ms
}

// ── Bot operational config (set via slash commands, persisted to disk) ────────

export interface BotPersistentConfig {
  logChannelId?: string;
  dutyChannelId?: string;
  commsChannelId?: string;
  priorityChannelId?: string;
  // Live session stats panel
  sessionMessageId?: string;
  sessionChannelId?: string;
  // Ticket panel
  ticketPanelChannelId?: string;
  ticketPanelMessageId?: string;
  // Session state
  sessionActive?: boolean;
}

// ── Full persisted store ──────────────────────────────────────────────────────

export interface BotStore {
  channelTypes: Record<string, ChannelType>;
  dynamicChannels: Record<string, DynamicChannel>;
  dutyRoster: Record<string, DutyEntry>;           // discordId → entry
  exemptedUsers: Record<string, ExemptedUser>;     // robloxUsername.toLowerCase() → entry
  hardcodedIds: Record<string, HardcodedEntry>;    // robloxId (string) → entry
  botConfig: BotPersistentConfig;
  tickets: Record<string, TicketEntry>;            // channelId → entry
  voteSession: VoteSession | null;
}

// ── Slash command module ──────────────────────────────────────────────────────

export interface BotCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
}
