import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  createContextDoc,
  createContextDocInput,
  updateContextDoc,
  updateContextDocInput,
} from "../../core/actions/context_docs.js";

// ── create_context_doc ────────────────────────────────────────────────────────

export const createContextDocTool: Tool = {
  name: "create_context_doc",
  description:
    "Create a new workspace context document (knowledge base entry). " +
    "Use kind='pinned' for always-injected context, 'memory' for editable memory, 'doc' for reference docs. " +
    "The document is attributed as editor='agent' automatically.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Document title (max 256 chars)" },
      bodyMd: {
        type: "string",
        description: "Document body in Markdown format",
      },
      kind: {
        type: "string",
        enum: ["doc", "memory", "pinned"],
        description: "doc=reference knowledge, memory=editable agent memory, pinned=always injected into context",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags for categorisation (max 20, each max 32 chars)",
      },
      projectId: {
        type: "string",
        description: "Optional project ID to scope this doc to a specific project",
      },
    },
    required: ["title"],
  },
};

export async function handleCreateContextDoc(args: Record<string, unknown>) {
  const result = await createContextDoc(createContextDocInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

// ── update_context_doc ────────────────────────────────────────────────────────

export const updateContextDocTool: Tool = {
  name: "update_context_doc",
  description:
    "Update an existing workspace context document by ID. " +
    "All fields are optional — only those provided are updated. " +
    "The document is re-attributed as editor='agent' automatically.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "Context doc ID to update" },
      title: { type: "string", description: "New title (max 256 chars)" },
      bodyMd: { type: "string", description: "New body in Markdown format" },
      kind: {
        type: "string",
        enum: ["doc", "memory", "pinned"],
        description: "New kind value",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Replacement tag list (max 20)",
      },
    },
    required: ["id"],
  },
};

export async function handleUpdateContextDoc(args: Record<string, unknown>) {
  const result = await updateContextDoc(updateContextDocInput.parse(args));
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
