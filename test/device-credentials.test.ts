import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * B5 — re-pairing used to destroy the previous binding, silently.
 *
 * `device.json` held exactly one credential and `saveDeviceCredentials` overwrote the
 * file, so pairing a second workspace (or the same one again) wiped the first. The
 * server side made it worse rather than better: `/api/devices/pair-claim` INSERTS a
 * device row, it never replaces one, so the old device kept existing in the dashboard
 * — looking live — while no machine held a token for it any more.
 *
 * These tests pin the three properties that fix depends on: a second pairing keeps the
 * first, a v1 file still loads, and disabling the active binding fails loudly instead
 * of quietly running as something the user just parked.
 */

function withTempHome(fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "qf-device-"));
  const path = join(dir, "device.json");
  const prev = process.env.QF_DEVICE_PATH;
  process.env.QF_DEVICE_PATH = path;
  try {
    fn(path);
  } finally {
    if (prev === undefined) delete process.env.QF_DEVICE_PATH;
    else process.env.QF_DEVICE_PATH = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

const mod = () => import("../src/core/device-credentials.js");

const creds = (id: string) => ({
  deviceId: id,
  deviceToken: `token-${id}`,
  serverUrl: "https://qfactory.io",
  pairedAt: new Date(0).toISOString(),
});

test("a second pairing KEEPS the first binding", async () => {
  const m = await mod();
  withTempHome(() => {
    m.saveDeviceCredentials(creds("dev-a"));
    m.saveDeviceCredentials(creds("dev-b"));

    const all = m.listDeviceCredentials();
    assert.deepEqual(
      all.map((d) => d.deviceId).sort(),
      ["dev-a", "dev-b"],
      "the first binding was destroyed — this is the exact B5 regression",
    );
    /* The newly paired one is what commands run as: pairing is an explicit act. */
    assert.equal(m.activeDeviceId(), "dev-b");
    assert.equal(m.loadDeviceCredentials().deviceToken, "token-dev-b");
    /* …and the older token is still recoverable, which it was not before. */
    assert.equal(all.find((d) => d.deviceId === "dev-a")?.deviceToken, "token-dev-a");
  });
});

test("re-pairing the SAME device replaces just that entry", async () => {
  const m = await mod();
  withTempHome(() => {
    m.saveDeviceCredentials(creds("dev-a"));
    m.saveDeviceCredentials(creds("dev-b"));
    m.saveDeviceCredentials({ ...creds("dev-a"), deviceToken: "token-rotated" });

    const all = m.listDeviceCredentials();
    assert.equal(all.length, 2, "re-pairing must rotate, not duplicate");
    assert.equal(all.find((d) => d.deviceId === "dev-a")?.deviceToken, "token-rotated");
    assert.equal(all.find((d) => d.deviceId === "dev-b")?.deviceToken, "token-dev-b");
  });
});

test("a v1 file still loads, and is not rewritten by reading it", async () => {
  const m = await mod();
  withTempHome((path) => {
    const v1 = JSON.stringify(creds("legacy"));
    writeFileSync(path, v1);

    assert.equal(m.loadDeviceCredentials().deviceId, "legacy");
    assert.equal(m.listDeviceCredentials().length, 1);
    /* A read must never mutate credentials as a side effect. */
    assert.equal(readFileSync(path, "utf8"), v1);

    /* The next write migrates it, keeping the legacy binding. */
    m.saveDeviceCredentials(creds("new"));
    assert.deepEqual(
      m.listDeviceCredentials().map((d) => d.deviceId).sort(),
      ["legacy", "new"],
    );
  });
});

test("disabling the active binding fails loudly, and says how to recover", async () => {
  const m = await mod();
  withTempHome(() => {
    m.saveDeviceCredentials(creds("dev-a"));
    m.setDeviceDisabled("dev-a", true);

    assert.throws(
      () => m.loadDeviceCredentials(),
      /disabled|qf device enable/i,
      "a parked binding must not silently keep running",
    );
    /* Recoverable: the token was kept, not discarded. */
    m.setDeviceDisabled("dev-a", false);
    m.setActiveDevice("dev-a");
    assert.equal(m.loadDeviceCredentials().deviceToken, "token-dev-a");
  });
});

test("removing the active binding promotes the only survivor", async () => {
  const m = await mod();
  withTempHome(() => {
    m.saveDeviceCredentials(creds("dev-a"));
    m.saveDeviceCredentials(creds("dev-b"));
    m.removeDeviceCredentials("dev-b");

    assert.equal(m.activeDeviceId(), "dev-a", "one binding left, so there is nothing to choose");
    assert.equal(m.loadDeviceCredentials().deviceId, "dev-a");
  });
});

test("with several usable bindings and no active one, it refuses to guess", async () => {
  const m = await mod();
  withTempHome((path) => {
    m.saveDeviceCredentials(creds("dev-a"));
    m.saveDeviceCredentials(creds("dev-b"));
    const f = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...f, active: null }));

    assert.throws(() => m.loadDeviceCredentials(), /qf device use/i);
  });
});
