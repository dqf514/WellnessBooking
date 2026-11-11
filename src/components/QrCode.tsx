import { useCallback, useEffect, useState } from "react";
import { Icon, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, type TokenKind } from "@/lib/api";
import type { CheckInCode } from "@/types";

export function QrCode({ value, alt }: { value: string; alt: string }) {
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  const { local } = useLanguage();
  useEffect(() => {
    let active = true;
    setFailed(false);
    void import("qrcode").then(({ default: generator }) => generator.toDataURL(value, { width: 560, margin: 2, errorCorrectionLevel: "M", color: { dark: "#102e27", light: "#ffffff" } })).then((dataUrl) => {
      if (active) setImage(dataUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value]);
  return <div className="qr-code-frame">{image && !failed ? <img src={image} alt={alt}/> : failed ? <p role="alert">{local("二维码生成失败，请刷新重试", "Could not generate the QR code. Please retry.")}</p> : <Spinner/>}</div>;
}

export function DynamicQrCode({ endpoint, tokenKind, title, description }: { endpoint: string; tokenKind: TokenKind; title: string; description: string }) {
  const { local } = useLanguage();
  const [code, setCode] = useState<CheckInCode | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<CheckInCode>(endpoint, { tokenKind });
      setCode(result); setExpiresAt(Date.now() + result.expires_in * 1000); setSeconds(result.expires_in);
    } catch (err) { setError(err instanceof Error ? err.message : local("签到码获取失败", "Could not get a check-in code")); }
    finally { setBusy(false); }
  }, [endpoint, local, tokenKind]);
  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(refresh);
  }, [load]);
  useEffect(() => {
    const countdown = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(countdown);
  }, [expiresAt]);
  return <section className="dynamic-qr-panel" aria-live="polite">
    <div className="qr-panel-heading"><span className="eyebrow">DYNAMIC CHECK-IN</span><h3>{title}</h3><p>{description}</p></div>
    {code ? <div className={seconds === 0 ? "qr-code-expired" : ""}><QrCode value={code.token} alt={title}/>{seconds === 0 && <button className="button button-primary qr-refresh-overlay" type="button" onClick={() => void load()}>{local("二维码已过期，点击刷新", "Code expired. Tap to refresh")}</button>}</div> : !error && <Spinner/>}
    <div className="qr-code-meta"><span className={seconds <= 10 ? "expiring" : ""}><Icon name="clock" size={16}/>{seconds > 0 ? local(`${seconds} 秒后过期`, `Expires in ${seconds}s`) : local("已过期", "Expired")}</span><small>{local("每 30 秒自动刷新", "Refreshes every 30 seconds")}</small></div>
    {error && <p className="checkin-error" role="alert">{error}</p>}
    <button className="button button-outline button-full" type="button" disabled={busy} onClick={() => void load()}><Icon name="refresh" size={17}/>{busy ? local("刷新中…", "Refreshing…") : local("手动刷新", "Refresh now")}</button>
    <p className="qr-privacy-note">{local("签到码包含短期有效凭证，请勿截图转发。刷新后旧码会在到期时失效。", "This short-lived code is personal. Do not share screenshots; old codes expire automatically.")}</p>
  </section>;
}
