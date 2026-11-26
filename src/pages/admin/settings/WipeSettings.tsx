import { useState } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Icon } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

export function WipeSettings() {
  const { admin: a, local } = useLanguage();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function requestCode() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ message: string }>("/api/admin/maintenance/wipe/request-code", { method: "POST" });
      setSent(true);
      setMessage(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : a("清除码发送失败")); } finally { setBusy(false); }
  }
  async function execute() {
    if (!window.confirm(local("确认清空全部数据？会员、预约、流水与历史记录都会被删除，只保留系统设置与当前管理员账号，且不可撤销。", "Wipe all data? Members, bookings, transactions and history will be deleted. Only system settings and the current admin account are kept, and this cannot be undone."))) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ message: string; new_password: string }>("/api/admin/maintenance/wipe/execute", { method: "POST", json: { code, confirm } });
      setMessage(`${result.message}（新密码：${result.new_password}）`);
      setCode(""); setConfirm(""); setSent(false);
      logout();
    } catch (err) { setError(err instanceof Error ? err.message : a("清除失败")); } finally { setBusy(false); }
  }
  return <div className="settings-section"><section className="panel settings-panel"><header><h2>{a("一键清除全部数据")}</h2><p>{a("用于重新导入一套干净的历史数据：清空会员、会员卡、课种、教练、教室、排课、预约、流水与全部历史记录。系统名称、Logo、备份计划、短信通道等系统设置会原样保留。")}</p></header><ul className="wipe-notes"><li>{a("清除码只通过短信发送到系统内置的手机号 18602113774，界面与接口都不会显示清除码。")}</li><li>{a("清除后只保留当前管理员账号，密码重置为 Tpc@2026，请用新密码重新登录。")}</li><li>{a("清除不可撤销，执行前请先在「数据维护」里做一次数据库备份。")}</li></ul><div className="wipe-actions"><button className="button button-outline" disabled={busy} type="button" onClick={() => void requestCode()}><Icon name="plus" size={17}/>{busy && !sent ? a("发送中…") : a("发送清除码")}</button>{sent && <span className="form-help">{a("清除码已发送，请在 10 分钟内填写。")}</span>}</div><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void execute(); }}><Field label={a("清除码")}><input inputMode="numeric" maxLength={6} placeholder={a("短信里的 6 位数字")} value={code} onChange={(event) => setCode(event.target.value)}/></Field><Field label={a("确认口令")}><input placeholder={a("清除全部数据")} value={confirm} onChange={(event) => setConfirm(event.target.value)}/></Field><p className="form-help">{a("确认口令需原样输入：清除全部数据")}</p><button className="button button-danger-ghost" disabled={busy || !code || !confirm} type="submit">{a("确认清除全部数据")}</button></form></section>{error && <Notice error message={error}/>}{message && <Notice message={message}/>}</div>;
}
