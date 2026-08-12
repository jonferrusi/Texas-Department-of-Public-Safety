/**
 * ERLC (Emergency Response: Liberty County) API client.
 * Docs: https://apidocs.policeroleplay.community/
 *
 * All functions return null / [] on failure — never throw into callers.
 */
import { log } from "./logger.js";

const BASE_URL = "https://api.erlc.gg/v1";
const API_KEY = process.env.ERLC_API_KEY ?? "";

// Primitive rate-limiter: wait at least 1 s between requests
let _lastReq = 0;
async function throttle(): Promise<void> {
  const wait = 1000 - (Date.now() - _lastReq);
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  _lastReq = Date.now();
}

async function erlcFetch<T>(path: string): Promise<T | null> {
  if (!API_KEY) {
    log.warn("ERLC", `No ERLC_API_KEY — skipping ${path}`);
    return null;
  }
  await throttle();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Server-Key": API_KEY },
    });
    if (res.status === 429) {
      log.warn("ERLC", `Rate-limited on ${path} — retry in 5 s`);
      await new Promise<void>((r) => setTimeout(r, 5000));
      return erlcFetch<T>(path);
    }
    if (!res.ok) {
      log.warn("ERLC", `${path} → HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.error("ERLC", `fetch ${path} failed`, err);
    return null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ERLCServerInfo {
  Name: string;
  OwnerId: number;
  CoOwnerIds: number[];
  CurrentPlayers: number;
  MaxPlayers: number;
  JoinKey: string;
  AccVerifiedReq: string;
  TeamBalance: boolean;
}

export interface ERLCPlayer {
  Player: string;      // "UserId:Username"
  Permission: string;  // "Normal" | "Server Owner" | "Server Administrator" | …
  Team: string;        // "Police" | "Sheriff" | "Fire" | "Civilian" | …
  Callsign: string;
}

export interface ERLCJoinLog {
  Join: string;   // "true" | "false"
  Player: string; // "UserId:Username"
  Timestamp: number;
}

export interface ERLCKillLog {
  Killed: string;
  Killer: string;
  Kill_Time: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract username from "Username:UserId" player string. */
export function parseUsername(playerStr: string): string {
  return playerStr.split(":")[0] ?? playerStr;
}

/** Extract numeric user ID from "Username:UserId" player string. */
export function parseUserId(playerStr: string): string {
  return playerStr.split(":")[1] ?? playerStr;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchServerInfo(): Promise<ERLCServerInfo | null> {
  return erlcFetch<ERLCServerInfo>("/server");
}

export async function fetchPlayers(): Promise<ERLCPlayer[]> {
  return (await erlcFetch<ERLCPlayer[]>("/server/players")) ?? [];
}

export async function fetchQueue(): Promise<ERLCPlayer[]> {
  return (await erlcFetch<ERLCPlayer[]>("/server/queue")) ?? [];
}

export async function fetchJoinLogs(): Promise<ERLCJoinLog[]> {
  return (await erlcFetch<ERLCJoinLog[]>("/server/joinlogs")) ?? [];
}

export async function fetchKillLogs(): Promise<ERLCKillLog[]> {
  return (await erlcFetch<ERLCKillLog[]>("/server/killlogs")) ?? [];
}

/** Send an in-game admin command (e.g. ":kickall"). Requires IP allowlist at api.erlc.gg/server-owners. */
export async function sendCommand(command: string): Promise<boolean> {
  if (!API_KEY) {
    log.warn("ERLC", "No ERLC_API_KEY — cannot send command");
    return false;
  }
  await throttle();
  try {
    const res = await fetch(`${BASE_URL}/server/command`, {
      method: "POST",
      headers: { "Server-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn("ERLC", `Command "${command}" failed — HTTP ${res.status}: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    log.error("ERLC", `Command "${command}" threw`, err);
    return false;
  }
}

/** Returns true if the Roblox username is currently in the ERLC server. */
export async function isPlayerInServer(robloxUsername: string): Promise<boolean> {
  const players = await fetchPlayers();
  const lower = robloxUsername.toLowerCase();
  return players.some((p) => parseUsername(p.Player).toLowerCase() === lower);
}
