import type { BotCommand } from "../types.js";

// ── Dynamic voice channels ────────────────────────────────────────────────────
import { command as setup }         from "./setup.js";
import { command as addchannel }    from "./addchannel.js";
import { command as removechannel } from "./removechannel.js";
import { command as status }        from "./status.js";
import { command as reload }        from "./reload.js";

// ── Duty roster ───────────────────────────────────────────────────────────────
import { command as ssu }           from "./ssu.js";
import { command as ssd }           from "./ssd.js";
import { command as stafflist }     from "./stafflist.js";

// ── ERLC roleplay tools ───────────────────────────────────────────────────────
import { command as priority }      from "./priority.js";
import { command as server }        from "./server.js";

// ── Communications verification ───────────────────────────────────────────────
import { command as commscheck }    from "./commscheck.js";

// ── Administration ────────────────────────────────────────────────────────────
import { command as exempt }        from "./exempt.js";
import { command as hardcode }      from "./hardcode.js";
import { command as setlog }        from "./setlog.js";

// ── Support tickets ───────────────────────────────────────────────────────────
import { command as setupticket }   from "./setupticket.js";
import { command as escalate }      from "./escalate.js";
import { command as deescalate }    from "./deescalate.js";

// ── SSU vote ──────────────────────────────────────────────────────────────────
import { command as ssuvote }       from "./ssuvote.js";

export const commands: BotCommand[] = [
  // Voice channels
  setup, addchannel, removechannel, status, reload,
  // Duty
  ssu, ssd, stafflist,
  // Roleplay tools
  priority, server,
  // Comms
  commscheck,
  // Admin
  exempt, hardcode, setlog,
  // Tickets
  setupticket, escalate, deescalate,
  // SSU vote
  ssuvote,
];

export const commandMap = new Map<string, BotCommand>(
  commands.map((cmd) => [cmd.data.name, cmd])
);
