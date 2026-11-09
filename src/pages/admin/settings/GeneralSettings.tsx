import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { BrandLogo } from "@/components/BrandLogo";
import { Spinner } from "@/components/UI";
import { useBranding } from "@/context/BrandingContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface Settings { venue_name: string; venue_name_en: string; address: string; address_en: string; phone: string; logo_url: string; favicon_url: string; booking_cutoff_minutes: number; no_show_block_days: number; reminder_hours: number }

export function GeneralSettings() {
  const { admin: a, local } = useLanguage();
  const { refreshBranding } = useBranding();
  const [data, setData] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<Settings>("/api/admin/settings").then(setData).catch((err) => setError(err.message)); }, []);
  async function save(event: FormEvent) { event.preventDefault(); if (!data) return; setBusy(true); setError(""); setMessage(""); try { setData(await apiFetch<Settings>("/api/admin/settings", { method: "PUT", json: data })); setMessage(a("场馆与预约设置已保存")); } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); } finally { setBusy(false); } }
  async function upload(kind: "logo" | "favicon", file: File | null) {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    const body = new FormData(); body.append("file", file);
    try {
      const result = await apiFetch<Settings>(`/api/admin/settings/branding/${kind}`, { method: "POST", body });
      setData(result); await refreshBranding();
      setMessage(local(kind === "logo" ? "Logo 已更新并同步到整个系统" : "favicon 已更新", kind === "logo" ? "Logo updated across the entire system" : "Favicon updated"));
    } catch (err) { setError(err instanceof Error ? err.message : local("上传失败", "Upload failed")); }
    finally { setBusy(false); }
  }
  async function reset(kind: "logo" | "favicon") {
    setBusy(true); setError(""); setMessage("");
    try {
      setData(await apiFetch<Settings>(`/api/admin/settings/branding/${kind}`, { method: "DELETE" }));
      await refreshBranding();
      setMessage(local("已恢复默认品牌图标", "Default brand asset restored"));
    } catch (err) { setError(err instanceof Error ? err.message : local("操作失败", "Action failed")); }
    finally { setBusy(false); }
  }
  if (!data) return <Spinner/>;
  return <div className="settings-section"><section className="panel settings-panel"><header><h2>{a("品牌图标", "Brand assets")}</h2><p>{a("上传后立即同步到会员端、员工登录、管理后台与浏览器标签页。仅支持 PNG，单文件不超过 2MB。", "Changes apply immediately to the member site, staff sign-in, admin workspace and browser tab. PNG only, up to 2MB per file.")}</p></header><div className="branding-grid"><article className="branding-item"><div className="branding-preview"><BrandLogo/></div><div className="branding-copy"><strong>{a("系统 Logo", "System logo")}</strong><p>{a("必须为 256×256 像素的正方形 PNG，建议使用透明背景。", "Required: square 256×256 PNG. A transparent background is recommended.")}</p><label className="file-button"><input type="file" accept="image/png,.png" disabled={busy} aria-label={a("上传系统 Logo", "Upload system logo")} onChange={(event) => { void upload("logo", event.target.files?.[0] ?? null); event.target.value = ""; }}/>{a("上传新 Logo", "Upload new logo")}</label><button className="text-button branding-reset" type="button" disabled={busy || !data.logo_url} onClick={() => void reset("logo")}>{a("恢复默认", "Restore default")}</button></div></article><article className="branding-item"><div className="branding-preview favicon-preview">{data.favicon_url ? <img src={data.favicon_url} alt={a("当前 favicon", "Current favicon")}/> : <BrandLogo/>}</div><div className="branding-copy"><strong>{a("站点 favicon", "Site favicon")}</strong><p>{a("必须为 64×64 像素的正方形 PNG，用于浏览器标签页图标。", "Required: square 64×64 PNG, used as the browser tab icon.")}</p><label className="file-button"><input type="file" accept="image/png,.png" disabled={busy} aria-label={a("上传站点 favicon", "Upload site favicon")} onChange={(event) => { void upload("favicon", event.target.files?.[0] ?? null); event.target.value = ""; }}/>{a("上传新 favicon", "Upload new favicon")}</label><button className="text-button branding-reset" type="button" disabled={busy || !data.favicon_url} onClick={() => void reset("favicon")}>{a("恢复默认", "Restore default")}</button></div></article></div></section><form className="settings-section" onSubmit={save}><section className="panel settings-panel"><header><h2>{a("场馆资料")}</h2><p>{a("中英文资料会显示在会员预约端。")}</p></header><div className="form-grid two-columns"><Field label={a("场馆中文名")}><input required value={data.venue_name} onChange={(event) => setData({ ...data, venue_name: event.target.value })}/></Field><Field label={a("场馆英文名")}><input required value={data.venue_name_en} onChange={(event) => setData({ ...data, venue_name_en: event.target.value })}/></Field><Field label={a("中文地址")}><input value={data.address} onChange={(event) => setData({ ...data, address: event.target.value })}/></Field><Field label={a("英文地址")}><input value={data.address_en} onChange={(event) => setData({ ...data, address_en: event.target.value })}/></Field><Field label={a("联系电话")}><input value={data.phone} onChange={(event) => setData({ ...data, phone: event.target.value })}/></Field></div></section><section className="panel settings-panel"><header><h2>{a("预约与提醒规则")}</h2><p>{a("前台后台可协助特殊情况预约；会员端严格遵循以下限制。")}</p></header><div className="form-grid three-columns"><Field label={a("自助预约截止（分钟）")} hint={a("需求默认 120 分钟，即课前 2 小时")}><input min={0} type="number" value={data.booking_cutoff_minutes} onChange={(event) => setData({ ...data, booking_cutoff_minutes: Number(event.target.value) })}/></Field><Field label={a("爽约禁止预约天数")}><input min={0} max={365} type="number" value={data.no_show_block_days} onChange={(event) => setData({ ...data, no_show_block_days: Number(event.target.value) })}/></Field><Field label={a("课前短信提醒（小时）")}><input min={1} max={168} type="number" value={data.reminder_hours} onChange={(event) => setData({ ...data, reminder_hours: Number(event.target.value) })}/></Field></div></section><button className="button button-primary" disabled={busy} type="submit">{busy ? a("保存中…") : a("保存设置")}</button></form>{error && <Notice error message={error}/>} {message && <Notice message={message}/>}</div>;
}
