import { Command } from "commander";
import { clearCredentials } from "../../core/credentials.js";

export const logoutCommand = new Command("logout")
  .description("Remove local credentials")
  .action(() => {
    clearCredentials();
    console.log("Logged out. Run qf login to reconnect.");
  });
