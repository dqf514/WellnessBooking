import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { today } from "@/lib/date";
import type { Member } from "@/types";

interface NoticeRow { id: number; title: string; content: string; send_on: string; scope: string; scope_label: string; member_ids: number[]; status: string; sent_count: number; failed_count: number; created_by: string; created_at: string; sent_at: string }
const SCOPES = [{ value: "all", zh: "全部会员", en: "All members" }, { value: "card_holders", zh: "已购卡客户", en: "Card holders" }, { value: "selected", zh: "指定会员", en: "Selected members" }];
const STATUS_LABELS: Record<string, string> = { scheduled: "待发送", sent: "已发送", cancelled: "已取消" };
const SWITCH_TEMPLATE = { title: "预约系统切换提醒", content: "尊敬的会员，我们将于 12 月 1 日起启用新的线上预约系统。此后请通过音昱 Wellness 会员端预约团课、查看课表与会员卡。如需协助请随时联系前台。" };

export function NoticesPage() {
  const { local } = useLanguage();
  const [items, setItems] = useState<NoticeRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ title: "", content: "", send_on: today(), scope: "all" });
  const [picked, setPicked] = useState<number[]>([]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [noticeResult, memberResult] = await Promise.all([apiFetch<{ items: NoticeRow[] }>("/api/admin/notices"), apiFetch<{ items: Member[] }>("/api/admin/members?active_only=true")]);
      setItems(noticeResult.items); setMembers(memberResult.items);
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function openCreate() { setForm({ title: "", content: "", send_on: today(), scope: "all" }); setPicked([]); setQuery(""); setError(""); setOpen(true); }
  function fillSwitchTemplate() { setForm((current) => ({ ...current, title: SWITCH_TEMPLATE.title, content: SWITCH_TEMPLATE.content })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiFetch<NoticeRow>("/api/admin/notices", { method: "POST", json: { ...form, member_ids: form.scope === "selected" ? picked : [] } });
      setMessage(local(`通知计划已保存，将于 ${result.send_on} 自动群发`, `Notice scheduled for ${result.send_on}`)); setOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function sendNow(row: NoticeRow) {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ total: number; sent: number; failed: number }>(`/api/admin/notices/${row.id}/send`, { method: "POST" });
      setMessage(local(`已群发给 ${result.total} 位会员，成功 ${result.sent} 条，失败 ${result.failed} 条`, `Sent to ${result.total} members: ${result.sent} delivered, ${result.failed} failed`)); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("群发失败", "Failed to send")); }
    finally { setBusy(false); }
  }
  async function cancelNotice(row: NoticeRow) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/notices/${row.id}/cancel`, { method: "POST" }); setMessage(local("通知计划已取消", "Notice cancelled")); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("取消失败", "Failed to cancel")); }
    finally { setBusy(false); }
  }
  const matched = members.filter((member) => !query || member.name.includes(query) || member.phone.includes(query)).slice(0, 60);

  return <div>
    <PageHeader eyebrow="MEMBER COMMUNICATION" title={local("会员通知", "Member notices")} description={local("群发短信给会员：可以预约发送日期，到点后系统自动发出，也可以立即发送。", "Broadcast SMS to members: schedule a date and the system sends it automatically, or send it right away.")} actions={<><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/public/member-guide.pdf", "音昱 Wellness 会员手机端操作指南.pdf")}><Icon name="download" size={17}/>{local("下载会员操作指南", "Member guide PDF")}</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17}/>{local("新建通知", "New notice")}</button></>}/>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("通知标题", "Title")}</th><th>{local("通知范围", "Scope")}</th><th>{local("发送日期", "Send date")}</th><th>{local("状态", "Status")}</th><th>{local("发送结果", "Result")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><strong>{row.title}</strong><small>{row.content}</small></td><td>{row.scope_label}{row.scope === "selected" && <small>{local(`${row.member_ids.length} 位会员`, `${row.member_ids.length} members`)}</small>}</td><td>{row.send_on}<small>{row.status === "sent" ? local(`已于 ${row.sent_at} 发出`, `Sent at ${row.sent_at}`) : row.created_by}</small></td><td><Badge tone={row.status === "sent" ? "green" : row.status === "cancelled" ? "neutral" : "amber"}>{STATUS_LABELS[row.status] ?? row.status}</Badge></td><td>{row.status === "sent" ? local(`成功 ${row.sent_count} · 失败 ${row.failed_count}`, `${row.sent_count} sent · ${row.failed_count} failed`) : "—"}</td><td><div className="table-actions">{row.status === "scheduled" && <><button className="button button-small button-outline" type="button" disabled={busy} onClick={() => void sendNow(row)}>{local("立即发送", "Send now")}</button><button className="text-button danger" type="button" disabled={busy} onClick={() => void cancelNotice(row)}>{local("取消", "Cancel")}</button></>}</div></td></tr>)}</tbody></table></ResponsiveTable>{items.length === 0 && <Empty>{local("还没有群发通知，点击右上角新建。", "No notices yet. Create one to get started.")}</Empty>}</section>}
    {open && <Modal wide title={local("新建群发通知", "New notice")} onClose={() => setOpen(false)}><form className="form-grid two-columns" onSubmit={save}>{error && <div className="span-two"><Notice error message={error}/></div>}<div className="span-two"><Field label={local("通知标题", "Title")}><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></Field></div><div className="span-two"><Field label={local("通知内容（短信正文）", "Message")} hint={local("建议控制在 70 字以内；签名会自动加在前面。", "Keep it under 70 characters; the venue signature is added automatically.")}><textarea required rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })}/></Field></div><div className="span-two"><button className="button button-outline" type="button" onClick={fillSwitchTemplate}>{local("填入「系统切换」通知模板", "Use the system-switch template")}</button></div><Field label={local("发送日期", "Send date")} hint={local("到当天凌晨由计划任务自动群发。", "The scheduler sends it automatically on that date.")}><input required type="date" value={form.send_on} onChange={(event) => setForm({ ...form, send_on: event.target.value })}/></Field><Field label={local("通知范围", "Scope")}><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}>{SCOPES.map((scope) => <option key={scope.value} value={scope.value}>{local(scope.zh, scope.en)}</option>)}</select></Field>{form.scope === "selected" && <div className="span-two"><Field label={local("选择会员（可多选）", "Select members")}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={local("按姓名或手机号筛选", "Filter by name or mobile")}/></Field><div className="notice-member-picker">{matched.map((member) => <label key={member.id}><input type="checkbox" checked={picked.includes(member.id)} onChange={(event) => setPicked((previous) => event.target.checked ? [...previous, member.id] : previous.filter((item) => item !== member.id))}/>{member.name} · {member.phone}</label>)}</div></div>}<button className="button button-primary button-full span-two" disabled={busy || (form.scope === "selected" && !picked.length)} type="submit">{busy ? local("保存中…", "Saving…") : local("保存并预约发送", "Schedule notice")}</button></form></Modal>}
  </div>;
}
