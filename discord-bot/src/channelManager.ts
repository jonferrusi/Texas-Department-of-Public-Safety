import {
  ChannelType as DiscordChannelType,
  OverwriteType,
  type Client,
  type VoiceChannel,
  type Guild,
} from "discord.js";
import { getConfig } from "./config.js";
import {
  getStore,
  addChannelType,
  removeChannelType,
  addDynamicChannel,
  removeDynamicChannel,
  updateDynamicChannelNumber,
  getDynamicChannelsForType,
  migrateBaseChannel,
} from "./store.js";
import type { ChannelType } from "./types.js";

// Tracks in-flight deletions so we don't double-delete
const pendingDeletes = new Set<string>();

/** Create the next overflow channel at the end of the chain */
async function createOverflowChannel(
  guild: Guild,
  baseChannelId: string,
  ct: ChannelType,
  nextNumber: number,
  referenceChannel: VoiceChannel
): Promise<void> {
  const { settings } = getConfig();
  const allChannels = getAllChannelsInType(guild, baseChannelId);
  if (allChannels.length >= settings.maxChannelsPerType) return;

  const newName = `${ct.baseName} ${nextNumber}`;

  try {
    const parentId = ct.categoryId ?? referenceChannel.parentId ?? null;

    const newChannel = await guild.channels.create({
      name: newName,
      type: DiscordChannelType.GuildVoice,
      parent: parentId,
      userLimit: referenceChannel.userLimit,
      permissionOverwrites: referenceChannel.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type as unknown as OverwriteType,
        allow: o.allow,
        deny: o.deny,
      })),
      reason: `ERLC auto-create: someone joined ${ct.baseName}`,
    });

    await newChannel.setPosition(referenceChannel.position + 1).catch(() => null);

    addDynamicChannel({
      channelId: newChannel.id,
      baseChannelId,
      number: nextNumber,
    });

    console.log(`[Manager] Created: ${newName} (${newChannel.id})`);
  } catch (err) {
    console.error(`[Manager] Failed to create ${newName}:`, err);
  }
}

/**
 * Returns all channels in the type as a flat sorted list.
 * Index 0 = base (logical #1), index 1 = dynamic #2, etc.
 */
interface ChannelEntry {
  channelId: string;
  channel: VoiceChannel;
  logicalNumber: number; // 1-based: base=1, first dynamic=2, etc.
  isDynamic: boolean;
}

function getAllChannelsInType(guild: Guild, baseChannelId: string): ChannelEntry[] {
  const store = getStore();
  const ct = store.channelTypes[baseChannelId];
  if (!ct) return [];

  const entries: ChannelEntry[] = [];

  // Base channel (logical #1)
  const baseCh = guild.channels.cache.get(baseChannelId) as VoiceChannel | undefined;
  if (baseCh) {
    entries.push({ channelId: baseChannelId, channel: baseCh, logicalNumber: 1, isDynamic: false });
  }

  // Dynamic channels sorted by their stored number
  const dynamics = getDynamicChannelsForType(baseChannelId);
  for (const dc of dynamics) {
    const ch = guild.channels.cache.get(dc.channelId) as VoiceChannel | undefined;
    if (ch) {
      entries.push({ channelId: dc.channelId, channel: ch, logicalNumber: dc.number, isDynamic: true });
    } else {
      removeDynamicChannel(dc.channelId);
    }
  }

  return entries.sort((a, b) => a.logicalNumber - b.logicalNumber);
}

/**
 * After any deletion, renumber all remaining channels so there are no gaps.
 * If the base channel was deleted, the first dynamic becomes the new base
 * (renamed without a number, re-registered as the base in the store).
 */
async function renumberAllChannels(
  guild: Guild,
  baseChannelId: string
): Promise<string> {
  // Returns the current (possibly new) baseChannelId after renumbering
  const store = getStore();
  const ct = store.channelTypes[baseChannelId];
  if (!ct) return baseChannelId;

  const baseStillExists = guild.channels.cache.has(baseChannelId);
  const dynamics = getDynamicChannelsForType(baseChannelId);

  if (!baseStillExists) {
    // Base was deleted — promote the first dynamic to base
    const validDynamics = dynamics.filter((dc) => guild.channels.cache.has(dc.channelId));

    if (validDynamics.length === 0) {
      // Nothing left — remove the type entirely
      removeChannelType(baseChannelId);
      console.log(`[Manager] All channels for "${ct.baseName}" removed, type unregistered.`);
      return baseChannelId;
    }

    const newBaseDc = validDynamics[0];
    const newBaseCh = guild.channels.cache.get(newBaseDc.channelId) as VoiceChannel;
    const remainingDynamics = validDynamics.slice(1);

    // Rename first dynamic → base name with number 1
    await newBaseCh.setName(`${ct.baseName} 1`, `ERLC renumber: promote to base`).catch((e) =>
      console.error(`[Manager] Failed to rename to base:`, e)
    );

    // Migrate store: old base type → new base
    migrateBaseChannel(baseChannelId, newBaseDc.channelId, ct);

    const newBaseChannelId = newBaseDc.channelId;

    // Renumber remaining dynamics under new base
    let nextNumber = 2;
    for (const dc of remainingDynamics) {
      const ch = guild.channels.cache.get(dc.channelId) as VoiceChannel | undefined;
      if (!ch) { removeDynamicChannel(dc.channelId); continue; }
      const expectedName = `${ct.baseName} ${nextNumber}`;
      if (ch.name !== expectedName) {
        await ch.setName(expectedName, `ERLC renumber`).catch((e) =>
          console.error(`[Manager] Failed to rename:`, e)
        );
      }
      updateDynamicChannelNumber(dc.channelId, nextNumber);
      nextNumber++;
    }

    console.log(`[Manager] Promoted "${ct.baseName} ${newBaseDc.number}" → "${ct.baseName}" (new base).`);
    return newBaseChannelId;
  } else {
    // Base still exists — rename it to Name 1 if needed, then renumber dynamics
    const baseCh = guild.channels.cache.get(baseChannelId) as VoiceChannel | undefined;
    if (baseCh && baseCh.name !== `${ct.baseName} 1`) {
      await baseCh.setName(`${ct.baseName} 1`, `ERLC renumber: base is #1`).catch((e) =>
        console.error(`[Manager] Failed to rename base to #1:`, e)
      );
    }

    let nextNumber = 2;
    for (const dc of dynamics) {
      const ch = guild.channels.cache.get(dc.channelId) as VoiceChannel | undefined;
      if (!ch) { removeDynamicChannel(dc.channelId); continue; }
      const expectedName = `${ct.baseName} ${nextNumber}`;
      if (dc.number !== nextNumber || ch.name !== expectedName) {
        await ch.setName(expectedName, `ERLC renumber`).catch((e) =>
          console.error(`[Manager] Failed to rename:`, e)
        );
        updateDynamicChannelNumber(dc.channelId, nextNumber);
      }
      nextNumber++;
    }
    return baseChannelId;
  }
}

/**
 * Core evaluation: called on every voiceStateUpdate for channels we manage.
 *
 * Rules:
 * 1. The LAST channel in the chain is always kept as the "open/waiting" slot.
 * 2. Any OTHER channel that is empty gets deleted.
 * 3. After deletions, renumber — if the base was deleted, the first dynamic
 *    is promoted (renamed to base name, registered as the new base).
 * 4. If the last channel gains a member, create a new empty channel at the end.
 */
export async function evaluateChannelType(
  guild: Guild,
  client: Client,
  baseChannelId: string
): Promise<void> {
  const store = getStore();
  const ct = store.channelTypes[baseChannelId];
  if (!ct) return;

  const { settings } = getConfig();
  const allChannels = getAllChannelsInType(guild, baseChannelId);
  if (allChannels.length === 0) return;

  const lastEntry = allChannels[allChannels.length - 1];

  // ── Step 1: Delete empty channels that are NOT the last slot ────────────
  const toDelete = allChannels.slice(0, -1).filter(
    (e) => e.channel.members.size === 0 && !pendingDeletes.has(e.channelId)
  );

  for (const entry of toDelete) {
    pendingDeletes.add(entry.channelId);

    setTimeout(async () => {
      try {
        const freshCh = guild.channels.cache.get(entry.channelId) as VoiceChannel | undefined;
        // Re-check: still empty and still not the only channel?
        const currentAll = getAllChannelsInType(guild, baseChannelId);
        const isLast = currentAll[currentAll.length - 1]?.channelId === entry.channelId;

        if (freshCh && freshCh.members.size === 0 && !isLast) {
          await freshCh.delete(`ERLC cleanup: empty non-last channel`);
          if (entry.isDynamic) removeDynamicChannel(entry.channelId);
          console.log(`[Manager] Deleted empty channel: ${freshCh.name}`);
        }
      } catch (err) {
        console.error(`[Manager] Failed to delete ${entry.channelId}:`, err);
      } finally {
        pendingDeletes.delete(entry.channelId);
        await renumberAllChannels(guild, baseChannelId);
      }
    }, settings.deleteDelayMs);
  }

  // ── Step 2: If last channel has someone, open a new empty slot ──────────
  if (lastEntry.channel.members.size > 0) {
    const nextNumber = allChannels.length + 1; // base=1, so next is length+1
    await createOverflowChannel(guild, baseChannelId, ct, nextNumber, lastEntry.channel);
  }
}

/**
 * On startup: remove stale channel references and renumber all types.
 */
export async function cleanupStaleChannels(guild: Guild): Promise<void> {
  const store = getStore();
  let cleaned = 0;

  // Remove dynamic channels that no longer exist
  for (const [channelId] of Object.entries(store.dynamicChannels)) {
    if (!guild.channels.cache.has(channelId)) {
      removeDynamicChannel(channelId);
      cleaned++;
    }
  }

  // Renumber all types (handles base deletion too)
  for (const [baseChannelId] of Object.entries(store.channelTypes)) {
    await renumberAllChannels(guild, baseChannelId);
  }

  if (cleaned > 0) {
    console.log(`[Manager] Cleaned up ${cleaned} stale channel reference(s).`);
  }
}

/**
 * Delete ALL dynamic channels for a type (used by /removechannel).
 */
export async function deleteAllDynamicChannels(
  guild: Guild,
  baseChannelId: string
): Promise<number> {
  const dynamics = getDynamicChannelsForType(baseChannelId);
  let count = 0;

  for (const dc of dynamics) {
    const ch = guild.channels.cache.get(dc.channelId) as VoiceChannel | undefined;
    if (ch) {
      try {
        await ch.delete("ERLC: channel type removed");
        count++;
      } catch (err) {
        console.error(`[Manager] Failed to delete channel ${dc.channelId}:`, err);
      }
    }
    removeDynamicChannel(dc.channelId);
  }

  return count;
}
