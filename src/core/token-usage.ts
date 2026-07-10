// Parse token/cost usage out of an agent CLI's own output so the device daemon
// can report it to the server (→ a cost_event tagged source="cli"). Best-effort
// and never throws: agent CLIs print usage in many shapes and may print none.
//
// Recognized shapes (most precise → least), case-insensitive:
//
//   1. claude -p --output-format json / stream-json — a JSON object/line with
//      a `usage` field { input_tokens, output_tokens } and optionally
//      `total_cost_usd` (and `model`). We scan every {...} block in the output
//      and take the LAST one that carries a usage shape (the final result).
//   2. codex exec — a "tokens used: 1234" / "input: 1,200  output: 340" summary.
//   3. Generic prose — "1200 input tokens, 340 output tokens" / "prompt
//      tokens: 1200, completion tokens: 340".
//
// Pure + deterministic → unit-testable. Returns null when nothing parses.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** USD cost when the CLI prints it (claude does; codex usually doesn't). */
  costUsd?: number;
  /** Model id when the CLI prints it. */
  model?: string;
}

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[,_\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// Pull a usage shape out of a parsed JSON value (claude --output-format json).
// Handles both flat `{ input_tokens, output_tokens }` and nested `{ usage: …}`.
function fromJsonValue(v: unknown): TokenUsage | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const usage =
    obj.usage && typeof obj.usage === "object"
      ? (obj.usage as Record<string, unknown>)
      : obj;

  const inTok =
    num(usage.input_tokens) ??
    num(usage.inputTokens) ??
    num(usage.prompt_tokens) ??
    num(usage.promptTokens);
  const outTok =
    num(usage.output_tokens) ??
    num(usage.outputTokens) ??
    num(usage.completion_tokens) ??
    num(usage.completionTokens);
  if (inTok == null && outTok == null) return null;

  const cost =
    num(obj.total_cost_usd) ??
    num(obj.cost_usd) ??
    num(obj.costUsd) ??
    num((usage as Record<string, unknown>).cost);
  const model =
    typeof obj.model === "string"
      ? obj.model
      : typeof obj.model_id === "string"
        ? (obj.model_id as string)
        : undefined;

  return {
    inputTokens: inTok ?? 0,
    outputTokens: outTok ?? 0,
    ...(cost != null ? { costUsd: cost } : {}),
    ...(model ? { model } : {}),
  };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,_\s$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Scan every balanced {...} block and JSON-parse it; keep the last that yields
// a usage shape. Tolerant of surrounding prose and of stream-json (one obj/line).
function fromJsonBlocks(text: string): TokenUsage | null {
  let last: TokenUsage | null = null;
  // Cheap balanced-brace scan — avoids a heavy JSON streaming parser.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const slice = text.slice(i, j + 1);
          try {
            const parsed = fromJsonValue(JSON.parse(slice));
            if (parsed) last = parsed;
          } catch {
            // not valid JSON — ignore this block
          }
          i = j; // skip past this block
          break;
        }
      }
    }
  }
  return last;
}

function fromProse(text: string): TokenUsage | null {
  const lower = text.toLowerCase();

  // Two orderings, either with the "tokens" word before or after the number:
  //   "input tokens: 1,200" / "input: 1200" / "prompt tokens 1200"
  //   "1,200 input tokens"  / "1200 prompt tokens"
  const inMatch =
    /(?:input|prompt)\s*(?:tokens)?\s*[:=]?\s*([\d,_]+)/i.exec(text) ||
    /([\d,_]+)\s*(?:input|prompt)\s*tokens?/i.exec(text);
  const outMatch =
    /(?:output|completion)\s*(?:tokens)?\s*[:=]?\s*([\d,_]+)/i.exec(text) ||
    /([\d,_]+)\s*(?:output|completion)\s*tokens?/i.exec(text);

  const inTok = toInt(inMatch?.[1]);
  const outTok = toInt(outMatch?.[1]);

  // codex-style "tokens used: 1234" (no in/out split) → treat as combined input.
  const totalMatch = /tokens?\s*used\s*[:=]?\s*([\d,_]+)/i.exec(text);
  const total = toInt(totalMatch?.[1]);

  if (inTok == null && outTok == null && total == null) return null;

  // "$0.0123" / "cost: $0.0123" / "total cost: 0.0123 usd"
  const costMatch =
    /(?:total\s+)?cost\s*[:=]?\s*\$?\s*([\d.]+)/i.exec(lower) ||
    /\$\s*([\d.]+)/.exec(text);
  const cost = costMatch ? Number(costMatch[1]) : null;

  return {
    inputTokens: inTok ?? total ?? 0,
    outputTokens: outTok ?? 0,
    ...(cost != null && Number.isFinite(cost) ? { costUsd: cost } : {}),
  };
}

/**
 * Parse token/cost usage from an agent CLI's combined stdout+stderr.
 * Returns null when nothing usable is found (the common case for plain
 * `claude -p` prose output — then we report a CLI run with zero tokens so the
 * UI can still count it honestly as "tokens pending").
 */
export function parseTokenUsage(output: string): TokenUsage | null {
  if (!output) return null;
  // JSON first (most reliable; claude --output-format json emits exact counts).
  const json = fromJsonBlocks(output);
  if (json && (json.inputTokens > 0 || json.outputTokens > 0 || json.costUsd)) {
    return json;
  }
  return fromProse(output);
}
