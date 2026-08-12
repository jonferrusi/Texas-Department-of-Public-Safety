import type { Client, VoiceState } from "discord.js";
import { getStore } from "../store.js";
import { evaluateChannelType } from "../channelManager.js";

/**
 * Called whenever a member joins, leaves, or moves between voice channels.
 * We check if the involved channels are ones we manage and trigger evaluation.
 */
export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  client: Client
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;

  const store = getStore();

  // Collect affected channel IDs (channels where members joined or left)
  const affectedChannelIds = new Set<string>();
  if (oldState.channelId) affectedChannelIds.add(oldState.channelId);
  if (newState.channelId) affectedChannelIds.add(newState.channelId);

  // For each affected channel, find the base channel type it belongs to
  const affectedBaseIds = new Set<string>();

  for (const channelId of affectedChannelIds) {
    // Is this channel a registered base channel?
    if (store.channelTypes[channelId]) {
      affectedBaseIds.add(channelId);
      continue;
    }
    // Is this channel a tracked dynamic channel?
    const dynamic = store.dynamicChannels[channelId];
    if (dynamic) {
      affectedBaseIds.add(dynamic.baseChannelId);
    }
  }

  // Evaluate each affected base type
  for (const baseChannelId of affectedBaseIds) {
    try {
      await evaluateChannelType(guild, client, baseChannelId);
    } catch (err) {
      console.error(`[VoiceUpdate] Error evaluating channel type ${baseChannelId}:`, err);
    }
  }
}
