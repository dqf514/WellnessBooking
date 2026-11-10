import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Badge, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { ApiKey, ApiKeyLog, ApiScopeOption } from "@/types";

const scopeNames: Record<string, [string, string]> = {
  read: ["全部只读", "Read all"],
  "members:write": ["会员与卡务写入", "Members & cards write"],
  "bookings:write": ["预约与签到写入", "Bookings & check-in write"],
  "schedule:write": ["排课与教室占用写入", "Schedule write"],
  "catalog:write": ["课程 / 教室 / 教练写入", "Catalog write"],
  "finance:write": ["产品与财务写入", "Products & finance write"],
  "settings:write": ["系统与短信设置写入", "Settings write"],
  "maintenance:write": ["数据维护写入", "Maintenance write"],
};

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ApiKeysSettings() {
  const { local } = useLanguage();
  const [items, setItems] = useState<ApiKey[]>([]);
  const [scopeOptions, setScopeOptions] = useState<ApiScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [expiryMode, setExpiryMode] = useState("90");
  const [customExpiry, setCustomExpiry] = useState("");
  const [active, setActive] = useState(true);
  const [secret, setSecret] = useState<{ value: string; name: string; rotated: boolean } | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<{ action: "rotate" | "delete"; row: ApiKey } | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logKey, setLogKey] = useState<ApiKey | null>(null);
  const [logs, setLogs] = useState<ApiKeyLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logResult, setLogResult] = useState("all");
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  async function load() {
    try {
      const result = await apiFetch<{ items: ApiKey[]; scope_options: ApiScopeOption[] }>("/api/admin/api-keys");
      setItems(result.items);
      setScopeOptions(result.scope_options);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : local("加载失败", "Loading failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setScopes(["read"]);
    setExpiryMode("90");
    setCustomExpiry("");
    setActive(true);
    setFormOpen(true);
  }

  function openEdit(row: ApiKey) {
    setEditing(row);
    setName(row.name);
    setScopes(row.scopes);
    setExpiryMode(row.expires_at ? "custom" : "never");
    setCustomExpiry(row.expires_at ? row.expires_at.slice(0, 16).replace(" ", "T") : "");
    setActive(row.active);
    setFormOpen(true);
  }

  function expiryPayload() {
    if (expiryMode === "never") return null;
    if (expiryMode === "custom") return customExpiry;
    const expires = new Date();
    expires.setDate(expires.getDate() + Number(expiryMode));
    return localDateTime(expires);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await apiFetch(`/api/admin/api-keys/${editing.id}`, { method: "PATCH", json: { name, scopes, expires_at: expiryPayload(), active } });
      } else {
        const result = await apiFetch<{ item: ApiKey; api_key: string }>("/api/admin/api-keys", { method: "POST", json: { name, scopes, expires_at: expiryPayload() } });
        setCopied(false); setSecret({ value: result.api_key, name: result.item.name, rotated: false });
      }
      setFormOpen(false);
      setMessage(local(editing ? "API Key 已更新" : "API Key 已创建", editing ? "API key updated" : "API key created"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : local("保存失败", "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function performConfirmedAction() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === "rotate") {
        const result = await apiFetch<{ item: ApiKey; api_key: string }>(`/api/admin/api-keys/${confirm.row.id}/rotate`, { method: "POST" });
        setCopied(false); setSecret({ value: result.api_key, name: result.item.name, rotated: true });
      } else {
        await apiFetch(`/api/admin/api-keys/${confirm.row.id}`, { method: "DELETE" });
        setMessage(local("API Key 已移入回收站，历史使用日志仍保留", "API key deleted; historical usage logs are retained"));
      }
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : local("操作失败", "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revealCopy() {
    if (!secret) return;
    try {
      await copyText(secret.value);
      setCopied(true);
      setError("");
    } catch {
      setError(local("自动复制失败，请显示密钥后手动复制", "Automatic copy failed. Reveal and copy the secret manually."));
    }
  }

  async function loadLogs(page: number, key: ApiKey | null = logKey, outcome: string = logResult) {
    setLogsLoading(true);
    try {
      const result = await apiFetch<{ items: ApiKeyLog[]; total: number; page: number }>(`/api/admin/api-key-logs?key_id=${key?.id ?? 0}&result=${outcome}&page=${page}`);
      setLogs(result.items);
      setLogTotal(result.total);
      setLogPage(result.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : local("日志加载失败", "Failed to load logs"));
    } finally {
      setLogsLoading(false);
    }
  }

  function openLogs(row: ApiKey | null) {
    setLogKey(row);
    setLogResult("all");
    setLogsOpen(true);
    void loadLogs(1, row, "all");
  }

  if (loading) return <Spinner/>;
  return <section className="settings-section api-key-settings">
    <section className="sms-info api-key-intro"><strong>{local("API 接入凭证", "API access credentials")}</strong><p>{local("密钥仅保存不可逆哈希，完整内容只在创建或轮换时显示一次。请按最小权限分配范围，并优先设置有效期。", "Only irreversible hashes are stored. The full secret appears once after creation or rotation. Grant minimum scopes and prefer an expiration date.")}</p><a href="/api-docs.html" target="_blank" rel="noreferrer">{local("查看 API 对接文档", "Open API reference")} →</a></section>
    <div className="settings-action-row"><p>{local("API Key 不能用于密钥管理、修改密码或会员端接口；权限同时受创建人当前角色限制。", "API keys cannot manage keys, change passwords or access member endpoints. The creator's current role also limits access.")}</p><div className="api-key-header-actions"><button className="button button-outline" type="button" onClick={() => openLogs(null)}>{local("全部使用日志", "All usage logs")}</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17}/>{local("新建 API Key", "Create API key")}</button></div></div>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>} 
    <div className="panel table-panel"><ResponsiveTable><table className="data-table api-key-table"><thead><tr><th>{local("名称 / 密钥标识", "Name / identifier")}</th><th>{local("权限范围", "Scopes")}</th><th>{local("有效期", "Expires")}</th><th>{local("最近使用", "Last used")}</th><th>{local("状态", "Status")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><code className="api-key-mask">{row.masked_key}</code><small>{local("创建人", "Creator")}: {row.creator_name}</small></td><td><div className="scope-list">{row.scopes.map((scope) => <span className="scope-chip" key={scope}>{local(...(scopeNames[scope] ?? [scope, scope]))}</span>)}</div></td><td>{row.expires_at || local("永不过期", "Never")}<small>{row.rotated_at ? `${local("已轮换", "Rotated")}: ${row.rotated_at}` : ""}</small></td><td>{row.last_used_at || local("尚未使用", "Never used")}<small>{row.last_used_ip || ""} · {row.usage_count} {local("次调用", "calls")}</small></td><td><Badge tone={row.expired ? "red" : row.active ? "green" : "neutral"}>{row.expired ? local("已过期", "Expired") : row.active ? local("启用", "Active") : local("停用", "Inactive")}</Badge></td><td><div className="api-key-row-actions"><button className="text-button" type="button" onClick={() => openEdit(row)}>{local("编辑", "Edit")}</button><button className="text-button" type="button" onClick={() => openLogs(row)}>{local("日志", "Logs")}</button><button className="text-button" type="button" onClick={() => setConfirm({ action: "rotate", row })}>{local("轮换", "Rotate")}</button><button className="text-button danger" type="button" onClick={() => setConfirm({ action: "delete", row })}>{local("删除", "Delete")}</button></div></td></tr>)}</tbody></table></ResponsiveTable>{!items.length && <div className="empty-state"><p>{local("尚未创建 API Key。仅在确有系统对接需求时创建，并遵循最小权限原则。", "No API keys yet. Create one only for a real integration and grant minimum access.")}</p></div>}</div>

    {formOpen && <Modal title={editing ? local("编辑 API Key", "Edit API key") : local("新建 API Key", "Create API key")} onClose={() => setFormOpen(false)} wide><form className="form-grid" onSubmit={save}><Field label={local("密钥名称", "Key name")} hint={local("填写用途或系统名称，例如：会员数据同步", "Use a purpose or integration name, e.g. Member sync")}><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={local("例如：CRM 数据同步", "e.g. CRM data sync")}/></Field><div className="form-grid two-columns"><Field label={local("有效期", "Expiration")}><select value={expiryMode} onChange={(event) => setExpiryMode(event.target.value)}><option value="30">{local("30 天", "30 days")}</option><option value="90">{local("90 天（推荐）", "90 days (recommended)")}</option><option value="365">{local("365 天", "365 days")}</option><option value="custom">{local("自定义时间", "Custom date")}</option><option value="never">{local("永不过期（不推荐）", "Never (not recommended)")}</option></select></Field>{expiryMode === "custom" && <Field label={local("到期时间", "Expires at")}><input required type="datetime-local" value={customExpiry} onChange={(event) => setCustomExpiry(event.target.value)}/></Field>}</div><fieldset className="scope-fieldset"><legend>{local("权限范围（至少一项）", "Scopes (select at least one)")}</legend><p>{local("只读包含后台数据、报表和日志读取；写入权限按业务模块独立授权。", "Read covers business data, reports and logs. Write access is granted separately by module.")}</p><div className="scope-options">{scopeOptions.map((option) => { const labels = scopeNames[option.id] ?? [option.id, option.id]; return <label className={scopes.includes(option.id) ? "selected" : ""} key={option.id}><input type="checkbox" checked={scopes.includes(option.id)} onChange={(event) => setScopes(event.target.checked ? [...scopes, option.id] : scopes.filter((scope) => scope !== option.id))}/><span><strong>{local(...labels)}</strong><code>{option.id}</code><small>{local(option.description, option.id === "read" ? "Read business data, reports and logs" : `Allows ${labels[1].toLowerCase()} operations`)}</small></span></label>; })}</div></fieldset>{editing && <label className="checkbox-label"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/>{local("启用此 API Key（停用后立即拒绝调用）", "Enable this API key (disabled keys are rejected immediately)")}</label>}<button className="button button-primary button-full" disabled={busy || !scopes.length} type="submit">{busy ? local("保存中…", "Saving…") : editing ? local("保存修改", "Save changes") : local("创建并显示完整密钥", "Create & reveal secret")}</button></form></Modal>}

    {secret && <Modal title={secret.rotated ? local("新 API Key 已生成", "New API key generated") : local("API Key 创建成功", "API key created")} onClose={() => { setSecret(null); setRevealSecret(false); }}><div className="secret-reveal">{error && <Notice error message={error}/>}<div className="secret-warning"><strong>{local("请立即复制并安全保存", "Copy and store it securely now")}</strong><p>{secret.rotated ? local("旧密钥已立即失效。新密钥关闭后无法再次查看或复制。", "The old secret is now invalid. This new secret cannot be viewed or copied after closing.") : local("完整密钥仅显示这一次。系统之后只能显示掩码，无法恢复明文。", "This full secret is shown only once. Only its masked identifier will be available later.")}</p></div><Field label={secret.name}><div className="secret-input"><input aria-label={local("完整 API Key", "Full API key")} readOnly type={revealSecret ? "text" : "password"} autoComplete="off" value={secret.value} onFocus={(event) => event.target.select()}/><button className="button button-outline" type="button" onClick={() => setRevealSecret(!revealSecret)}>{revealSecret ? local("隐藏", "Hide") : local("查看", "Reveal")}</button></div></Field><button className="button button-primary button-full" type="button" onClick={() => void revealCopy()}>{copied ? local("已复制，请安全保存", "Copied — store it securely") : local("复制完整密钥", "Copy full secret")}</button><p className="form-help">{local("调用时放入请求头 X-API-Key，不要写入前端代码、URL、截图或公开仓库。", "Send it in the X-API-Key header. Never put it in frontend code, URLs, screenshots or public repositories.")}</p><button className="button button-outline button-full" type="button" onClick={() => { setSecret(null); setRevealSecret(false); }}>{local("我已安全保存，关闭", "I have saved it securely — close")}</button></div></Modal>}

    {confirm && <Modal title={confirm.action === "rotate" ? local("确认轮换 API Key", "Rotate API key?") : local("确认删除 API Key", "Delete API key?")} onClose={() => setConfirm(null)}><div className="logout-confirmation"><span className="logout-confirmation-icon"><Icon name="settings" size={25}/></span><p>{confirm.action === "rotate" ? local(`将为“${confirm.row.name}”生成新密钥，旧密钥立即失效。使用该密钥的系统必须更新配置。`, `A new secret will be generated for “${confirm.row.name}”. The old secret becomes invalid immediately and integrations must be updated.`) : local(`将把“${confirm.row.name}”移入回收站，调用会立即被拒绝。历史使用日志会保留，管理员可恢复；满 180 天后才能彻底删除。`, `“${confirm.row.name}” will be moved to the recycle bin and rejected immediately. Historical logs remain and an administrator can restore it. Permanent deletion is available only after 180 days.`)}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={() => setConfirm(null)}>{local("取消", "Cancel")}</button><button className="button button-primary" disabled={busy} type="button" onClick={() => void performConfirmedAction()}>{confirm.action === "rotate" ? local("确认轮换", "Rotate key") : local("确认删除", "Delete key")}</button></div></div></Modal>}

    {logsOpen && <Modal title={logKey ? local(`${logKey.name} · 使用日志`, `${logKey.name} · Usage logs`) : local("API Key 全部使用日志", "All API key usage logs")} onClose={() => setLogsOpen(false)} wide><div className="api-log-toolbar"><select aria-label={local("调用结果", "Request result")} value={logResult} onChange={(event) => { setLogResult(event.target.value); void loadLogs(1, logKey, event.target.value); }}><option value="all">{local("全部结果", "All results")}</option><option value="success">{local("成功（状态码 < 400）", "Success (status < 400)")}</option><option value="denied">{local("失败 / 拒绝（状态码 ≥ 400）", "Failed / denied (status ≥ 400)")}</option></select><button className="button button-outline" type="button" onClick={() => void loadLogs(logPage)}>{local("刷新", "Refresh")}</button></div>{logsLoading ? <Spinner/> : <><ResponsiveTable><table className="data-table api-log-table"><thead><tr><th>{local("时间", "Time")}</th>{!logKey && <th>{local("密钥", "Key")}</th>}<th>{local("请求", "Request")}</th><th>{local("状态码", "Status")}</th><th>IP</th></tr></thead><tbody>{logs.map((row) => <tr key={row.id}><td>{row.created_at}</td>{!logKey && <td>{row.key_name}<small>{row.key_prefix}</small></td>}<td><span className={`log-method method-${row.method.toLowerCase()}`}>{row.method}</span><code>{row.path}</code></td><td><Badge tone={row.status_code < 400 ? "green" : "red"}>{row.status_code}</Badge></td><td>{row.ip || "—"}</td></tr>)}</tbody></table></ResponsiveTable>{!logs.length && <div className="empty-state"><p>{local("暂无匹配的调用日志", "No matching usage logs")}</p></div>}<div className="api-log-pagination"><span>{local(`共 ${logTotal} 条，每页 20 条`, `${logTotal} entries · 20 per page`)}</span><div><button className="button button-outline" disabled={logPage <= 1} type="button" onClick={() => void loadLogs(logPage - 1)}>{local("上一页", "Previous")}</button><span>{logPage}</span><button className="button button-outline" disabled={logPage * 20 >= logTotal} type="button" onClick={() => void loadLogs(logPage + 1)}>{local("下一页", "Next")}</button></div></div></>}</Modal>}
  </section>;
}
