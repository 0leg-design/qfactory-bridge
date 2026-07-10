import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { dirname } from "path";
import type { Credentials } from "./types.js";
import { configPath } from "./config.js";

function credentialsPath(): string {
  return process.env.QF_CREDENTIALS_PATH ?? configPath("credentials.json");
}

export function loadCredentials(): Credentials {
  const path = credentialsPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Not logged in. Run: qf login\n(credentials not found at ${path})`,
    );
  }
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    throw new Error(`Corrupt credentials at ${path}. Run: qf login`);
  }
}

export function saveCredentials(creds: Credentials): void {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2), { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // non-fatal on Windows
  }
}

export function clearCredentials(): void {
  const path = credentialsPath();
  try {
    writeFileSync(path, "", { encoding: "utf8" });
  } catch {
    // file may not exist
  }
}
