import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/UI";
import { BrandLogo } from "@/components/BrandLogo";
import { Notice } from "@/components/AdminUI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import type { User } from "@/types";

type LoginResult = { access_token: string; user: User; mfa_required?: boolean; mfa_token?: string; phone_masked?: string; dev_code?: string };

export function LoginPage() {
  const auth = useAuth();
  const { admin: a, local, language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"password" | "sms">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const [captchaOn, setCaptchaOn] = useState(true);
  const [captcha, setCaptcha] = useState<{ captcha_id: string; image: string } | null>(null);
  const [captchaText, setCaptchaText] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaPhone, setMfaPhone] = useState("");
  const [mfaDevCode, setMfaDevCode] = useState("");

  async function loadCaptcha() {
    try { setCaptcha(await apiFetch<{ captcha_id: string; image: string }>("/api/auth/captcha")); setCaptchaText(""); }
    catch { setCaptcha(null); }
  }

  // 测试期才自动填入演示账号：开关关闭时登录页保持空白，生产环境不暴露默认口令。
  useEffect(() => {
    void apiFetch<{ demo_login: boolean; captcha: boolean }>("/api/public/app-config").then((result) => {
      setCaptchaOn(result.captcha);
      if (result.captcha) void loadCaptcha();
      if (!result.demo_login) return;
      setDemo(true);
      setUsername((current) => current || "admin");
      setPassword((current) => current || "admin123");
      setPhone((current) => current || "13800000001");
    }).catch(() => undefined);
  }, []);

  function success(result: { access_token: string; user: User }) {
    auth.login(result.access_token, result.user);
    navigate("/admin", { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (mfaToken) {
        const result = await apiFetch<{ access_token: string; user: User }>("/api/auth/login-mfa", { method: "POST", json: { mfa_token: mfaToken, code } });
        success(result); return;
      }
      const result = mode === "password"
        ? await apiFetch<LoginResult>("/api/auth/login", { method: "POST", json: { username, password, captcha_id: captcha?.captcha_id ?? "", captcha_text: captchaText } })
        : await apiFetch<LoginResult>("/api/auth/login-sms", { method: "POST", json: { phone, code } });
      if (result.mfa_required) { setMfaToken(result.mfa_token ?? ""); setMfaPhone(result.phone_masked ?? ""); setMfaDevCode(result.dev_code ?? ""); setCode(result.dev_code ?? ""); setError(""); return; }
      success(result);
    } catch (err) { setError(err instanceof Error ? err.message : local("登录失败", "Sign-in failed")); if (captchaOn && !mfaToken) void loadCaptcha(); }
    finally { setBusy(false); }
  }

  async function sendCode() {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ dev_code?: string }>("/api/auth/sms/send-code", { method: "POST", json: { phone } });
      setDevCode(result.dev_code ?? ""); if (result.dev_code) setCode(result.dev_code);
    } catch (err) { setError(err instanceof Error ? err.message : local("发送失败", "Failed to send")); }
    finally { setBusy(false); }
  }

  return <main className="login-page"><section className="login-brand-panel"><Link to="/" className="brand login-brand"><BrandLogo/><span><strong>音昱 Wellness</strong><small>STUDIO OPERATIONS</small></span></Link><div className="login-statement"><span>LESS NOISE. MORE CARE.</span><h1>{a("把繁杂留给系统，")}<br/>{a("把时间还给每一位会员。")}</h1><p>{a("排课、预约、会员权益与经营数据，在一处清晰流转。")}</p></div><div className="login-schedule-art" aria-hidden="true"><span>08:30</span><i/><span>10:15</span><i/><span>12:00</span><i/><span>18:30</span></div></section><section className="login-form-panel"><button className="language-toggle login-language-toggle" type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")}>{t("language")}</button><form className="login-card" onSubmit={submit}><div className="login-card-heading"><span className="eyebrow">WELCOME BACK</span><h2>{mfaToken ? a("二次验证") : a("员工登录")}</h2><p>{mfaToken ? a("验证码已发送到绑定手机号，输入后即可进入工作台") : a("使用员工账号进入预约管理工作台")}</p></div>{mfaToken ? <><label className="field"><span>{a("短信验证码")}</span><div className="code-input"><input required maxLength={6} inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)}/></div></label>{mfaPhone && <p className="dev-code">{a("已发送到")} <strong>{mfaPhone}</strong></p>}{mfaDevCode && <p className="dev-code">{a("本地演示验证码")}: <strong>{mfaDevCode}</strong></p>}<button className="text-button login-back-step" type="button" onClick={() => { setMfaToken(""); setCode(""); setError(""); }}>{a("返回重新登录")}</button></> : <><div className="login-tabs" role="tablist"><button type="button" role="tab" aria-selected={mode === "password"} className={mode === "password" ? "active" : ""} onClick={() => setMode("password")}>{a("账号密码")}</button><button type="button" role="tab" aria-selected={mode === "sms"} className={mode === "sms" ? "active" : ""} onClick={() => setMode("sms")}>{a("短信验证")}</button></div>{mode === "password" ? <><label className="field"><span>{a("用户名")}</span><input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)}/></label><label className="field"><span>{a("密码")}</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/></label>{captchaOn && <label className="field"><span>{a("图片验证码")}</span><div className="captcha-row"><input className="captcha-input" required maxLength={4} autoComplete="off" value={captchaText} onChange={(event) => setCaptchaText(event.target.value.toUpperCase())}/><button type="button" className="captcha-image" data-captcha-id={captcha?.captcha_id ?? ""} title={a("点击刷新验证码")} onClick={() => void loadCaptcha()}>{captcha ? <img src={captcha.image} alt={a("图片验证码")}/> : <span>{a("加载中…")}</span>}</button></div><small className="form-help">{a("看不清可点击图片刷新，5 分钟内有效。")}</small></label>}</> : <><label className="field"><span>{a("绑定手机号")}</span><input inputMode="numeric" required value={phone} onChange={(event) => setPhone(event.target.value)}/></label><label className="field"><span>{a("验证码")}</span><div className="code-input"><input required maxLength={6} value={code} onChange={(event) => setCode(event.target.value)}/><button type="button" className="button button-outline" disabled={busy} onClick={() => void sendCode()}>{a("获取验证码")}</button></div></label>{devCode && <p className="dev-code">{a("本地演示验证码")}: <strong>{devCode}</strong></p>}</>}</>}{error && <Notice error message={error}/>}<button className="button button-primary button-full login-submit" disabled={busy} type="submit">{busy ? a("登录中…") : mfaToken ? a("完成验证") : a("进入工作台")}<Icon name="arrow" size={18}/></button>{demo && <div className="demo-hint"><strong>{a("本地演示账号")}</strong><span>admin / admin123</span><small>{a("正式部署后请立即修改默认密码与 JWT_SECRET")}</small></div>}<Link className="back-home" to="/">← {a("返回会员预约端")}</Link></form></section></main>;
}
