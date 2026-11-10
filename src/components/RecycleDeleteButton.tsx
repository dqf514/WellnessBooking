import { useState } from "react";
import { Notice } from "@/components/AdminUI";
import { Icon, Modal } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";

export function RecycleDeleteButton({ resource, id, label, onDeleted, className = "text-button danger", disabled = false }: { resource: string; id: number; label: string; onDeleted: () => void | Promise<void>; className?: string; disabled?: boolean }) {
  const { local } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/recycle/${resource}/${id}`, { method: "DELETE" });
      setOpen(false);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : local("删除失败", "Delete failed"));
    } finally { setBusy(false); }
  }
  return <>
    <button className={className} type="button" disabled={disabled || busy} onClick={(event) => { event.stopPropagation(); setError(""); setOpen(true); }}><Icon name="close" size={14}/>{local("删除", "Delete")}</button>
    {open && <Modal title={local("移入回收站", "Move to recycle bin")} onClose={() => { if (!busy) setOpen(false); }}><div className="logout-confirmation" onClick={(event) => event.stopPropagation()}><span className="logout-confirmation-icon"><Icon name="database" size={25}/></span><p>{local(`确定将“${label}”移入回收站吗？相关内容会立即从日常业务中隐藏，管理员可恢复；满 180 天后才能彻底删除。`, `Move “${label}” to the recycle bin? It will be hidden from daily operations and can be restored by an administrator. Permanent deletion is available only after 180 days.`)}</p>{error && <Notice error message={error}/>}<div className="logout-confirmation-actions"><button className="button button-outline" type="button" disabled={busy} onClick={() => setOpen(false)}>{local("返回", "Back")}</button><button className="button button-danger-ghost" type="button" disabled={busy} onClick={() => void remove()}>{busy ? local("处理中…", "Processing…") : local("确认移入回收站", "Move to recycle bin")}</button></div></div></Modal>}
  </>;
}
