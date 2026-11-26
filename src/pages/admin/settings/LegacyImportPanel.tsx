import { useState } from "react";
import { Notice } from "@/components/AdminUI";
import { Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

interface ImportStats { read: number; created: number; skipped: number }
interface ImportReport { source: string; directory: string; dry_run: boolean; tables: Record<string, ImportStats>; warnings: string[]; notes: string[] }

export function LegacyImportPanel() {
  const { admin: a, local } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(file: File | null) {
    if (!file) return;
    if (!dryRun && !window.confirm(local("确认导入勤鸟历史数据？导入会写入会员、会员卡、排课、签到与流水。", "Import RocketBird history? This writes members, cards, sessions, check-ins and transactions."))) return;
    setBusy(true); setError(""); setMessage("");
    const body = new FormData();
    body.append("file", file);
    body.append("dry_run", dryRun ? "true" : "false");
    body.append("include_logs", includeLogs ? "true" : "false");
    try {
      const result = await apiFetch<ImportReport>("/api/admin/import/rocketbird/upload", { method: "POST", body });
      setReport(result);
      setMessage(dryRun ? local("演练完成，确认无误后取消勾选「先演练」再正式导入。", "Dry run finished. Uncheck “Dry run” to import for real.") : local("导入完成。", "Import finished."));
    } catch (err) { setError(err instanceof Error ? err.message : local("导入失败", "Import failed")); } finally { setBusy(false); }
  }
  return <div className="settings-section"><section className="panel settings-panel"><header><h2>{a("勤鸟历史数据导入")}</h2><p>{a("把勤鸟运动 SaaS 导出的会员、会员卡、排课、签到、消课与流水导入本系统。重复导入按外部 ID 幂等跳过，已存在的会员与基础资料不会被覆盖。")}</p></header><div className="form-grid two-columns"><label className="checkbox-label"><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)}/>{a("先演练（只统计不写库）")}</label><label className="checkbox-label"><input type="checkbox" checked={includeLogs} onChange={(event) => setIncludeLogs(event.target.checked)}/>{a("同时导入操作日志")}</label></div><label className="file-button"><Icon name="database" size={17}/>{busy ? a("导入中…") : a("选择 ZIP 并导入")}<input type="file" accept=".zip" disabled={busy} onChange={(event) => { void run(event.target.files?.[0] ?? null); event.target.value = ""; }}/></label><p className="form-help">{a("压缩包内需包含 members.csv、member_cards.csv、sign_logs.csv、finance_flow.csv 等勤鸟导出文件，可直接压缩 rocketbird_export 目录。")}</p></section>{error && <Notice error message={error}/>}{message && <Notice message={message}/>}{report && <section className="panel settings-panel"><header><h2>{report.dry_run ? a("演练结果") : a("导入结果")}</h2><p>{a("数据来源")}: {report.source}</p></header><div className="table-wrap"><table className="data-table"><thead><tr><th>{a("数据表")}</th><th>{a("读取")}</th><th>{a("导入")}</th><th>{a("跳过")}</th></tr></thead><tbody>{Object.entries(report.tables).map(([name, stats]) => <tr key={name}><td>{name}</td><td>{stats.read}</td><td>{stats.created}</td><td>{stats.skipped}</td></tr>)}</tbody></table></div>{report.warnings.length > 0 && <Notice message={`${a("提示")}: ${report.warnings.join("；")}`}/>}{report.notes.length > 0 && <Notice message={`${a("说明")}: ${report.notes.join("；")}`}/>}</section>}</div>;
}
