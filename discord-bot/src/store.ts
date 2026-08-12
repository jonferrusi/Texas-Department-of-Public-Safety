import fs from "node:fs";
import path from "node:path";
import type {
  BotStore,
  ChannelType,
  DynamicChannel,
  DutyEntry,
  ExemptedUser,
  HardcodedEntry,
  BotPersistentConfig,
  TicketEntry,
  VoteSession,
} from "./types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "channels.json");

const DEFAULT_STORE: BotStore = {
  channelTypes: {},
  dynamicChannels: {},
  dutyRoster: {},
  exemptedUsers: {},
  hardcodedIds: {},
  botConfig: {},
  tickets: {},
  voteSession: null,
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadStore(): BotStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) return structuredClone(DEFAULT_STORE);
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BotStore>;
    return {
      channelTypes:   parsed.channelTypes   ?? {},
      dynamicChannels: parsed.dynamicChannels ?? {},
      dutyRoster:     parsed.dutyRoster     ?? {},
      exemptedUsers:  parsed.exemptedUsers  ?? {},
      hardcodedIds:   parsed.hardcodedIds   ?? {},
      botConfig:      parsed.botConfig      ?? {},
      tickets:        parsed.tickets        ?? {},
      voteSession:    parsed.voteSession    ?? null,
    };
  } catch (err) {
    console.error("[Store] Failed to load — starting fresh:", err);
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveStore(store: BotStore): void {
  ensureDataDir();
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[Store] Failed to save:", err);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _store: BotStore = loadStore();

export function getStore(): BotStore {
  return _store;
}

export function reloadStore(): void {
  _store = loadStore();
}

// ── Channel types ─────────────────────────────────────────────────────────────

export function addChannelType(ct: ChannelType): void {
  _store.channelTypes[ct.baseChannelId] = ct;
  saveStore(_store);
}

export function removeChannelType(baseChannelId: string): void {
  delete _store.channelTypes[baseChannelId];
  for (const [id, dc] of Object.entries(_store.dynamicChannels)) {
    if (dc.baseChannelId === baseChannelId) delete _store.dynamicChannels[id];
  }
  saveStore(_store);
}

// ── Dynamic channels ──────────────────────────────────────────────────────────

export function addDynamicChannel(dc: DynamicChannel): void {
  _store.dynamicChannels[dc.channelId] = dc;
  saveStore(_store);
}

export function removeDynamicChannel(channelId: string): void {
  delete _store.dynamicChannels[channelId];
  saveStore(_store);
}

export function updateDynamicChannelNumber(channelId: string, newNumber: number): void {
  if (_store.dynamicChannels[channelId]) {
    _store.dynamicChannels[channelId].number = newNumber;
    saveStore(_store);
  }
}

export function getDynamicChannelsForType(baseChannelId: string): DynamicChannel[] {
  return Object.values(_store.dynamicChannels)
    .filter((dc) => dc.baseChannelId === baseChannelId)
    .sort((a, b) => a.number - b.number);
}

export function migrateBaseChannel(
  oldBaseChannelId: string,
  newBaseChannelId: string,
  ct: ChannelType
): void {
  delete _store.channelTypes[oldBaseChannelId];
  _store.channelTypes[newBaseChannelId] = { ...ct, baseChannelId: newBaseChannelId };
  for (const dc of Object.values(_store.dynamicChannels)) {
    if (dc.baseChannelId === oldBaseChannelId) dc.baseChannelId = newBaseChannelId;
  }
  delete _store.dynamicChannels[newBaseChannelId];
  saveStore(_store);
}

// ── Duty roster ───────────────────────────────────────────────────────────────

export function addDutyEntry(entry: DutyEntry): void {
  _store.dutyRoster[entry.discordId] = entry;
  saveStore(_store);
}

export function removeDutyEntry(discordId: string): DutyEntry | null {
  const entry = _store.dutyRoster[discordId] ?? null;
  if (entry) {
    delete _store.dutyRoster[discordId];
    saveStore(_store);
  }
  return entry;
}

export function getDutyEntry(discordId: string): DutyEntry | null {
  return _store.dutyRoster[discordId] ?? null;
}

// ── Exempted users ────────────────────────────────────────────────────────────

export function addExemption(entry: ExemptedUser): void {
  _store.exemptedUsers[entry.robloxUsername.toLowerCase()] = entry;
  saveStore(_store);
}

export function removeExemption(robloxUsername: string): boolean {
  const key = robloxUsername.toLowerCase();
  if (!_store.exemptedUsers[key]) return false;
  delete _store.exemptedUsers[key];
  saveStore(_store);
  return true;
}

export function isExempted(robloxUsername: string): boolean {
  return robloxUsername.toLowerCase() in _store.exemptedUsers;
}

// ── Hardcoded Roblox ID bypasses ──────────────────────────────────────────────

export function addHardcoded(entry: HardcodedEntry): void {
  _store.hardcodedIds[entry.robloxId] = entry;
  saveStore(_store);
}

export function removeHardcoded(robloxId: string): boolean {
  if (!_store.hardcodedIds[robloxId]) return false;
  delete _store.hardcodedIds[robloxId];
  saveStore(_store);
  return true;
}

export function isHardcoded(robloxId: string): boolean {
  return robloxId in _store.hardcodedIds;
}

// ── Bot persistent config ─────────────────────────────────────────────────────

export function setBotConfig(partial: Partial<BotPersistentConfig>): void {
  _store.botConfig = { ..._store.botConfig, ...partial };
  saveStore(_store);
}

// ── Vote session ──────────────────────────────────────────────────────────────

export function setVoteSession(session: VoteSession | null): void {
  _store.voteSession = session;
  saveStore(_store);
}

export function getVoteSession(): VoteSession | null {
  return _store.voteSession;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export function addTicket(entry: TicketEntry): void {
  _store.tickets[entry.channelId] = entry;
  saveStore(_store);
}

export function removeTicket(channelId: string): TicketEntry | null {
  const entry = _store.tickets[channelId] ?? null;
  if (entry) {
    delete _store.tickets[channelId];
    saveStore(_store);
  }
  return entry;
}

export function getTicket(channelId: string): TicketEntry | null {
  return _store.tickets[channelId] ?? null;
}

export function getOpenTicketForUser(discordId: string): TicketEntry | null {
  return Object.values(_store.tickets).find((t) => t.discordId === discordId) ?? null;
}
