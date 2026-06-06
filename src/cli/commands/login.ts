import { Command } from "commander";
import { randomBytes } from "crypto";
import { saveCredentials } from "../../core/credentials.js";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface ExchangeResponse {
  status: "pending" | "ok";
  token?: string;
  workspaceId?: string;
  email?: string;
  serverUrl?: string;
  error?: string;
}

export const loginCommand = new Command("login")
  .description("Authenticate with your Q-Factory server")
  .option("--server <url>", "Server URL (default: https://q.oleg.design)", "https://q.oleg.design")
  .action(async (opts: { server: string }) => {
    const serverUrl = opts.server.replace(/\/$/, "");
    const code = randomBytes(32).toString("hex");
    const authorizeUrl = `${serverUrl}/cli/authorize?code=${code}`;

    console.log("\nOpen this URL in your browser to approve access:\n");
    console.log(`  ${authorizeUrl}\n`);

    // Try to open the browser automatically
    try {
      const { exec } = await import("child_process");
      const openCmd = process.platform === "darwin"
        ? `open "${authorizeUrl}"`
        : process.platform === "win32"
          ? `start "" "${authorizeUrl}"`
          : `xdg-open "${authorizeUrl}"`;
      exec(openCmd);
    } catch {
      // non-fatal — user can open manually
    }

    console.log("Waiting for approval", { end: "" });
    const start = Date.now();

    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      process.stdout.write(".");

      try {
        const res = await fetch(
          `${serverUrl}/api/bridge/auth/exchange?code=${code}`,
        );
        if (res.status === 410) {
          console.error("\nCode expired. Run qf login again.");
          process.exit(1);
        }
        if (!res.ok) continue;

        const data = (await res.json()) as ExchangeResponse;
        if (data.status === "ok" && data.token && data.workspaceId && data.email) {
          saveCredentials({
            token: data.token,
            workspaceId: data.workspaceId,
            email: data.email,
            serverUrl,
          });
          console.log(`\n\nLogged in as ${data.email} (workspace ${data.workspaceId})`);
          return;
        }
      } catch {
        // network error — keep polling
      }
    }

    console.error("\nLogin timed out. Run qf login again.");
    process.exit(1);
  });
