import { translateAdminMessage } from "./adminMessages";

export type TokenKind = "staff" | "member";

/** 后端提示统一是中文；英文界面下按映射表翻译，未收录的保持原文。 */
function localizeDetail(detail: string): string {
  return localStorage.getItem("wellness_language") === "en" ? translateAdminMessage(detail) : detail;
}

export const UNAUTHORIZED_EVENT = "wellness:unauthorized";

export function getToken(kind: TokenKind = "staff") {
  return localStorage.getItem(kind === "staff" ? "wellness_staff_token" : "wellness_member_token");
}

/** 登录态失效时统一清理本地令牌并通知上层，避免后台停留在“已登录”但所有请求都 401 的状态。 */
export function handleUnauthorized(kind: TokenKind) {
  localStorage.removeItem(kind === "staff" ? "wellness_staff_token" : "wellness_member_token");
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: kind }));
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
    if (response.status === 401 && token && !path.includes("/auth/login") && !path.includes("/auth/sms")) handleUnauthorized(options.tokenKind ?? "staff");
    const error = new Error(localizeDetail(detail)) as Error & { status?: number };
    error.status = response.status;
    throw error;
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


export async function viewFile(path: string, tokenKind: TokenKind = "staff") {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("请允许浏览器打开新窗口后重试");
  const token = getToken(tokenKind);
  try {
    const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(await response.text());
    const url = URL.createObjectURL(await response.blob());
    preview.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    preview.close();
    throw error;
  }
}
