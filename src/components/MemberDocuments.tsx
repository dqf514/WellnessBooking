import { Empty, Icon } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { downloadFile } from "@/lib/api";
import type { MemberDetail } from "@/types";

export function MemberDocuments({ detail, category, busy, onUpload }: { detail: MemberDetail; category: "contract" | "assessment"; busy: boolean; onUpload: (file: File | null, category: "contract" | "assessment") => void }) {
  const { local } = useLanguage();
  const documents = detail.documents?.filter((document) => document.category === category) ?? [];
  const assessments = category === "assessment" ? detail.records.filter((record) => record.record_type === "assessment") : [];
  const title = category === "contract" ? local("合同与资料", "Contracts & documents") : local("体测 / Assessment", "Assessment files");
  return <section className="documents-list member-resource-section"><header><div><h3>{title}</h3><p>{category === "contract" ? local("合同、签字文件与其他会员资料", "Contracts, signed forms and member documents") : local("复杂评估表可直接上传，无需逐项录入", "Upload detailed assessment forms without manual data entry")}</p></div><label className="profile-upload"><Icon name="plus"/><span>{category === "contract" ? local("上传合同", "Upload contract") : local("上传评估表", "Upload assessment")}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv" disabled={busy} onChange={(event) => { onUpload(event.target.files?.[0] ?? null, category); event.target.value = ""; }}/></label></header>
    {assessments.map((record) => <article key={`record-${record.id}`}><div><strong>{record.title}</strong><small>{record.record_date} · {record.content}</small></div></article>)}
    {documents.map((document) => <article key={document.id}><div><strong>{document.original_name}</strong><small>{(document.size_bytes / 1024).toFixed(1)} KB · {document.created_at} · {document.uploaded_by}</small></div><button className="text-button" type="button" onClick={() => void downloadFile(`/api/admin/documents/${document.id}/download`, document.original_name)}><Icon name="download" size={16}/>{local("下载", "Download")}</button></article>)}
    {!documents.length && !assessments.length && <Empty>{category === "contract" ? local("尚未上传合同资料", "No contracts uploaded") : local("尚未上传评估表", "No assessments uploaded")}</Empty>}
  </section>;
}
