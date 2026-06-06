import { loadCredentials } from "./credentials.js";

// Lazy-loaded on first call — supports MCP server startup before login.
let _creds: ReturnType<typeof loadCredentials> | null = null;

function creds() {
  if (!_creds) _creds = loadCredentials();
  return _creds;
}

export function invalidateCredentials() {
  _creds = null;
}

export async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const { token, serverUrl } = creds();
  const url = `${serverUrl}${path}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return res;
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = params
    ? `${path}?${new URLSearchParams(params).toString()}`
    : path;
  const res = await apiFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}
