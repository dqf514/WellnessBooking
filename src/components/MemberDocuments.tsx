import { useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Empty, Icon, Modal } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import type { MemberDetail, MemberDocument } from "@/types";

export function MemberDocuments({ detail, category, busy, canWrite, onUpload, onChanged }: { detail: MemberDetail; category: "contract" | "assessment"; busy: boolean; canWrite: boolean; onUpload: (file: File | null, category: "contract" | "assessment") => void; onChanged: () => Promise<void> }) {
  const { local } = useLanguage();
  const [editing, setEditing] = useState<MemberDocument | null>(null);
  const [name, setName] = useState("");
  const [editCategory, setEditCategory] = useState<"contract" | "assessment">(category);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const documents = detail.documents?.filter((document) => document.category === category) ?? [];
  const assessments = category === "assessment" ? detail.records.filter((record) => record.record_type === "assessment") : [];
  const title = category === "contract" ? local("合同与资料", "Contracts & documents") : local("体测 / Assessment", "Assessment files");
  function openEdit(document: MemberDocument) { setEditing(document); setName(document.original_name); setEditCategory(document.category); setError(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    setSaving(true); setError("");
    try { await apiFetch(`/api/admin/documents/${editing.id}`, { method: "PATCH", json: { original_name: name, category: editCategory } }); setEditing(null); await onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setSaving(false); }
  }
  return <>
    <section className="documents-list member-resource-section"><header><div><h3>{title}</h3><p>{category === "contract" ? local("合同、签字文件与其他会员资料", "Contracts, signed forms and member documents") : local("复杂评估表可直接上传，无需逐项录入", "Upload detailed assessment forms without manual data entry")}</p></div>{canWrite && <label className="profile-upload"><Icon name="plus"/><span>{category === "contract" ? local("上传合同", "Upload contract") : local("上传评估表", "Upload assessment")}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv" disabled={busy} onChange={(event) => { onUpload(event.target.files?.[0] ?? null, category); event.target.value = ""; }}/></label>}</header>
      {assessments.map((record) => <article key={`record-${record.id}`}><div><strong>{record.title}</strong><small>{record.record_date} · {record.content}</small></div></article>)}
      {documents.map((document) => <article key={document.id}><div><strong>{document.original_name}</strong><small>{(document.size_bytes / 1024).toFixed(1)} KB · {document.created_at} · {document.uploaded_by}</small></div><div className="table-actions"><button className="text-button" type="button" onClick={() => void downloadFile(`/api/admin/documents/${document.id}/download`, document.original_name)}><Icon name="download" size={16}/>{local("下载", "Download")}</button>{canWrite && <><button className="text-button" type="button" onClick={() => openEdit(document)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource="documents" id={document.id} label={document.original_name} onDeleted={onChanged}/></>}</div></article>)}
      {!documents.length && !assessments.length && <Empty>{category === "contract" ? local("尚未上传合同资料", "No contracts uploaded") : local("尚未上传评估表", "No assessments uploaded")}</Empty>}
    </section>
    {editing && <Modal title={local("编辑附件资料", "Edit document")} onClose={() => setEditing(null)}><form className="form-grid" onSubmit={save}>{error && <Notice error message={error}/>}<Field label={local("文件名称（需保留原扩展名）", "Filename (keep the original extension)")}><input required value={name} onChange={(event) => setName(event.target.value)}/></Field><Field label={local("资料分类", "Category")}><select value={editCategory} onChange={(event) => setEditCategory(event.target.value as "contract" | "assessment")}><option value="contract">{local("合同与资料", "Contract")}</option><option value="assessment">{local("体测 / Assessment", "Assessment")}</option></select></Field><p className="form-help">{local("编辑只修改名称和分类，不替换文件内容；需要换文件时请上传新附件后删除旧附件。", "This edits metadata only. To replace the file, upload a new one and delete the old attachment.")}</p><button className="button button-primary button-full" disabled={saving} type="submit">{saving ? local("保存中…", "Saving…") : local("保存附件资料", "Save document")}</button></form></Modal>}
  </>;
}
