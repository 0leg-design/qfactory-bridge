// Device pairing credentials — stored alongside the workspace credentials.
// The `qf pair` flow writes here; device-mode commands read.
//
// File layout: ~/.config/qfactory/device.json
//
//   v2 (current)
//   { version: 2, active: "<deviceId>", devices: [ { deviceId, deviceToken,
//     serverUrl, pairedAt, label?, workspaceSlug?, disabled? }, … ] }
//
//   v1 (legacy, still read)
//   { deviceId, deviceToken, serverUrl, pairedAt }
//
// WHY v2 EXISTS. v1 held exactly ONE binding and `saveDeviceCredentials` overwrote
// the file, so pairing a second workspace — or re-pairing the same one — silently
// destroyed the previous binding. Nothing said so. The server row survived (the
// pair-claim endpoint INSERTS a device, it never replaces one), so the dashboard
// went on listing a device this machine could no longer authenticate as: a row that
// looks live and is actually orphaned. The owner's call (2026-07-20) was to allow
// several bindings at once, make them visible from the CLI, and let one be disabled
// without destroying it.
//
// A v1 file is migrated on READ, in memory, and persisted the next time anything
// writes — so an existing install keeps working and never has to re-pair.
//
// The token is the raw 32-byte hex string the server returned from
// /api/devices/pair-check. The server stores only its sha256 hash; the raw value
// never leaves this file (mode 0600).

import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "fs";
import { dirname } from "path";
import { configPath } from "./config.js";

export interface DeviceCredentials {
  deviceId: string;
  deviceToken: string;
  serverUrl: string;
  pairedAt: string;
  /** Human label chosen at pair time; shown by `qf devices --local`. */
  label?: string;
  /** Workspace this binding belongs to, when the server told us. */
  workspaceSlug?: string;
  /**
   * Kept but not used. `qf device disable` sets this so a binding can be parked
   * without throwing away its token — the difference between "not now" and
   * "gone", which unpair alone could not express.
   */
  disabled?: boolean;
}

interface DeviceFileV2 {
  version: 2;
  /** deviceId of the binding every device-mode command uses. */
  active: string | null;
  devices: DeviceCredentials[];
}

function devicePath(): string {
  return process.env.QF_DEVICE_PATH ?? configPath("device.json");
}

function isV1(x: unknown): x is DeviceCredentials {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as DeviceCredentials).deviceId === "string" &&
    typeof (x as DeviceCredentials).deviceToken === "string"
  );
}

/** Read the file in whatever version it is on disk and hand back v2. */
function readFile(): DeviceFileV2 | null {
  const path = devicePath();
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Corrupt device file at ${path}. Run: qf pair`);
  }
  if (parsed && typeof parsed === "object" && (parsed as DeviceFileV2).version === 2) {
    const f = parsed as DeviceFileV2;
    return { version: 2, active: f.active ?? null, devices: f.devices ?? [] };
  }
  /* v1 → v2, in memory. Nothing is lost and nothing is written yet: a read must
     never mutate the user's credentials as a side effect. */
  if (isV1(parsed)) {
    return { version: 2, active: parsed.deviceId, devices: [parsed] };
  }
  throw new Error(`Unrecognised device file at ${path}. Run: qf pair`);
}

function writeFile(file: DeviceFileV2): void {
  const path = devicePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2), { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // non-fatal on Windows
  }
}

/** Every binding on this machine, disabled ones included. */
export function listDeviceCredentials(): DeviceCredentials[] {
  return readFile()?.devices ?? [];
}

/** The deviceId currently in use, or null when nothing is paired. */
export function activeDeviceId(): string | null {
  return readFile()?.active ?? null;
}

/**
 * The binding every device-mode command runs as — unchanged contract, so all the
 * existing callers keep working without knowing bindings are now plural.
 *
 * Throws with an actionable message when there is nothing usable: not paired at all,
 * or the active binding has been disabled (which is recoverable, so the error says
 * how rather than telling the user to pair again).
 */
export function loadDeviceCredentials(): DeviceCredentials {
  const file = readFile();
  if (!file || file.devices.length === 0) {
    throw new Error(
      `No paired device found. Run: qf pair\n(device file not found at ${devicePath()})`,
    );
  }
  const usable = file.devices.filter((d) => !d.disabled);
  const active = file.devices.find((d) => d.deviceId === file.active);

  if (active && !active.disabled) return active;
  if (active?.disabled) {
    throw new Error(
      `The active device binding (${active.label ?? active.deviceId}) is disabled.\n` +
        `Re-enable it:  qf device enable ${active.deviceId}\n` +
        `Or switch:     qf device use <deviceId>   (qf devices --local to list)`,
    );
  }
  /* Active points at nothing (hand-edited file, or the binding was removed). Fall
     back to the single remaining binding when the choice is unambiguous; refuse to
     guess when it is not. */
  if (usable.length === 1) return usable[0];
  if (usable.length === 0) {
    throw new Error(
      `Every device binding on this machine is disabled.\n` +
        `Re-enable one:  qf device enable <deviceId>   (qf devices --local to list)`,
    );
  }
  throw new Error(
    `No active device binding, and ${usable.length} are available.\n` +
      `Pick one:  qf device use <deviceId>   (qf devices --local to list)`,
  );
}

/**
 * Add or refresh a binding. Re-pairing the same deviceId REPLACES that entry (a new
 * token for the same device is the point of re-pairing) and leaves every other one
 * alone — which is the whole bug this file exists to fix.
 *
 * The newly paired binding becomes active: pairing is an explicit act, and the thing
 * the user just set up is the thing they mean to use.
 */
export function saveDeviceCredentials(creds: DeviceCredentials): void {
  const file = readFile() ?? { version: 2 as const, active: null, devices: [] };
  const rest = file.devices.filter((d) => d.deviceId !== creds.deviceId);
  writeFile({ version: 2, active: creds.deviceId, devices: [...rest, creds] });
}

/** Switch which binding device-mode commands use. Returns false if unknown. */
export function setActiveDevice(deviceId: string): boolean {
  const file = readFile();
  if (!file?.devices.some((d) => d.deviceId === deviceId)) return false;
  writeFile({ ...file, active: deviceId });
  return true;
}

/**
 * Park or resume a binding without discarding its token.
 *
 * Disabling the ACTIVE binding also clears `active`, so the next command fails with
 * a clear message instead of quietly running as a device the user just parked.
 */
export function setDeviceDisabled(deviceId: string, disabled: boolean): boolean {
  const file = readFile();
  if (!file?.devices.some((d) => d.deviceId === deviceId)) return false;
  const devices = file.devices.map((d) =>
    d.deviceId === deviceId ? { ...d, disabled: disabled || undefined } : d,
  );
  const active = disabled && file.active === deviceId ? null : file.active;
  writeFile({ version: 2, active, devices });
  return true;
}

/** Remove ONE binding. Returns false if unknown. */
export function removeDeviceCredentials(deviceId: string): boolean {
  const file = readFile();
  if (!file?.devices.some((d) => d.deviceId === deviceId)) return false;
  const devices = file.devices.filter((d) => d.deviceId !== deviceId);
  /* Dropping the active one promotes the only survivor when there is exactly one —
     anything else would leave the machine paired but unusable for no reason. */
  const active =
    file.active === deviceId ? (devices.length === 1 ? devices[0].deviceId : null) : file.active;
  writeFile({ version: 2, active, devices });
  return true;
}
