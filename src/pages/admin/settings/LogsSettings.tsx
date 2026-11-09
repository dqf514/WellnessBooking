import { useEffect, useState } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Badge, Empty, Spinner } from "@/components/UI";
import { apiFetch } from "@/lib/api";

type LogRow = Record<string, string | number | null>;

export function LogsSettings() {
  const [kind, setKind] = useState<"operation" | "sms">("operation");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); try { const result = await apiFetch<{ items: LogRow[]; total: number }>(`/api/admin/logs?kind=${kind}&q=${encodeURIComponent(query)}`); setRows(result.items); setTotal(result.total); } catch (err) { setError(err instanceof Error ? err.message : "日志加载失败"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [kind]);
  return <section className="settings-section"><div className="filter-panel"><div className="sub-tabs"><button className={kind === "operation" ? "active" : ""} type="button" onClick={() => setKind("operation")}>操作审计</button><button className={kind === "sms" ? "active" : ""} type="button" onClick={() => setKind("sms")}>短信发送日志</button></div><Field label={kind === "sms" ? "手机号" : "操作账号"}><input value={query} onChange={(event) => setQuery(event.target.value)}/></Field><button className="button button-primary" type="button" onClick={() => void load()}>查询</button><span className="filter-summary">共 {total} 条，显示最近 50 条</span></div>{error && <Notice error message={error}/>} {loading ? <Spinner/> : <section className="panel table-panel"><div className="responsive-table">{kind === "operation" ? <table className="data-table"><thead><tr><th>时间</th><th>账号 / 角色</th><th>类别</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.actor_username}<small>{row.actor_role}</small></td><td>{row.category}</td><td><Badge>{row.action}</Badge></td><td>{row.entity} #{row.entity_id}</td><td><code className="log-detail">{row.detail_json || "—"}</code></td></tr>)}</tbody></table> : <table className="data-table"><thead><tr><th>时间</th><th>用途</th><th>手机号</th><th>状态</th><th>原因</th><th>内容 / 回包</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.purpose}<small>{row.booking_id ? `预约 #${row.booking_id}` : ""}</small></td><td>{row.phone}</td><td><Badge tone={row.status === "sent" ? "green" : row.status === "blocked" ? "amber" : "red"}>{row.status}</Badge></td><td>{row.reason}</td><td><code className="log-detail">{row.content}<br/>{row.provider_json}</code></td></tr>)}</tbody></table>}</div>{rows.length === 0 && <Empty>暂无匹配日志</Empty>}</section>}</section>;
}
