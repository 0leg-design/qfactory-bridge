import { z } from "zod";
import { apiPost } from "../http.js";
import { listProcesses } from "./qf.js";

// Operations Factory E4 — launch an incident-coordinator run from the terminal.
// The bridge package is self-contained (it does not import the Next app's lib/),
// so the coordinator process is located by its well-known name. Keep this in sync
// with INCIDENT_COORDINATOR_NAME in lib/processes/presets/incident-coordinator.ts.
export const INCIDENT_COORDINATOR_NAME = "Incident Coordinator";

export const COORDINATOR_PRESETS = ["incident-coordinator"] as const;
export type CoordinatorPreset = (typeof COORDINATOR_PRESETS)[number];

interface ProcessRow {
  id: string;
  name: string;
}

/** Find the seeded coordinator process for the active workspace, by name. */
export async function findCoordinatorProcess(
  name: string = INCIDENT_COORDINATOR_NAME,
): Promise<ProcessRow | null> {
  const rows = (await listProcesses()) as ProcessRow[];
  return rows.find((p) => p.name === name) ?? null;
}

export const launchCoordinatorInput = z.object({
  preset: z.enum(COORDINATOR_PRESETS).default("incident-coordinator"),
  intent: z.string().min(1),
  // Extra run params merged into the webhook body alongside `intent`.
  params: z.record(z.string(), z.unknown()).optional(),
});

export interface LaunchCoordinatorResult {
  ok: boolean;
  processId: string;
  accepted?: boolean;
}

/**
 * Launch a coordinator run: locate the seeded coordinator process, then POST the
 * intent to its inbound webhook (the same path the dashboard "Run" uses). The run
 * starts on the server and the coordinator's delegate steps fan out to the
 * worker. Returns the accepted-run acknowledgement.
 */
export async function launchCoordinator(
  input: z.infer<typeof launchCoordinatorInput>,
): Promise<LaunchCoordinatorResult> {
  const p = launchCoordinatorInput.parse(input);
  const proc = await findCoordinatorProcess();
  if (!proc) {
    throw new Error(
      `No "${INCIDENT_COORDINATOR_NAME}" process found in this workspace. ` +
        `Seed it on the server first:\n` +
        `  npx tsx db/seeds/builtin-incident-coordinator.ts <workspaceId>`,
    );
  }
  return apiPost<LaunchCoordinatorResult>(
    `/api/webhooks/process/${proc.id}`,
    { intent: p.intent, ...(p.params ?? {}) },
  );
}
