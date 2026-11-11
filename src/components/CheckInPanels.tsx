import { useState } from "react";
import { DynamicQrCode } from "@/components/QrCode";
import { QrScanner } from "@/components/QrScanner";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { Booking, CheckInResult, Member, StaffCheckInSelection } from "@/types";

function CheckInSuccess({ result, onContinue }: { result: CheckInResult; onContinue: () => void }) {
  const { local } = useLanguage();
  const session = result.session;
  return <div className="checkin-success" role="status">
    <span className="checkin-success-icon"><Icon name="check" size={30}/></span>
    <span className="eyebrow">CHECK-IN COMPLETE</span>
    <h3>{result.already_checked_in ? local("已签到，无需重复消课", "Already checked in; no extra deduction") : local("签到成功，已完成消课", "Checked in and consumed")}</h3>
    <p><strong>{result.member.name}</strong> · {session ? local(session.course.name, session.course.name_en) : ""}</p>
    {session && <p>{session.session_date} {session.start_time}–{session.end_time} · {local(session.room.name, session.room.name_en)}</p>}
    <small>{result.already_checked_in ? local("系统识别到重复扫码，会员卡权益没有再次扣减。", "Duplicate scan detected. No additional card benefit was deducted.") : local("预约状态与会员卡权益已同步更新。", "Booking status and card benefits are updated.")}</small>
    {result.member_reminders?.map((reminder) => <p className="checkin-reminder" key={reminder}><Icon name="bell" size={17}/>{reminder}</p>)}
    <button className="button button-primary button-full" type="button" onClick={onContinue}>{local("继续扫码", "Scan another")}</button>
  </div>;
}

export function MemberCheckInPanel({ onChecked }: { onChecked: () => Promise<void> }) {
  const { local } = useLanguage();
  const [mode, setMode] = useState<"present" | "scan">("present");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function scan(token: string) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch<CheckInResult>("/api/public/check-in/scan", { method: "POST", json: { token }, tokenKind: "member" });
      setResult(response); await onChecked();
    } catch (err) { setError(err instanceof Error ? err.message : local("签到失败，请联系前台", "Check-in failed. Please contact the front desk.")); }
    finally { setBusy(false); }
  }
  return <div className="member-checkin-panel">
    <div className="checkin-mode-switch" role="tablist" aria-label={local("签到方式", "Check-in method")}><button type="button" role="tab" aria-selected={mode === "present"} className={mode === "present" ? "active" : ""} onClick={() => { setMode("present"); setResult(null); setError(""); }}><Icon name="qr" size={19}/>{local("出示我的码", "My QR code")}</button><button type="button" role="tab" aria-selected={mode === "scan"} className={mode === "scan" ? "active" : ""} onClick={() => { setMode("scan"); setResult(null); setError(""); }}><Icon name="scan" size={19}/>{local("扫课程码", "Scan class code")}</button></div>
    {mode === "present" ? <DynamicQrCode endpoint="/api/public/me/check-in-code" tokenKind="member" title={local("会员动态签到码", "Your dynamic check-in code")} description={local("到店后出示给前台，系统会自动匹配当前预约并完成签到消课。", "Show this to the front desk. Your current booking is matched and consumed automatically.")}/> : result ? <CheckInSuccess result={result} onContinue={() => setResult(null)}/> : <>
      <div className="qr-panel-heading"><span className="eyebrow">SELF CHECK-IN</span><h3>{local("扫描前台课程签到码", "Scan the class check-in code")}</h3><p>{local("仅可签到本人已预约且处于签到时段的课程，不会重复扣次。", "Only your own bookings within the check-in window can be consumed, never twice.")}</p></div>
      <QrScanner busy={busy} onCode={(code) => void scan(code)}/>
      {busy && <p className="checkin-progress" role="status">{local("正在核对预约与会员权益…", "Checking your booking and benefits…")}</p>}
      {error && <p className="checkin-error" role="alert">{error}</p>}
    </>}
  </div>;
}

export function StaffCheckInPanel({ onChecked }: { onChecked: () => Promise<void> }) {
  const { local } = useLanguage();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [selection, setSelection] = useState<(StaffCheckInSelection & { member: Member; choices: Booking[] }) | null>(null);
  const [lastToken, setLastToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function scan(token: string, sessionId?: number) {
    setBusy(true); setError(""); setLastToken(token);
    try {
      const response = await apiFetch<CheckInResult | (StaffCheckInSelection & { member: Member; choices: Booking[] })>("/api/admin/check-in/scan", { method: "POST", json: { token, session_id: sessionId } });
      if ("requires_selection" in response && response.requires_selection) { setSelection(response); setResult(null); }
      else { setResult(response as CheckInResult); setSelection(null); await onChecked(); }
    } catch (err) { setError(err instanceof Error ? err.message : local("扫码签到失败", "QR check-in failed")); }
    finally { setBusy(false); }
  }
  if (result) return <CheckInSuccess result={result} onContinue={() => { setResult(null); setLastToken(""); setError(""); }}/>;
  if (selection) return <div className="checkin-selection"><span className="eyebrow">SELECT A CLASS</span><h3>{local(`${selection.member.name} 有多个可签到预约`, `${selection.member.name} has multiple eligible bookings`)}</h3><p>{local("为避免误消课，请与会员确认本次到店课程。系统尚未扣次。", "Confirm the class with the member to avoid a wrong deduction. Nothing has been consumed yet.")}</p><div>{selection.choices.map((booking) => booking.session && <button className="checkin-choice" type="button" disabled={busy} key={booking.id} onClick={() => void scan(lastToken, booking.session_id)}><span><strong>{local(booking.session.course.name, booking.session.course.name_en)}</strong><small>{booking.session.start_time}–{booking.session.end_time} · {local(booking.session.room.name, booking.session.room.name_en)}</small></span><Icon name="chevron" size={18}/></button>)}</div>{error && <p className="checkin-error" role="alert">{error}</p>}<button className="button button-outline button-full" type="button" onClick={() => { setSelection(null); setError(""); }}>{local("返回重新扫码", "Back to scanner")}</button></div>;
  return <div className="staff-checkin-panel"><div className="qr-panel-heading"><span className="eyebrow">FRONT DESK SCAN</span><h3>{local("扫描会员动态签到码", "Scan the member's dynamic code")}</h3><p>{local("自动匹配当前预约并完成签到消课；多个可签到课程会先要求选择。", "The current booking is matched automatically. Overlapping bookings require selection before consumption.")}</p></div><QrScanner busy={busy} onCode={(code) => void scan(code)}/>{busy && <p className="checkin-progress" role="status">{local("正在匹配预约并核销权益…", "Matching booking and consuming benefits…")}</p>}{error && <p className="checkin-error" role="alert">{error}</p>}</div>;
}
