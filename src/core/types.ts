export interface Credentials {
  token: string;
  workspaceId: string;
  email: string;
  serverUrl: string;
}

export type TaskStatus = "inbox" | "backlog" | "todo" | "progress" | "human" | "done";

export interface PendingTask {
  id: string;
  title: string;
  status: TaskStatus;
  type: "story" | "task" | "subtask";
  brief: string | null;
  model: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}
