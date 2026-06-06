import { z } from "zod";
import { apiPost } from "../http.js";

export const reportStatusInput = z.object({
  taskId: z.string().min(1),
  status: z.enum(["inbox", "backlog", "todo", "progress", "human", "done"]),
  note: z.string().optional(),
});

export type ReportStatusInput = z.infer<typeof reportStatusInput>;

export async function reportStatus(input: ReportStatusInput): Promise<{ ok: boolean }> {
  const parsed = reportStatusInput.parse(input);
  return apiPost("/api/bridge/report_status", parsed);
}
