import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Spinner } from "@/components/UI";
import { apiFetch } from "@/lib/api";

interface Settings { venue_name: string; venue_name_en: string; address: string; address_en: string; phone: string; booking_cutoff_minutes: number; no_show_block_days: number; reminder_hours: number }

export function GeneralSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<Settings>("/api/admin/settings").then(setData).catch((err) => setError(err.message)); }, []);
  async function save(event: FormEvent) { event.preventDefault(); if (!data) return; setBusy(true); setError(""); try { setData(await apiFetch<Settings>("/api/admin/settings", { method: "PUT", json: data })); setMessage("场馆与预约设置已保存"); } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); } finally { setBusy(false); } }
  if (!data) return <Spinner/>;
  return <form className="settings-section" onSubmit={save}><section className="panel settings-panel"><header><h2>场馆资料</h2><p>中英文资料会显示在会员预约端。</p></header><div className="form-grid two-columns"><Field label="场馆中文名"><input required value={data.venue_name} onChange={(event) => setData({ ...data, venue_name: event.target.value })}/></Field><Field label="场馆英文名"><input required value={data.venue_name_en} onChange={(event) => setData({ ...data, venue_name_en: event.target.value })}/></Field><Field label="中文地址"><input value={data.address} onChange={(event) => setData({ ...data, address: event.target.value })}/></Field><Field label="英文地址"><input value={data.address_en} onChange={(event) => setData({ ...data, address_en: event.target.value })}/></Field><Field label="联系电话"><input value={data.phone} onChange={(event) => setData({ ...data, phone: event.target.value })}/></Field></div></section><section className="panel settings-panel"><header><h2>预约与提醒规则</h2><p>前台后台可协助特殊情况预约；会员端严格遵循以下限制。</p></header><div className="form-grid three-columns"><Field label="自助预约截止（分钟）" hint="需求默认 120 分钟，即课前 2 小时"><input min={0} type="number" value={data.booking_cutoff_minutes} onChange={(event) => setData({ ...data, booking_cutoff_minutes: Number(event.target.value) })}/></Field><Field label="爽约禁止预约天数"><input min={0} max={365} type="number" value={data.no_show_block_days} onChange={(event) => setData({ ...data, no_show_block_days: Number(event.target.value) })}/></Field><Field label="课前短信提醒（小时）"><input min={1} max={168} type="number" value={data.reminder_hours} onChange={(event) => setData({ ...data, reminder_hours: Number(event.target.value) })}/></Field></div></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>}<button className="button button-primary" disabled={busy} type="submit">{busy ? "保存中…" : "保存设置"}</button></form>;
}
