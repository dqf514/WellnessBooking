import { useEffect, useState } from "react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { Member } from "@/types";

function maskPhone(phone: string) { return phone && phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone; }

export function MemberProfilePanel({ member, onUpdated }: { member: Member; onUpdated: () => Promise<void> }) {
  const { local } = useLanguage();
  const [name, setName] = useState(member.name);
  const [birthDate, setBirthDate] = useState(member.birth_date || "");
  const [newPhone, setNewPhone] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [currentDev, setCurrentDev] = useState("");
  const [newDev, setNewDev] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [newCooldown, setNewCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  useEffect(() => { setName(member.name); setBirthDate(member.birth_date || ""); }, [member.id]);
  useEffect(() => {
    if (cooldown <= 0 && newCooldown <= 0) return;
    const timer = window.setInterval(() => { setCooldown((value) => Math.max(0, value - 1)); setNewCooldown((value) => Math.max(0, value - 1)); }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown, newCooldown]);

  async function sendCode(purpose: "current" | "new") {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ dev_code?: string }>("/api/public/me/phone/code", { method: "POST", json: { phone: purpose === "current" ? member.phone : newPhone, purpose }, tokenKind: "member" });
      if (purpose === "current") { setCurrentDev(result.dev_code ?? ""); setCooldown(60); } else { setNewDev(result.dev_code ?? ""); setNewCooldown(60); }
    } catch (err) { setError(err instanceof Error ? err.message : local("验证码发送失败，请稍后重试", "Failed to send the code. Please try again later.")); }
    finally { setBusy(false); }
  }

  async function saveProfile() {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch("/api/public/me/profile", { method: "PATCH", json: { name, birth_date: birthDate }, tokenKind: "member" });
      setMessage(local("资料已更新", "Profile updated")); await onUpdated();
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败，请稍后重试", "Save failed. Please try again later.")); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File | null) {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    const body = new FormData(); body.append("file", file);
    try { await apiFetch("/api/public/me/photo", { method: "POST", body, tokenKind: "member" }); setMessage(local("照片已更新", "Photo updated")); await onUpdated(); }
    catch (err) { setError(err instanceof Error ? err.message : local("照片上传失败，请稍后重试", "Photo upload failed. Please try again later.")); }
    finally { setBusy(false); }
  }

  async function removePhoto() {
    setBusy(true); setError(""); setMessage("");
    try { await apiFetch("/api/public/me/photo", { method: "DELETE", tokenKind: "member" }); setMessage(local("照片已删除", "Photo removed")); await onUpdated(); }
    catch (err) { setError(err instanceof Error ? err.message : local("照片删除失败，请稍后重试", "Failed to remove the photo. Please try again later.")); }
    finally { setBusy(false); }
  }

  async function savePhone() {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch("/api/public/me/phone", { method: "POST", json: { new_phone: newPhone, current_code: currentCode, new_code: newCode }, tokenKind: "member" });
      setMessage(local("手机号已更新，下次请使用新号码登录", "Mobile updated. Sign in with the new number next time."));
      setNewPhone(""); setCurrentCode(""); setNewCode(""); setCurrentDev(""); setNewDev("");
      await onUpdated();
    } catch (err) { setError(err instanceof Error ? err.message : local("手机号修改失败，请稍后重试", "Could not update the mobile number. Please try again later.")); }
    finally { setBusy(false); }
  }

  return <div className="member-profile-panel">
    {message && <p className="profile-notice" role="status">{message}</p>}
    {error && <p className="profile-notice error" role="alert">{error}</p>}
    <section className="profile-block">
      <h3>{local("基本资料", "Basic details")}</h3>
      <div className="profile-summary"><span><small>{local("会员编号", "Member no.")}</small><strong>#{String(member.id).padStart(4, "0")}</strong></span><span><small>{local("入会时间", "Member since")}</small><strong>{member.created_at ? member.created_at.slice(0, 10) : "—"}</strong></span><span><small>{local("当前手机号", "Current mobile")}</small><strong>{maskPhone(member.phone)}</strong></span></div>
      <div className="auth-form">
        <label>{local("姓名", "Name")}<input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)}/></label>
        <label>{local("出生日期", "Birth date")}<input type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={(event) => setBirthDate(event.target.value)}/></label>
        <button className="button button-primary button-full" disabled={busy} type="button" onClick={() => void saveProfile()}><Icon name="check" size={17}/>{busy ? local("保存中…", "Saving…") : local("保存资料", "Save details")}</button>
      </div>
    </section>
    <section className="profile-block">
      <h3>{local("会员照片", "Profile photo")}</h3>
      <p className="form-help">{local("上传一张本人照片，前台签到、员工查询会员时都能更快认出你。上传后可以拖动调整取景，照片会按头像的样子裁剪显示。", "Upload a photo of yourself so staff can recognise you at check-in. You can drag it to choose the framing before it is saved as a square avatar.")}</p>
      <div className="photo-editor">
        {member.photo_url ? <img className="photo-preview" src={member.photo_url} alt={member.name}/> : <span className="photo-preview photo-preview-empty">{local("暂无照片", "No photo")}</span>}
        <div>
          <label className="profile-upload"><Icon name="user" size={16}/><span>{local("拍照或选择图片", "Take a photo or choose an image")}</span><input type="file" accept="image/png,image/jpeg,image/webp" capture="user" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; if (file) setCropFile(file); }}/></label>
          {member.photo_url && <button className="text-button danger" type="button" disabled={busy} onClick={() => void removePhoto()}>{local("删除照片", "Remove photo")}</button>}
        </div>
      </div>
    </section>
    <section className="profile-block">
      <h3>{local("更换手机号", "Change mobile number")}</h3>
      <p className="form-help">{local("为保障账户安全，修改手机号需要原手机号与新手机号分别验证，两个验证码都通过后才会生效。", "For your account security, changing the mobile number requires verification with both the current and the new number.")}</p>
      <div className="auth-form">
        <label>{local("新手机号", "New mobile number")}<input required pattern="1[0-9]{10}" inputMode="numeric" placeholder="1XXXXXXXXXX" value={newPhone} onChange={(event) => setNewPhone(event.target.value)}/></label>
        <label>{local("原手机号验证码", "Code sent to the current number")}<div className="code-input"><input required inputMode="numeric" maxLength={6} value={currentCode} onChange={(event) => setCurrentCode(event.target.value)}/><button className="button button-outline" type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode("current")}>{cooldown > 0 ? `${cooldown}s` : local("获取验证码", "Send code")}</button></div></label>
        <label>{local("新手机号验证码", "Code sent to the new number")}<div className="code-input"><input required inputMode="numeric" maxLength={6} value={newCode} onChange={(event) => setNewCode(event.target.value)}/><button className="button button-outline" type="button" disabled={busy || newCooldown > 0} onClick={() => void sendCode("new")}>{newCooldown > 0 ? `${newCooldown}s` : local("获取验证码", "Send code")}</button></div></label>
        {currentDev && <p className="dev-code">{local("演示验证码", "Demo code")}: <strong>{currentDev}</strong></p>}
        {newDev && <p className="dev-code">{local("演示验证码", "Demo code")}: <strong>{newDev}</strong></p>}
        <button className="button button-primary button-full" disabled={busy} type="button" onClick={() => void savePhone()}><Icon name="phone" size={17}/>{busy ? local("提交中…", "Submitting…") : local("保存新手机号", "Save new number")}</button>
      </div>
    </section>
    {cropFile && <PhotoCropper file={cropFile} onConfirm={(file) => { setCropFile(null); void uploadPhoto(file); }} onCancel={() => setCropFile(null)}/>}
  </div>;
}
