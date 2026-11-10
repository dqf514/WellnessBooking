import { useCallback, useEffect, useState } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { RecycleItem } from "@/types";

const resources = ["users", "members", "teachers", "rooms", "courses", "sessions", "products", "cards", "bookings", "shares", "vouchers", "reminders", "room-reservations", "records", "documents", "transactions", "api-keys"];
const resourceNames: Record<string, [string, string]> = {
  users: ["员工账号", "Staff"], members: ["会员档案", "Members"], teachers: ["教练", "Instructors"], rooms: ["教室", "Rooms"], courses: ["课程", "Classes"], sessions: ["排课", "Schedule"], products: ["卡课产品", "Products"], cards: ["会员卡", "Member cards"], bookings: ["已取消预约", "Cancelled bookings"], shares: ["共享关系", "Card shares"], vouchers: ["体验券", "Vouchers"], reminders: ["会员提醒", "Reminders"], "room-reservations": ["教室占用", "Room use"], records: ["会员记录", "Member records"], documents: ["合同 / 评估附件", "Documents"], transactions: ["手工入账", "Manual entries"], "api-keys": ["API Keys", "API Keys"],
};

export function RecycleBinSettings() {
  const { local } = useLanguage();
  const [items, setItems] = useState<RecycleItem[]>([]);
  const [resource, setResource] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{ action: "restore" | "purge"; item: RecycleItem } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (resource) params.set("resource", resource); if (query.trim()) params.set("q", query.trim());
      const result = await apiFetch<{ items: RecycleItem[]; total: number; retention_days: number }>(`/api/admin/recycle?${params}`);
      setItems(result.items); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [resource, query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  async function perform() {
    if (!confirm) return;
    setBusy(true); setError("");
    const { action, item } = confirm;
    try {
      await apiFetch(`/api/admin/recycle/${item.resource}/${item.id}${action === "restore" ? "/restore" : "/permanent"}`, { method: action === "restore" ? "POST" : "DELETE" });
      setMessage(action === "restore" ? local("已恢复到原业务模块", "Restored to the original module") : local("已彻底删除，此操作不可恢复", "Permanently deleted. This cannot be undone."));
      setConfirm(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("操作失败", "Action failed")); setConfirm(null); }
    finally { setBusy(false); }
  }
  return <section className="settings-section recycle-bin-settings">
    <section className="sms-info"><strong>{local("回收站 · 180 天保留期", "Recycle bin · 180-day retention")}</strong><p>{local("删除仅隐藏日常业务数据，不会立即抹除。恢复会还原删除前状态并重新检查业务冲突；只有管理员可恢复或彻底删除，彻底删除必须由服务端确认已满 180 天。", "Deletion hides items from daily operations. Restoration recovers their previous state and rechecks conflicts. Only administrators can restore or purge, and the server enforces the full 180-day retention period.")}</p></section>
    <section className="filter-panel"><Field label={local("数据类型", "Resource")}><select value={resource} onChange={(event) => setResource(event.target.value)}><option value="">{local("全部类型", "All resources")}</option>{resources.map((key) => <option key={key} value={key}>{local(...(resourceNames[key] ?? [key, key]))}</option>)}</select></Field><label className="search-box"><Icon name="search" size={18}/><input aria-label={local("搜索回收站", "Search recycle bin")} placeholder={local("搜索名称、删除人", "Search name or operator")} value={query} onChange={(event) => setQuery(event.target.value)}/></label><button className="button button-outline" type="button" onClick={() => void load()}><Icon name="refresh" size={16}/>{local("刷新", "Refresh")}</button><span className="filter-summary">{local(`${items.length} 条`, `${items.length} items`)}</span></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("数据", "Item")}</th><th>{local("类型", "Type")}</th><th>{local("删除时间 / 操作人", "Deleted / by")}</th><th>{local("保留状态", "Retention")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.resource}-${item.id}`}><td><strong>{item.title}</strong><small>{item.subtitle} · #{item.id}</small></td><td>{local(...(resourceNames[item.resource] ?? [item.resource_label, item.resource_label]))}</td><td>{item.deleted_at}<small>{item.deleted_by}</small></td><td><Badge tone={item.can_purge ? "red" : "amber"}>{local(`已保留 ${item.days_in_recycle} 天`, `${item.days_in_recycle} days`)}</Badge><small>{item.can_purge ? local("可彻底删除", "Eligible for purge") : local(`至 ${item.purge_after} 后可彻底删除`, `Purge available after ${item.purge_after}`)}</small></td><td><div className="table-actions"><button className="text-button" type="button" onClick={() => setConfirm({ action: "restore", item })}><Icon name="arrow" size={14}/>{local("恢复", "Restore")}</button><button className="text-button danger" type="button" disabled={!item.can_purge} title={item.can_purge ? local("彻底删除", "Permanently delete") : local("未满 180 天，不能彻底删除", "Available only after 180 days")} onClick={() => setConfirm({ action: "purge", item })}><Icon name="close" size={14}/>{local("彻底删除", "Delete permanently")}</button></div></td></tr>)}</tbody></table></ResponsiveTable>{!items.length && <Empty>{local("回收站为空", "The recycle bin is empty")}</Empty>}</section>}
    {confirm && <Modal title={confirm.action === "restore" ? local("恢复数据", "Restore item") : local("彻底删除", "Delete permanently")} onClose={() => { if (!busy) setConfirm(null); }}><div className="logout-confirmation"><span className="logout-confirmation-icon"><Icon name={confirm.action === "restore" ? "arrow" : "close"} size={25}/></span><p>{confirm.action === "restore" ? local(`确定恢复“${confirm.item.title}”吗？系统将还原删除前状态，并重新检查关联资源和时段冲突。`, `Restore “${confirm.item.title}”? The previous state will be recovered and business conflicts rechecked.`) : local(`确定彻底删除“${confirm.item.title}”吗？该数据已在回收站满 180 天，删除后不可恢复，附件文件也会一并清理。`, `Permanently delete “${confirm.item.title}”? It has been in the recycle bin for 180 days. This cannot be undone and uploaded files will also be removed.`)}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" disabled={busy} onClick={() => setConfirm(null)}>{local("返回", "Back")}</button><button className={confirm.action === "restore" ? "button button-primary" : "button button-danger-ghost"} type="button" disabled={busy} onClick={() => void perform()}>{busy ? local("处理中…", "Processing…") : confirm.action === "restore" ? local("确认恢复", "Restore") : local("确认彻底删除", "Delete permanently")}</button></div></div></Modal>}
  </section>;
}
