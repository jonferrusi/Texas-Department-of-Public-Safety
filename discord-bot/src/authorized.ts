/**
 * Hardcoded list of Discord user IDs authorized to use privileged commands
 * such as /exempt (manage ERLC comms-check exemptions).
 *
 * These IDs bypass all role checks — only the specific users listed here
 * can run these commands, regardless of server roles.
 *
 * HOW TO ADD A USER
 *   1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
 *   2. Right-click the user in any server → "Copy User ID"
 *   3. Paste the ID as a string in the array below and re-run /register.
 *
 * IMPORTANT: Keep this file private. Anyone whose ID is listed here has
 * elevated access to exemption management.
 */
export const AUTHORIZED_USER_IDS = new Set<string>([
  // "123456789012345678",  // e.g. Server Owner
  // "987654321098765432",  // e.g. Head Administrator
]);
