// Tiny, dependency-free semantic-version comparison. Used by the update check
// and `qf update` to decide whether a newer Bridge is available. Handles the
// numeric core correctly (so `0.2.0` < `0.10.0`, not string-compared) and does a
// best-effort SemVer 2.0.0 prerelease comparison (a prerelease is LOWER than the
// same core release: `0.3.0-beta.1` < `0.3.0`).

interface ParsedVersion {
  main: [number, number, number];
  pre: string[];
}

/** Parse `v1.2.3-beta.4+build` → { main:[1,2,3], pre:["beta","4"] }. Missing
 *  or non-numeric core parts default to 0; build metadata (`+…`) is ignored. */
function parseVersion(raw: string): ParsedVersion {
  const cleaned = String(raw).trim().replace(/^v/i, "");
  const noBuild = cleaned.split("+")[0]; // drop `+build` metadata
  const dashIdx = noBuild.indexOf("-");
  const core = dashIdx === -1 ? noBuild : noBuild.slice(0, dashIdx);
  const pre = dashIdx === -1 ? "" : noBuild.slice(dashIdx + 1);
  const nums = core.split(".").map((n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? v : 0;
  });
  const main: [number, number, number] = [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
  const preIds = pre.length ? pre.split(".").filter((s) => s.length > 0) : [];
  return { main, pre: preIds };
}

/**
 * Compare two version strings. Returns:
 *   -1 when `a` is older than `b`
 *    0 when they are equal
 *    1 when `a` is newer than `b`
 * Correctly numeric (`0.2.0` < `0.10.0`) and SemVer-prerelease aware
 * (`1.0.0-rc.1` < `1.0.0`, `1.0.0-alpha` < `1.0.0-beta`).
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (pa.main[i] !== pb.main[i]) return pa.main[i] < pb.main[i] ? -1 : 1;
  }

  // Equal cores. A version WITHOUT a prerelease outranks one WITH a prerelease.
  const aPre = pa.pre.length > 0;
  const bPre = pb.pre.length > 0;
  if (!aPre && !bPre) return 0;
  if (!aPre) return 1; // a is the full release, b is a prerelease → a newer
  if (!bPre) return -1;

  // Both have prerelease identifiers — compare left to right (SemVer §11.4).
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    if (i >= pa.pre.length) return -1; // fewer identifiers → lower precedence
    if (i >= pb.pre.length) return 1;
    const x = pa.pre[i];
    const y = pb.pre[i];
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const nx = Number(x);
      const ny = Number(y);
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (xn) {
      return -1; // numeric identifiers rank lower than alphanumeric
    } else if (yn) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** True when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
