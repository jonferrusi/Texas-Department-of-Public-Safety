/**
 * Register slash commands with Discord's API for the configured guild.
 * Run this once after setup or whenever commands change:
 *   pnpm --filter @workspace/discord-bot run register
 */
import { REST, Routes } from "discord.js";
import { getConfig } from "./config.js";
import { commands } from "./commands/index.js";

async function register(): Promise<void> {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (err) {
    console.error("[Register] Config error:", (err as Error).message);
    process.exit(1);
  }

  const commandData = commands.map((cmd) => cmd.data.toJSON());

  const rest = new REST({ version: "10" }).setToken(config.token);

  console.log(`[Register] Registering ${commandData.length} slash command(s)…`);
  console.log(`[Register] Guild: ${config.guildId}`);

  try {
    const result = (await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commandData }
    )) as unknown[];

    console.log(`[Register] Successfully registered ${result.length} command(s):`);
    for (const cmd of commandData) {
      console.log(`  /${(cmd as { name: string }).name}`);
    }
  } catch (err) {
    console.error("[Register] Failed to register commands:", err);
    process.exit(1);
  }
}

register();
