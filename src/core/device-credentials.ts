// Device pairing credentials — stored alongside the workspace credentials.
// The v0.3 `qf pair` flow writes here; future device-mode commands read.
//
// File layout: ~/.config/q-factory/device.json
//   { deviceId, deviceToken, serverUrl, pairedAt }
//
// The token is the raw 32-byte hex string the server returned from
// /api/devices/pair-check. The server stores only its sha256 hash; the
// raw value never leaves this file.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

export interface DeviceCredentials {
  deviceId: string;
  deviceToken: string;
  serverUrl: string;
  pairedAt: string;
}

function devicePath(): string {
  return (
    process.env.QF_DEVICE_PATH ??
    join(homedir(), ".config", "q-factory", "device.json")
  );
}

export function loadDeviceCredentials(): DeviceCredentials {
  const path = devicePath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `No paired device found. Run: qf pair\n(device file not found at ${path})`,
    );
  }
  try {
    return JSON.parse(raw) as DeviceCredentials;
  } catch {
    throw new Error(`Corrupt device file at ${path}. Run: qf pair`);
  }
}

export function saveDeviceCredentials(creds: DeviceCredentials): void {
  const path = devicePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2), { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // non-fatal on Windows
  }
}
