import { useEffect, useState } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Badge, Empty, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

type LogRow = Record<string, string | number | null>;

export function LogsSettings() {
  const { admin: a, local } = useLanguage();
  const [kind, setKind] = useState<"operation" | "sms">("operation");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); try { const result = await apiFetch<{ items: LogRow[]; total: number }>(`/api/admin/logs?kind=${kind}&q=${encodeURIComponent(query)}`); setRows(result.items); setTotal(result.total); } catch (err) { setError(err instanceof Error ? err.message : "日志加载失败"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [kind]);
  return <section className="settings-section"><div className="filter-panel"><div className="sub-tabs"><button className={kind === "operation" ? "active" : ""} type="button" onClick={() => setKind("operation")}>{a("操作审计")}</button><button className={kind === "sms" ? "active" : ""} type="button" onClick={() => setKind("sms")}>{a("短信发送日志")}</button></div><Field label={kind === "sms" ? a("手机号") : a("操作账号")}><input value={query} onChange={(event) => setQuery(event.target.value)}/></Field><button className="button button-primary" type="button" onClick={() => void load()}>{a("查询")}</button><span className="filter-summary">{local(`共 ${total} 条，显示最近 50 条`, `${total} entries; showing the latest 50`)}</span></div>{error && <Notice error message={error}/>} {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable>{kind === "operation" ? <table className="data-table"><thead><tr><th>{a("时间")}</th><th>{a("账号 / 角色")}</th><th>{a("类别")}</th><th>{a("操作")}</th><th>{a("对象")}</th><th>{a("详情")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.actor_username}<small>{a(String(row.actor_role ?? ""))}</small></td><td>{a(String(row.category ?? ""))}</td><td><Badge>{a(String(row.action ?? ""))}</Badge></td><td>{a(String(row.entity ?? ""))} #{row.entity_id}</td><td><code className="log-detail">{row.detail_json || "—"}</code></td></tr>)}</tbody></table> : <table className="data-table"><thead><tr><th>{a("时间")}</th><th>{a("用途")}</th><th>{a("手机号")}</th><th>{a("状态")}</th><th>{a("原因")}</th><th>{a("内容 / 回包")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{a(String(row.purpose ?? ""))}<small>{row.booking_id ? local(`预约 #${row.booking_id}`, `Booking #${row.booking_id}`) : ""}</small></td><td>{row.phone}</td><td><Badge tone={row.status === "sent" ? "green" : row.status === "blocked" ? "amber" : "red"}>{a(String(row.status ?? ""))}</Badge></td><td>{a(String(row.reason ?? ""))}</td><td><code className="log-detail">{row.content}<br/>{row.provider_json}</code></td></tr>)}</tbody></table>}</ResponsiveTable>{rows.length === 0 && <Empty>{a("暂无匹配日志")}</Empty>}</section>}</section>;
}
