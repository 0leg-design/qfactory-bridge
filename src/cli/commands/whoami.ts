import { Command } from "commander";
import { loadCredentials } from "../../core/credentials.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current credentials")
  .action(() => {
    try {
      const creds = loadCredentials();
      console.log(`email:       ${creds.email}`);
      console.log(`workspaceId: ${creds.workspaceId}`);
      console.log(`server:      ${creds.serverUrl}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
