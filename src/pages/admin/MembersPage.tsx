import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { MemberProfileDrawer } from "@/components/MemberProfileDrawer";
import { Badge, Dropdown, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money } from "@/lib/date";
import { genderLabel } from "@/lib/memberCopy";
import { hasCapability, useCan, type Capability } from "@/lib/permissions";
import type { Member, MemberDetail, Meta } from "@/types";

interface MemberForm { name: string; name_en: string; phone: string; gender: string; id_number: string; birth_date: string; source: string; source_other: string; advisor_id: string; emergency_phone: string; wechat: string; notes: string }
const emptyForm: MemberForm = { name: "", name_en: "", phone: "", gender: "", id_number: "", birth_date: "", source: "", source_other: "", advisor_id: "", emergency_phone: "", wechat: "", notes: "" };
const SOURCE_OTHER = "其他";
const SOURCE_PREFIX = "其他 · ";
const CARD_CATEGORY_OPTIONS = [{ value: "group", zh: "团课", en: "Group" }, { value: "private", zh: "私教", en: "PT" }, { value: "annual", zh: "年卡/组合套餐", en: "Annual package" }];
const EXPORT_SCOPES = { all: { zh: "全部会员", en: "All members" }, new: { zh: "当月新进会员", en: "New this month" }, renew_pending: { zh: "当月未续会会员", en: "Not renewed this month" } } as const;
const SORT_OPTIONS = [{ value: "card", zh: "按卡种", en: "By card" }, { value: "name", zh: "按姓名", en: "By name" }, { value: "joined", zh: "按加入时间", en: "By join date" }] as const;
interface CardStat { product_id: number; name: string; name_en: string; category: string; count: number }
const CATEGORY_GROUP_LABEL: Record<string, string> = { group: "团课", private: "私教", annual: "年卡/组合套餐", package: "年卡/组合套餐", assessment: "私教" };
function splitSource(source: string) { const value = (source || "").trim(); return value.startsWith(SOURCE_PREFIX) ? { option: SOURCE_OTHER, other: value.slice(SOURCE_PREFIX.length).trim() } : { option: value, other: "" }; }

export function MembersPage() {
  const { user } = useAuth();
  const { local } = useLanguage();
  const canWrite = useCan("members.write");
  const canCards = useCan("cards.write");
  const can = (capability: Capability) => hasCapability(user?.role, capability, user?.capabilities);
  const [members, setMembers] = useState<Member[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [cardStatus, setCardStatus] = useState("");
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<keyof typeof EXPORT_SCOPES>("all");
  const [exportCategories, setExportCategories] = useState<string[]>([]);
  const [exportOnlyCards, setExportOnlyCards] = useState(true);
  const [sort, setSort] = useState("card");
  const [cardStats, setCardStats] = useState<CardStat[]>([]);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const latestRequest = useRef(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDays, setBatchDays] = useState("7");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const requestId = ++latestRequest.current;
    try {
      const params = new URLSearchParams({ sort }); if (query) params.set("q", query); if (categories.length) params.set("category", categories.join(",")); if (cardStatus) params.set("card_status", cardStatus);
      const result = await apiFetch<{ items: Member[]; card_stats?: CardStat[] }>(`/api/admin/members?${params}`); if (requestId === latestRequest.current) { setMembers(result.items); setCardStats(result.card_stats ?? []); }
    } catch (err) { if (requestId === latestRequest.current) setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [query, categories, cardStatus, sort]);
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
    const source = splitSource(detail.source);
    setEditing(true); setForm({ name: detail.name, name_en: detail.name_en, phone: detail.phone, gender: detail.gender, id_number: detail.id_number, birth_date: detail.birth_date, source: source.option, source_other: source.other, advisor_id: String(detail.advisor_id ?? ""), emergency_phone: detail.emergency_phone, wechat: detail.wechat, notes: detail.notes }); setFormOpen(true);
  }
  async function saveMember(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const source = form.source === SOURCE_OTHER ? (form.source_other.trim() ? `${SOURCE_PREFIX}${form.source_other.trim()}` : SOURCE_OTHER) : form.source;
    const payload = { ...form, source, advisor_id: form.advisor_id ? Number(form.advisor_id) : null };
    try {
      const result = await apiFetch<MemberDetail>(editing && detail ? `/api/admin/members/${detail.id}` : "/api/admin/members", { method: editing ? "PATCH" : "POST", json: payload });
      setMessage(local(editing ? "会员资料已更新" : "会员档案已创建", editing ? "Member details updated" : "Member profile created")); setFormOpen(false); await loadMembers(); if (editing) await openDetail(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function exportMembers(scope: keyof typeof EXPORT_SCOPES, selectedCategories: string[] = [], onlyCards = true) {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ scope, only_cards: onlyCards ? "1" : "0" });
      if (scope !== "all") params.set("month", exportMonth);
      if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
      const label = EXPORT_SCOPES[scope];
      await downloadFile(`/api/admin/export/members.xlsx?${params}`, `会员列表-${label.zh}-${exportMonth}.xlsx`);
      setExportOpen(false);
      setMessage(local(`会员名单已导出为 Excel（${onlyCards ? "仅含已购卡客户" : "含全部客户"}，附卡种统计页）`, "Member list exported as Excel with a card-type summary sheet"));
    } catch (err) { setError(err instanceof Error ? err.message : local("导出失败，请稍后重试", "Export failed. Please try again later.")); }
    finally { setBusy(false); }
  }
  async function batchExtend() {
    const days = Number(batchDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) { setError(local("延期天数需在 1-365 之间", "Days must be between 1 and 365")); return; }
    setBusy(true); setError("");
    try { const result = await apiFetch<{ updated: number }>("/api/admin/cards/batch-extend", { method: "POST", json: { days, note: "闭馆统一延期" } }); setMessage(local(`已为 ${result.updated} 张有效会员卡延期`, `Extended ${result.updated} active cards`)); setBatchOpen(false); await loadMembers(); }
    catch (err) { setError(err instanceof Error ? err.message : local("批量延期失败", "Batch extension failed")); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader eyebrow="MEMBER DIRECTORY" title={local("会员管理", "Members")} description={local("资料、卡课权益、预约历史、评估附件与跟进提醒，形成完整会员档案。", "Profiles, benefits, bookings, assessment files and follow-up reminders in one member record.")} actions={canWrite && <><button className="button button-outline" type="button" disabled={!canCards} onClick={() => { setBatchOpen(true); setError(""); }}>{local("批量延期", "Batch extend")}</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={18}/>{local("新建客户", "New member")}</button></>}/>
    <section className="filter-panel member-filter"><label className="search-box"><Icon name="search" size={18}/><input aria-label={local("搜索会员", "Search members")} placeholder={local("搜索姓名、英文名或手机号", "Search name or mobile")} value={query} onChange={(event) => setQuery(event.target.value)}/></label><Dropdown label={categories.length === 0 ? local("全部卡种", "All cards") : categories.length === 1 ? local(CARD_CATEGORY_OPTIONS.find((option) => option.value === categories[0])?.zh ?? "卡种", CARD_CATEGORY_OPTIONS.find((option) => option.value === categories[0])?.en ?? "Cards") : local(`${categories.length} 项卡种`, `${categories.length} card types`)}>{CARD_CATEGORY_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={categories.includes(option.value)} onChange={(event) => setCategories((previous) => event.target.checked ? [...previous, option.value] : previous.filter((item) => item !== option.value))}/>{local(option.zh, option.en)}</label>)}</Dropdown><select aria-label={local("持卡状态", "Card status")} value={cardStatus} onChange={(event) => setCardStatus(event.target.value)}><option value="">{local("全部持卡状态", "All card status")}</option><option value="active">{local("有有效卡", "Has active card")}</option><option value="expired">{local("卡已过期", "Card expired")}</option><option value="pending">{local("开卡日期待定", "Start date pending")}</option><option value="none">{local("未开卡", "No card")}</option></select><Dropdown label={local(`排序：${SORT_OPTIONS.find((option) => option.value === sort)?.zh ?? "按卡种"}`, `Sort: ${SORT_OPTIONS.find((option) => option.value === sort)?.en ?? "By card"}`)}>{SORT_OPTIONS.map((option) => <label key={option.value}><input type="radio" name="member-sort" checked={sort === option.value} onChange={() => setSort(option.value)}/>{local(option.zh, option.en)}</label>)}</Dropdown><Dropdown align="right" label={<><Icon name="download" size={17}/>{local("导出", "Export")}</>}><button className="dropdown-item" type="button" onClick={() => { setExportOpen(true); setError(""); }}>{local("导出会员名单（Excel，含照片）", "Export member list (Excel)")}</button><div className="dropdown-separator"/><button className="dropdown-item" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/members.csv", "members.csv")}>{local("客户档案（CSV）", "Member list (CSV)")}</button></Dropdown></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("会员", "Member")}</th><th>{local("手机号", "Mobile")}</th><th>{local("性别 / 生日", "Gender / birth date")}</th><th>{local("有效会员卡", "Active cards")}</th><th>{local("购卡价格", "Price")}</th><th>{local("到期日期", "Expiry")}</th><th>{local("会籍归属", "Advisor")}</th><th>{local("会员时长", "Member for")}</th></tr></thead><tbody>{members.map((member) => { const activeCards = member.cards?.filter((card) => card.status === "active") ?? []; const first = activeCards[0]; return <tr key={member.id} className="clickable-row" tabIndex={0} onClick={() => void openDetail(member.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openDetail(member.id); } }}><td><div className="member-cell">{member.photo_url ? <img className="member-photo" src={member.photo_url} alt={member.name}/> : <span className="user-avatar">{member.name.slice(0, 1)}</span>}<div><button className="member-name-button" type="button" onClick={(event) => { event.stopPropagation(); void openDetail(member.id); }}><strong>{member.name} {member.name_en}</strong></button><small>#{String(member.id).padStart(4, "0")}</small></div></div></td><td>{member.phone}</td><td>{member.gender ? genderLabel(member.gender, local) : "—"}<small>{member.birth_date || local("未填写生日", "No birth date")}</small></td><td>{activeCards.length ? <Badge tone="green">{activeCards.map((card) => local(card.product_name, card.product_name_en)).join(local("、", ", "))}</Badge> : <Badge>{local("未开卡", "No card")}</Badge>}</td><td>{first ? money(first.purchase_price) : "—"}</td><td>{first?.expires_on || "—"}</td><td>{member.advisor_name || "—"}</td><td>{member.created_at ? local(`${Math.max(0, Math.floor((Date.now() - new Date(member.created_at.replace(" ", "T")).getTime()) / 86400000))} 天`, `${Math.max(0, Math.floor((Date.now() - new Date(member.created_at.replace(" ", "T")).getTime()) / 86400000))} days`) : "—"}</td></tr>; })}</tbody></table></ResponsiveTable>{members.length === 0 && <Empty>{local("没有匹配的会员，调整搜索条件或新建档案。", "No matching members")}</Empty>}</section>}
    {cardStats.length > 0 && <section className="card-stats-strip"><span className="card-stats-title">{local("卡种人数统计", "Cards by type")}</span><div className="card-stats-list">{cardStats.map((item) => <span key={item.product_id} className="card-stat-chip"><em>{CATEGORY_GROUP_LABEL[item.category] ?? item.category}</em>{local(item.name, item.name_en)}<b>{item.count}</b></span>)}</div></section>}
    {detail && <MemberProfileDrawer detail={detail} members={members} meta={meta} can={can} onClose={() => { setDetail(null); void loadMembers(); }} onSelect={(id) => void openDetail(id)} onEdit={openEdit} onChanged={reloadDetail}/>}
    {batchOpen && <Modal title={local("批量延期有效会员卡", "Batch extend active cards")} onClose={() => setBatchOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void batchExtend(); }}><p className="form-help">{local("将为所有状态正常的会员卡统一延期，请谨慎执行。", "Every active membership card will be extended by the same number of days.")}</p><Field label={local("延期天数（1-365）", "Days to extend (1–365)")}><input required min={1} max={365} type="number" data-autofocus value={batchDays} onChange={(event) => setBatchDays(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{busy ? local("处理中…", "Working…") : local("确认延期", "Extend cards")}</button><button className="button button-outline button-full" type="button" onClick={() => setBatchOpen(false)}>{local("取消", "Cancel")}</button></form></Modal>}
    {exportOpen && <Modal title={local("导出会员名单（Excel，含照片）", "Export member list (Excel)")} onClose={() => setExportOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void exportMembers(exportScope, exportCategories, exportOnlyCards); }}><p className="form-help">{local("默认只导出真正买过会员卡的客户；可按卡种多选，导出文件附带「卡种统计」页。", "Only members who actually purchased a card are exported by default; pick card types to narrow down. The file includes a card-type summary sheet.")}</p><div className="export-options"><span className="export-options-title">{local("导出范围", "Scope")}</span>{(Object.keys(EXPORT_SCOPES) as (keyof typeof EXPORT_SCOPES)[]).map((key) => <label key={key}><input type="radio" name="export-scope" checked={exportScope === key} onChange={() => setExportScope(key)}/>{local(EXPORT_SCOPES[key].zh, EXPORT_SCOPES[key].en)}</label>)}</div>{exportScope !== "all" && <Field label={local("统计月份", "Month")}><input type="month" value={exportMonth} onChange={(event) => setExportMonth(event.target.value)}/></Field>}<label className="export-check"><input type="checkbox" checked={exportOnlyCards} onChange={(event) => setExportOnlyCards(event.target.checked)}/>{local("仅导出已购卡客户（团课 / 私教 / 年卡·组合套餐）", "Only members who purchased a card")}</label><div className="export-options"><span className="export-options-title">{local("卡种（可多选，不选为全部卡种）", "Card types (multi-select)")}</span>{CARD_CATEGORY_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={exportCategories.includes(option.value)} onChange={(event) => setExportCategories((previous) => event.target.checked ? [...previous, option.value] : previous.filter((item) => item !== option.value))}/>{local(option.zh, option.en)}</label>)}</div><button className="button button-primary button-full" disabled={busy} type="submit">{busy ? local("导出中…", "Exporting…") : local("导出 Excel", "Export Excel")}</button><button className="button button-outline button-full" type="button" onClick={() => setExportOpen(false)}>{local("取消", "Cancel")}</button></form></Modal>}
    {formOpen && <Modal title={editing ? local("编辑客户资料", "Edit member") : local("新建客户", "New member")} wide onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={saveMember}><Field label={local("姓名（必填）", "Name (required)")}><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label={local("英文名", "English name")}><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })}/></Field><Field label={local("手机号（必填）", "Mobile (required)")}><input required pattern="1[0-9]{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></Field><Field label={local("性别", "Gender")}><select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">{local("未填写", "Not provided")}</option><option value="女">{local("女", "Female")}</option><option value="男">{local("男", "Male")}</option><option value="其他">{local("其他", "Other")}</option></select></Field><Field label={local("出生日期", "Birth date")}><input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })}/></Field><Field label={local("证件号", "ID number")}><input value={form.id_number} onChange={(event) => setForm({ ...form, id_number: event.target.value })}/></Field><Field label={local("获客来源", "Source")}><select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value, source_other: event.target.value === SOURCE_OTHER ? form.source_other : "" })}><option value="">{local("未填写", "Not provided")}</option>{(meta?.member_sources ?? []).map((item) => <option key={item} value={item}>{item}</option>)}{form.source && !(meta?.member_sources ?? []).includes(form.source) && <option value={form.source}>{form.source} · {local("历史记录", "legacy value")}</option>}</select></Field>{form.source === SOURCE_OTHER && <Field label={local("来源说明", "Source detail")}><input value={form.source_other} onChange={(event) => setForm({ ...form, source_other: event.target.value })} placeholder={local("如：小区业主群、电梯广告", "e.g. neighbourhood group, lift ad")}/></Field>}<Field label={local("会籍归属", "Advisor")}><select value={form.advisor_id} onChange={(event) => setForm({ ...form, advisor_id: event.target.value })}><option value="">{local("未分配", "Unassigned")}</option>{meta?.users.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></Field><Field label={local("微信号", "WeChat")}><input value={form.wechat} onChange={(event) => setForm({ ...form, wechat: event.target.value })}/></Field><Field label={local("紧急联系电话", "Emergency contact")}><input value={form.emergency_phone} onChange={(event) => setForm({ ...form, emergency_phone: event.target.value })}/></Field><Field label={local("备注", "Notes")} className="span-two"><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></Field><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? local("保存中…", "Saving…") : local("保存会员资料", "Save member")}</button></form></Modal>}
  </div>;
}
