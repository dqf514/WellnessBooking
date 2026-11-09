export type TokenKind = "staff" | "member";

export function getToken(kind: TokenKind = "staff") {
  return localStorage.getItem(kind === "staff" ? "wellness_staff_token" : "wellness_member_token");
}

export async function apiFetch<T>(path: string, options: { method?: string; json?: unknown; body?: FormData; tokenKind?: TokenKind } = {}): Promise<T> {
  const token = getToken(options.tokenKind);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { method: options.method ?? "GET", headers, body: options.body ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined) });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data === "object" && data && "detail" in data ? String(data.detail) : text || `请求失败 (${response.status})`;
    throw new Error(detail);
  }
  return data as T;
}

export async function downloadFile(path: string, filename: string, tokenKind: TokenKind = "staff") {
  const token = getToken(tokenKind);
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
