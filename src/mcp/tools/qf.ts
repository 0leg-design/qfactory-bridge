import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as qf from "../../core/actions/qf.js";

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export const qfTools: Tool[] = [
  {
    name: "list_stories",
    description:
      "List Q-Factory stories/tasks. Story = vision/intent layer (type idea|story); Task = concrete step (type task|subtask). Filters: type, status (both accept comma-separated values), projectId, parentId, tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "csv of idea|story|task|subtask" },
        status: { type: "string", description: "csv of inbox|backlog|todo|progress|human|done" },
        projectId: { type: "string" },
        parentId: { type: "string", description: "list child tasks of this story" },
        tag: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_story",
    description:
      "Get full detail of one story/task: brief, status, tags, dependencies, repos, wiki links, recent activity timeline, and token/cost rollup.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_story",
    description:
      "Create a story (vision-level intent: type=story/idea) or a task (concrete step: type=task/subtask). Defaults to type=task. Use parentTaskId to attach a task under a story.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["idea", "story", "task", "subtask"] },
        title: { type: "string" },
        brief: { type: "string" },
        status: { type: "string", enum: ["inbox", "backlog", "todo", "progress", "human", "done"] },
        projectId: { type: "string" },
        parentTaskId: { type: "string" },
        model: { type: "string" },
        vps: { type: "string" },
        externalRef: { type: "string", description: "External tracker ref, e.g. Linear 'AI-12'" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_story",
    description: "Patch a story/task. Only provided fields change.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        brief: { type: "string" },
        type: { type: "string", enum: ["idea", "story", "task", "subtask"] },
        status: { type: "string", enum: ["inbox", "backlog", "todo", "progress", "human", "done"] },
        projectId: { type: "string" },
        model: { type: "string" },
        humanReason: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_activity",
    description:
      "Append an activity entry to a story/task timeline (kind: comment|progress|artifact|test|source|note|...). Use this to log what you did.",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" },
        content: { type: "string" },
        kind: { type: "string" },
        role: { type: "string", enum: ["user", "agent", "system"] },
        model: { type: "string" },
      },
      required: ["taskId", "content"],
    },
  },
  {
    name: "list_processes",
    description: "List processes (reusable workflows) with their ordered steps.",
    inputSchema: {
      type: "object" as const,
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "create_process",
    description: "Create a process (reusable workflow).",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        triggerKind: { type: "string", enum: ["recurring", "triggered", "manual"] },
        projectId: { type: "string" },
        cronExpression: { type: "string" },
        webhookUrl: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "link_story_process",
    description: "Link a story/task to a process (sets its originating process).",
    inputSchema: {
      type: "object" as const,
      properties: { storyId: { type: "string" }, processId: { type: "string" } },
      required: ["storyId", "processId"],
    },
  },
  {
    name: "create_signal",
    description:
      "Ingest a normalized stimulus (Signal) that may create/update Stories. type is free-form: repo_change|metric_drop|ds_mismatch|mcp_error|test|ci_failure|...",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string" },
        source: { type: "string" },
        severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
        payload: { type: "object", description: "structured details (any shape)" },
        relatedEntities: { type: "array", description: "[{kind,ref,label?}]" },
      },
      required: ["type"],
    },
  },
  {
    name: "list_signals",
    description: "List signals. Filter by type, severity, unprocessed (true = not yet triaged into stories).",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string" },
        severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
        unprocessed: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "link_signal_story",
    description:
      "Link a Signal to a Story/Task (triage). Marks the signal processed by default. linkType: created|updated|related.",
    inputSchema: {
      type: "object" as const,
      properties: {
        signalId: { type: "string" },
        storyId: { type: "string" },
        linkType: { type: "string", enum: ["created", "updated", "related"] },
        markProcessed: { type: "boolean" },
      },
      required: ["signalId", "storyId"],
    },
  },
  {
    name: "promote_signal",
    description:
      "Turn a Signal into a new Story (L1 triage, deterministic). Pre-fills title/brief from the signal, links them, marks the signal processed. Pass title/brief to override the auto-generated text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        signalId: { type: "string" },
        type: { type: "string", enum: ["idea", "story", "task", "subtask"] },
        title: { type: "string" },
        brief: { type: "string" },
        projectId: { type: "string" },
      },
      required: ["signalId"],
    },
  },
  {
    name: "draft_signal",
    description:
      "Turn a Signal into a Story using an LLM (OpenRouter BYOK) to draft a meaningful title/brief/type, then create + link + mark processed + log cost. Requires an active OpenRouter key; otherwise use promote_signal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        signalId: { type: "string" },
        model: { type: "string", description: "OpenRouter model id (optional)" },
        projectId: { type: "string" },
      },
      required: ["signalId"],
    },
  },
];

export const qfHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  list_stories: async (a) => ok(await qf.listStories(qf.listStoriesInput.parse(a))),
  get_story: async (a) => ok(await qf.getStory(qf.getStoryInput.parse(a))),
  create_story: async (a) => ok(await qf.createStory(qf.createStoryInput.parse(a))),
  update_story: async (a) => ok(await qf.updateStory(qf.updateStoryInput.parse(a))),
  add_activity: async (a) => ok(await qf.addActivity(qf.addActivityInput.parse(a))),
  list_processes: async (a) => ok(await qf.listProcesses(qf.listProcessesInput.parse(a))),
  create_process: async (a) => ok(await qf.createProcess(qf.createProcessInput.parse(a))),
  link_story_process: async (a) =>
    ok(await qf.linkStoryProcess(qf.linkStoryProcessInput.parse(a))),
  create_signal: async (a) => ok(await qf.createSignal(qf.createSignalInput.parse(a))),
  list_signals: async (a) => ok(await qf.listSignals(qf.listSignalsInput.parse(a))),
  link_signal_story: async (a) =>
    ok(await qf.linkSignalStory(qf.linkSignalStoryInput.parse(a))),
  promote_signal: async (a) => ok(await qf.promoteSignal(qf.promoteSignalInput.parse(a))),
  draft_signal: async (a) => ok(await qf.draftSignal(qf.draftSignalInput.parse(a))),
};
