import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";

export function QrScanner({ onCode, busy = false }: { onCode: (code: string) => void; busy?: boolean }) {
  const { local } = useLanguage();
  const elementId = `qr-scanner-${useId().replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const onCodeRef = useRef(onCode);
  const lockedRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  onCodeRef.current = onCode;
  useEffect(() => {
    let disposed = false;
    let started = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(local("当前浏览器无法使用摄像头，请在 HTTPS 下打开或粘贴签到码。", "Camera access requires a supported browser and HTTPS. You can paste a code below."));
        return;
      }
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (disposed || !containerRef.current) return;
        scanner = new Html5Qrcode(elementId, { verbose: false });
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 }, (decodedText) => {
          if (lockedRef.current) return;
          lockedRef.current = true;
          onCodeRef.current(decodedText);
          window.setTimeout(() => { lockedRef.current = false; }, 1800);
        }, () => {});
        if (disposed) {
          await scanner.stop(); scanner.clear(); return;
        }
        started = true;
      } catch {
        if (!disposed) setCameraError(local("摄像头未开启。请允许摄像头权限，或改用下方粘贴签到码。", "Camera unavailable. Allow camera permission or paste a code below."));
      }
    }
    void start();
    return () => {
      disposed = true;
      if (!scanner) return;
      const activeScanner = scanner;
      void (async () => {
        try {
          if (started) await activeScanner.stop();
          activeScanner.clear();
        } catch {}
      })();
    };
  }, [elementId, local]);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = manual.trim();
    if (!value || busy) return;
    onCode(value); setManual("");
  }
  return <div className="qr-scanner-panel">
    <div className="qr-scanner-view" id={elementId} ref={containerRef} aria-label={local("二维码摄像头扫描区域", "QR camera scanner")} aria-busy={busy}/>
    {cameraError && <p className="scanner-camera-note" role="status"><Icon name="scan" size={18}/>{cameraError}</p>}
    <form className="manual-code-form" onSubmit={submit}>
      <label htmlFor={`${elementId}-manual`}>{local("摄像头不可用？粘贴完整签到码", "Camera unavailable? Paste the full check-in code")}</label>
      <div><input id={`${elementId}-manual`} value={manual} onChange={(event) => setManual(event.target.value)} placeholder="YYM1… / YYS1…" autoComplete="off" spellCheck={false}/><button className="button button-primary" type="submit" disabled={busy || !manual.trim()}>{local("签到", "Check in")}</button></div>
    </form>
  </div>;
}
