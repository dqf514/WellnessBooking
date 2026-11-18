import { useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { Icon, Modal } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { Role, User } from "@/types";

export function PersonalProfilePanel({ onClose }: { onClose: () => void }) {
  const { admin: a, local } = useLanguage();
  const { user, updateUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const roleLabels: Record<Role, string> = { admin: a("IT / 管理员"), finance: a("财务"), frontdesk: a("前台"), teacher: a("教练 · 只读"), viewer: a("只读", "View only") };

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await apiFetch<User>("/api/auth/me", { method: "PATCH", json: { full_name: fullName, phone } });
      updateUser(updated);
      setMessage(a("个人资料已保存"));
    } catch (err) {
      setError(err instanceof Error ? err.message : local("保存失败", "Save failed"));
    } finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError(a("两次输入的新密码不一致")); return; }
    setBusy(true);
    try {
      await apiFetch("/api/auth/change-password", { method: "POST", json: { old_password: oldPassword, new_password: newPassword } });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage(a("密码已修改，请牢记新密码"));
    } catch (err) {
      setError(err instanceof Error ? err.message : local("修改密码失败", "Password change failed"));
    } finally { setBusy(false); }
  }

  return <Modal title={a("个人中心", "My profile")} onClose={onClose}>
    <div className="personal-profile">
      <section className="personal-profile-summary">
        <span className="user-avatar profile-avatar-circle">{user?.full_name.slice(0, 1)}</span>
        <div>
          <strong>{user?.full_name || a("未填写姓名", "No name yet")}</strong>
          <small>{roleLabels[user?.role ?? "viewer"]}</small>
        </div>
      </section>

      <form onSubmit={saveProfile}>
        <h3>{a("基本信息", "Basic information")}</h3>
        <div className="form-grid two-columns">
          <Field label={a("登录名", "Username")} hint={a("登录名由管理员分配，不可自行修改", "Usernames are assigned by an administrator")}><input value={user?.username ?? ""} readOnly aria-readonly="true"/></Field>
          <Field label={a("角色", "Role")} hint={a("权限由管理员在“系统设置 · 账号权限”中调整", "Roles are managed under System settings")}><input value={roleLabels[user?.role ?? "viewer"]} readOnly aria-readonly="true"/></Field>
          <Field label={a("姓名", "Full name")}><input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)}/></Field>
          <Field label={a("手机号", "Mobile number")} hint={a("用于员工短信验证码登录", "Used for SMS sign-in")}><input value={phone} inputMode="numeric" onChange={(event) => setPhone(event.target.value)}/></Field>
        </div>
        <button className="button button-primary" disabled={busy} type="submit">{busy ? a("保存中…") : a("保存资料", "Save profile")}</button>
      </form>

      <form onSubmit={changePassword}>
        <h3>{a("修改密码", "Change password")}</h3>
        <div className="form-grid two-columns">
          <Field label={a("原密码", "Current password")} className="span-two"><input required type="password" autoComplete="current-password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)}/></Field>
          <Field label={a("新密码", "New password")} hint={a("至少 8 位", "At least 8 characters")}><input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></Field>
          <Field label={a("确认新密码", "Confirm new password")}><input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></Field>
        </div>
        <button className="button button-outline" disabled={busy} type="submit"><Icon name="check" size={16}/>{a("更新密码", "Update password")}</button>
      </form>

      {error && <Notice error message={error}/>}
      {message && <Notice message={message}/>}
    </div>
  </Modal>;
}
