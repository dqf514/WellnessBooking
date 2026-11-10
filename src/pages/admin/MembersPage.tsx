import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { MemberProfileDrawer } from "@/components/MemberProfileDrawer";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money } from "@/lib/date";
import type { Member, MemberDetail, Meta } from "@/types";

interface MemberForm { name: string; name_en: string; phone: string; gender: string; id_number: string; birth_date: string; source: string; advisor_id: string; emergency_phone: string; wechat: string; notes: string }
const emptyForm: MemberForm = { name: "", name_en: "", phone: "", gender: "", id_number: "", birth_date: "", source: "", advisor_id: "", emergency_phone: "", wechat: "", notes: "" };

export function MembersPage() {
  const { user } = useAuth();
  const { local } = useLanguage();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (query) params.set("q", query); if (category) params.set("category", category);
      const result = await apiFetch<{ items: Member[] }>(`/api/admin/members?${params}`); setMembers(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [query, category]);
  useEffect(() => { const timer = window.setTimeout(() => void loadMembers(), 250); return () => window.clearTimeout(timer); }, [loadMembers]);
  useEffect(() => { void apiFetch<Meta>("/api/admin/meta").then(setMeta).catch((err) => setError(err.message)); }, []);

  async function openDetail(id: number) {
    setError("");
    try {
      const [memberDetail, documentResult] = await Promise.all([
        apiFetch<MemberDetail>(`/api/admin/members/${id}`),
        apiFetch<{ items: NonNullable<MemberDetail["documents"]> }>(`/api/admin/members/${id}/documents`),
      ]);
      setDetail({ ...memberDetail, documents: documentResult.items });
    } catch (err) { setError(err instanceof Error ? err.message : local("加载会员失败", "Failed to load member")); }
  }
  async function reloadDetail() { if (detail) await openDetail(detail.id); await loadMembers(); }
  function openCreate() { setEditing(false); setForm(emptyForm); setFormOpen(true); }
  function openEdit() {
    if (!detail) return;
    setEditing(true); setForm({ name: detail.name, name_en: detail.name_en, phone: detail.phone, gender: detail.gender, id_number: detail.id_number, birth_date: detail.birth_date, source: detail.source, advisor_id: String(detail.advisor_id ?? ""), emergency_phone: detail.emergency_phone, wechat: detail.wechat, notes: detail.notes }); setFormOpen(true);
  }
  async function saveMember(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const payload = { ...form, advisor_id: form.advisor_id ? Number(form.advisor_id) : null };
    try {
      const result = await apiFetch<MemberDetail>(editing && detail ? `/api/admin/members/${detail.id}` : "/api/admin/members", { method: editing ? "PATCH" : "POST", json: payload });
      setMessage(local(editing ? "会员资料已更新" : "会员档案已创建", editing ? "Member details updated" : "Member profile created")); setFormOpen(false); await loadMembers(); if (editing) await openDetail(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function batchExtend() {
    const raw = window.prompt(local("为所有有效会员卡统一延期多少天？（1-365）", "Extend all active cards by how many days? (1–365)"), "7"); if (!raw) return;
    try { const result = await apiFetch<{ updated: number }>("/api/admin/cards/batch-extend", { method: "POST", json: { days: Number(raw), note: "闭馆统一延期" } }); setMessage(local(`已为 ${result.updated} 张有效会员卡延期`, `Extended ${result.updated} active cards`)); await loadMembers(); }
    catch (err) { setError(err instanceof Error ? err.message : local("批量延期失败", "Batch extension failed")); }
  }

  return <div>
    <PageHeader eyebrow="MEMBER DIRECTORY" title={local("会员管理", "Members")} description={local("资料、卡课权益、预约历史、评估附件与跟进提醒，形成完整会员档案。", "Profiles, benefits, bookings, assessment files and follow-up reminders in one member record.")} actions={canWrite && <><button className="button button-outline" type="button" onClick={() => void batchExtend()}>{local("批量延期", "Batch extend")}</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={18}/>{local("新建会员", "New member")}</button></>}/>
    <section className="filter-panel member-filter"><label className="search-box"><Icon name="search" size={18}/><input aria-label={local("搜索会员", "Search members")} placeholder={local("搜索姓名、英文名或手机号", "Search name or mobile")} value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label={local("会员卡类别", "Card category")} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{local("全部卡种", "All cards")}</option><option value="group">{local("团课卡", "Group")}</option><option value="private">{local("私教卡", "PT")}</option><option value="assessment">{local("评估卡", "Assessment")}</option><option value="package">{local("套餐", "Package")}</option></select><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/members.csv", "members.csv")}><Icon name="download" size={17}/>{local("导出", "Export")}</button></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("会员", "Member")}</th><th>{local("手机号", "Mobile")}</th><th>{local("性别 / 生日", "Gender / birth date")}</th><th>{local("有效会员卡", "Active cards")}</th><th>{local("购卡价格", "Price")}</th><th>{local("到期日期", "Expiry")}</th><th>{local("会籍归属", "Advisor")}</th><th>{local("会员时长", "Member for")}</th></tr></thead><tbody>{members.map((member) => { const activeCards = member.cards?.filter((card) => card.status === "active") ?? []; const first = activeCards[0]; return <tr key={member.id} className="clickable-row" onClick={() => void openDetail(member.id)}><td><div className="member-cell"><span className="user-avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name} {member.name_en}</strong><small>#{String(member.id).padStart(4, "0")}</small></div></div></td><td>{member.phone}</td><td>{member.gender ? local(member.gender, member.gender === "女" ? "Female" : "Male") : "—"}<small>{member.birth_date || local("未填写生日", "No birth date")}</small></td><td>{activeCards.length ? <Badge tone="green">{activeCards.map((card) => local(card.product_name, card.product_name_en)).join(local("、", ", "))}</Badge> : <Badge>{local("未开卡", "No card")}</Badge>}</td><td>{first ? money(first.purchase_price) : "—"}</td><td>{first?.expires_on || "—"}</td><td>{member.advisor_name || "—"}</td><td>{member.created_at ? local(`${Math.max(0, Math.floor((Date.now() - new Date(member.created_at.replace(" ", "T")).getTime()) / 86400000))} 天`, `${Math.max(0, Math.floor((Date.now() - new Date(member.created_at.replace(" ", "T")).getTime()) / 86400000))} days`) : "—"}</td></tr>; })}</tbody></table></ResponsiveTable>{members.length === 0 && <Empty>{local("没有匹配的会员，调整搜索条件或新建档案。", "No matching members")}</Empty>}</section>}
    {detail && <MemberProfileDrawer key={detail.id} detail={detail} members={members} meta={meta} canWrite={canWrite} onClose={() => { setDetail(null); void loadMembers(); }} onSelect={(id) => void openDetail(id)} onEdit={openEdit} onChanged={reloadDetail}/>}
    {formOpen && <Modal title={editing ? local("编辑会员资料", "Edit member") : local("新建会员", "New member")} wide onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={saveMember}><Field label={local("姓名（必填）", "Name (required)")}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label={local("英文名", "English name")}><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })}/></Field><Field label={local("手机号（必填）", "Mobile (required)")}><input required pattern="1[0-9]{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></Field><Field label={local("性别", "Gender")}><select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">{local("未填写", "Not provided")}</option><option value="女">{local("女", "Female")}</option><option value="男">{local("男", "Male")}</option><option value="其他">{local("其他", "Other")}</option></select></Field><Field label={local("出生日期", "Birth date")}><input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })}/></Field><Field label={local("证件号", "ID number")}><input value={form.id_number} onChange={(event) => setForm({ ...form, id_number: event.target.value })}/></Field><Field label={local("获客来源", "Source")}><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}/></Field><Field label={local("会籍归属", "Advisor")}><select value={form.advisor_id} onChange={(event) => setForm({ ...form, advisor_id: event.target.value })}><option value="">{local("未分配", "Unassigned")}</option>{meta?.users.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></Field><Field label={local("微信号", "WeChat")}><input value={form.wechat} onChange={(event) => setForm({ ...form, wechat: event.target.value })}/></Field><Field label={local("紧急联系电话", "Emergency contact")}><input value={form.emergency_phone} onChange={(event) => setForm({ ...form, emergency_phone: event.target.value })}/></Field><Field label={local("备注", "Notes")} className="span-two"><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></Field><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? local("保存中…", "Saving…") : local("保存会员资料", "Save member")}</button></form></Modal>}
  </div>;
}
