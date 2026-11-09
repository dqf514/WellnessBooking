import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { formatDateTime, money, today } from "@/lib/date";
import type { Member, MemberCard, MemberDetail, Meta } from "@/types";

interface MemberForm { name: string; name_en: string; phone: string; gender: string; id_number: string; birth_date: string; source: string; advisor_id: string; emergency_phone: string; wechat: string; notes: string }
const emptyForm: MemberForm = { name: "", name_en: "", phone: "", gender: "", id_number: "", birth_date: "", source: "", advisor_id: "", emergency_phone: "", wechat: "", notes: "" };
const bookingStatus: Record<string, string> = { booked: "待上课", checked_in: "已签到", completed: "已完成", cancelled: "已取消", no_show: "爽约" };

export function MembersPage() {
  const { user } = useAuth();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState(0);
  const [payment, setPayment] = useState("wechat");
  const [startsOn, setStartsOn] = useState(today());
  const [tab, setTab] = useState<"bookings" | "records" | "transactions">("bookings");
  const [cardTarget, setCardTarget] = useState<MemberCard | null>(null);
  const [cardAction, setCardAction] = useState("extend");
  const [cardDays, setCardDays] = useState(30);
  const [frozenUntil, setFrozenUntil] = useState("");
  const [cardNote, setCardNote] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordType, setRecordType] = useState("assessment");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordContent, setRecordContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (query) params.set("q", query); if (category) params.set("category", category);
      const result = await apiFetch<{ items: Member[] }>(`/api/admin/members?${params}`); setMembers(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
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
      setDetail({ ...memberDetail, documents: documentResult.items }); setTab("bookings");
    }
    catch (err) { setError(err instanceof Error ? err.message : "加载会员失败"); }
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
      setMessage(editing ? "会员资料已更新" : "会员档案已创建"); setFormOpen(false); await loadMembers(); if (editing) await openDetail(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setBusy(false); }
  }
  function openPurchase() {
    if (!meta) return;
    const product = meta.products.find((item) => item.active); setProductId(String(product?.id ?? "")); setPrice(product?.price ?? 0); setPurchaseOpen(true);
  }
  async function purchase(event: FormEvent) {
    event.preventDefault(); if (!detail) return; setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/cards`, { method: "POST", json: { product_id: Number(productId), price, payment_method: payment, starts_on: startsOn } }); setMessage("购卡与入账已完成"); setPurchaseOpen(false); await reloadDetail(); }
    catch (err) { setError(err instanceof Error ? err.message : "购卡失败"); }
    finally { setBusy(false); }
  }
  function editCard(card: MemberCard) { setCardTarget(card); setCardAction("extend"); setCardDays(30); setFrozenUntil(card.frozen_until); setCardNote(card.note); setRemaining(card.remaining_sessions ?? 0); }
  async function saveCard(event: FormEvent) {
    event.preventDefault(); if (!cardTarget) return; setBusy(true);
    const payload: Record<string, unknown> = { action: cardAction, note: cardNote };
    if (cardAction === "extend") payload.days = cardDays;
    if (cardAction === "freeze") payload.frozen_until = frozenUntil;
    if (cardAction === "adjust") payload.remaining_sessions = remaining;
    try { await apiFetch(`/api/admin/cards/${cardTarget.id}`, { method: "PATCH", json: payload }); setMessage("会员卡权益已更新"); setCardTarget(null); await reloadDetail(); }
    catch (err) { setError(err instanceof Error ? err.message : "卡操作失败"); }
    finally { setBusy(false); }
  }
  async function addRecord(event: FormEvent) {
    event.preventDefault(); if (!detail) return; setBusy(true);
    try { await apiFetch(`/api/admin/members/${detail.id}/records`, { method: "POST", json: { record_type: recordType, title: recordTitle, content: recordContent, record_date: today() } }); setRecordTitle(""); setRecordContent(""); setRecordOpen(false); setTab("records"); setMessage("训练/评估记录已保存"); await reloadDetail(); }
    catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setBusy(false); }
  }
  async function uploadDocument(file: File | null) {
    if (!file || !detail) return;
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file);
    try { await apiFetch(`/api/admin/members/${detail.id}/documents`, { method: "POST", body }); setMessage("合同资料已上传"); await reloadDetail(); }
    catch (err) { setError(err instanceof Error ? err.message : "上传失败"); }
    finally { setBusy(false); }
  }
  async function batchExtend() {
    const raw = window.prompt("为所有有效会员卡统一延期多少天？（1-365）", "7"); if (!raw) return;
    try { const result = await apiFetch<{ updated: number }>("/api/admin/cards/batch-extend", { method: "POST", json: { days: Number(raw), note: "闭馆统一延期" } }); setMessage(`已为 ${result.updated} 张有效会员卡延期`); await loadMembers(); }
    catch (err) { setError(err instanceof Error ? err.message : "批量延期失败"); }
  }

  return <div><PageHeader eyebrow="MEMBER DIRECTORY" title="会员管理" description="资料、卡课权益、预约历史与私教/评估记录，形成完整会员档案。" actions={canWrite && <><button className="button button-outline" type="button" onClick={() => void batchExtend()}>批量延期</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={18}/>新建会员</button></>}/><section className="filter-panel member-filter"><label className="search-box"><Icon name="search" size={18}/><input aria-label="搜索会员" placeholder="搜索姓名、英文名或手机号" value={query} onChange={(event) => setQuery(event.target.value)}/></label><select aria-label="会员卡类别" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部卡种</option><option value="group">团课卡</option><option value="private">私教卡</option><option value="assessment">评估卡</option><option value="package">套餐</option></select><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/members.csv", "members.csv")}><Icon name="download" size={17}/>导出</button></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {loading ? <Spinner/> : <section className="panel table-panel"><div className="responsive-table"><table className="data-table"><thead><tr><th>会员</th><th>手机号</th><th>性别 / 生日</th><th>有效会员卡</th><th>购卡价格</th><th>到期日期</th><th>会籍归属</th><th>会员时长</th></tr></thead><tbody>{members.map((member) => { const activeCards = member.cards?.filter((card) => card.status === "active") ?? []; const first = activeCards[0]; return <tr key={member.id} className="clickable-row" onClick={() => void openDetail(member.id)}><td><div className="member-cell"><span className="user-avatar">{member.name.slice(0, 1)}</span><div><strong>{member.name} {member.name_en}</strong><small>#{String(member.id).padStart(4, "0")}</small></div></div></td><td>{member.phone}</td><td>{member.gender || "—"}<small>{member.birth_date || "未填写生日"}</small></td><td>{activeCards.length ? <Badge tone="green">{activeCards.map((card) => card.product_name).join("、")}</Badge> : <Badge>未开卡</Badge>}</td><td>{first ? money(first.purchase_price) : "—"}</td><td>{first?.expires_on || "—"}</td><td>{member.advisor_name || "—"}</td><td>{member.created_at ? `${Math.max(0, Math.floor((Date.now() - new Date(member.created_at.replace(" ", "T")).getTime()) / 86400000))} 天` : "—"}</td></tr>; })}</tbody></table></div>{members.length === 0 && <Empty>没有匹配的会员，调整搜索条件或新建档案。</Empty>}</section>}

    {formOpen && <Modal title={editing ? "编辑会员资料" : "新建会员"} wide onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={saveMember}><Field label="姓名（必填）"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label="英文名"><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })}/></Field><Field label="手机号（必填）"><input required pattern="1[0-9]{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></Field><Field label="性别"><select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">未填写</option><option>女</option><option>男</option><option>其他</option></select></Field><Field label="出生日期"><input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })}/></Field><Field label="证件号"><input value={form.id_number} onChange={(event) => setForm({ ...form, id_number: event.target.value })}/></Field><Field label="获客来源"><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}/></Field><Field label="会籍归属"><select value={form.advisor_id} onChange={(event) => setForm({ ...form, advisor_id: event.target.value })}><option value="">未分配</option>{meta?.users.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></Field><Field label="微信号"><input value={form.wechat} onChange={(event) => setForm({ ...form, wechat: event.target.value })}/></Field><Field label="紧急联系电话"><input value={form.emergency_phone} onChange={(event) => setForm({ ...form, emergency_phone: event.target.value })}/></Field><Field label="备注" className="span-two"><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></Field><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? "保存中…" : "保存会员资料"}</button></form></Modal>}

    {detail && <Modal wide title="会员档案" onClose={() => setDetail(null)}><div className="member-profile"><div className="profile-actions">{canWrite && <><button type="button" onClick={openEdit}><Icon name="settings"/><span>编辑资料</span></button><button type="button" onClick={openPurchase}><Icon name="card"/><span>购卡 / 购课</span></button><button type="button" onClick={() => setRecordOpen(true)}><Icon name="book"/><span>新增记录</span></button><label className="profile-upload"><Icon name="plus"/><span>上传合同</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={(event) => { void uploadDocument(event.target.files?.[0] ?? null); event.target.value = ""; }}/></label></>}</div><section className="profile-summary"><span className="profile-avatar">{detail.name.slice(0, 1)}</span><div><h2>{detail.name} <small>{detail.name_en}</small></h2><p>{detail.phone} · {detail.gender || "性别未填"} · {detail.birth_date || "生日未填"}</p><div className="profile-meta"><span>获客来源<strong>{detail.source || "—"}</strong></span><span>会籍归属<strong>{detail.advisor_name || "—"}</strong></span><span>微信号<strong>{detail.wechat || "—"}</strong></span><span>紧急联系<strong>{detail.emergency_phone || "—"}</strong></span></div>{detail.notes && <p className="profile-note"><Icon name="bell" size={16}/>{detail.notes}</p>}</div></section><section className="profile-cards"><header><h3>会员卡 <Badge>{detail.cards?.length ?? 0}</Badge></h3><span>正常 / 冻结 / 失效权益集中管理</span></header>{detail.cards?.map((card) => <article key={card.id}><div><strong>{card.product_name}</strong><small>{card.card_no} · {card.purchased_at} 购卡</small></div><div><span>{card.total_sessions ? `${card.total_sessions} 次，剩余 ${card.remaining_sessions ?? 0} 次` : "周期不限次"}</span>{card.benefits.length > 0 && <small>{card.benefits.map((benefit) => `${benefit.course_type} ${benefit.remaining ?? 0}`).join(" · ")}</small>}</div><div><span>{card.starts_on} ~ {card.expires_on}</span><small>{card.frozen_until ? `冻结至 ${card.frozen_until}` : card.note || "—"}</small></div><Badge tone={card.status === "active" ? "green" : "neutral"}>{card.status === "active" ? "正常" : card.status === "expired" ? "已过期" : "已销卡"}</Badge>{canWrite && <button className="button button-small button-outline" type="button" onClick={() => editCard(card)}>卡操作</button>}</article>)}{detail.cards?.length === 0 && <Empty>尚未购卡</Empty>}</section><div className="me-tabs"><button className={tab === "bookings" ? "active" : ""} type="button" onClick={() => setTab("bookings")}>上课与预约记录</button><button className={tab === "records" ? "active" : ""} type="button" onClick={() => setTab("records")}>评估 / 私教日记</button><button className={tab === "transactions" ? "active" : ""} type="button" onClick={() => setTab("transactions")}>消费记录</button></div>{tab === "bookings" && <div className="responsive-table"><table className="data-table"><thead><tr><th>开课时间</th><th>课程</th><th>教练</th><th>预约用卡</th><th>状态</th><th>预约时间</th></tr></thead><tbody>{detail.bookings.map((booking) => <tr key={booking.id}><td>{booking.session?.session_date} {booking.session?.start_time}</td><td>{booking.session?.course.name}</td><td>{booking.session?.teacher.name}</td><td>{booking.card_name || "—"}</td><td>{bookingStatus[booking.status]}</td><td>{formatDateTime(booking.booked_at)}</td></tr>)}</tbody></table>{detail.bookings.length === 0 && <Empty>暂无上课记录</Empty>}</div>}{tab === "records" && <div className="record-list">{detail.records.map((record) => <article key={record.id}><span>{record.record_date} · {record.record_type === "pt_diary" ? "PT diary" : record.record_type === "assessment" ? "Assessment" : "Note"}</span><h3>{record.title}</h3><p>{record.content}</p><small>{record.teacher_name}</small></article>)}{detail.records.length === 0 && <Empty>暂无评估或私教训练记录</Empty>}</div>}<div className="documents-list"><h3>合同与资料</h3>{detail.documents?.map((document) => <article key={document.id}><div><strong>{document.original_name}</strong><small>{(document.size_bytes / 1024).toFixed(1)} KB · {document.created_at} · {document.uploaded_by}</small></div><button className="text-button" type="button" onClick={() => void downloadFile(`/api/admin/documents/${document.id}/download`, document.original_name)}><Icon name="download" size={16}/>下载</button></article>)}{detail.documents?.length === 0 && <p>尚未上传合同资料</p>}</div>{tab === "transactions" && <div className="responsive-table"><table className="data-table"><thead><tr><th>日期</th><th>类别</th><th>摘要</th><th>支付方式</th><th>金额</th></tr></thead><tbody>{detail.transactions.map((row) => <tr key={row.id}><td>{row.occurred_at}</td><td>{row.category}</td><td>{row.note}</td><td>{row.payment_method}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div>}</div></Modal>}

    {purchaseOpen && detail && <Modal title={`为 ${detail.name} 购卡`} onClose={() => setPurchaseOpen(false)}><form className="form-grid" onSubmit={purchase}><Field label="卡课产品"><select value={productId} onChange={(event) => { setProductId(event.target.value); setPrice(meta?.products.find((item) => item.id === Number(event.target.value))?.price ?? 0); }}>{meta?.products.filter((item) => item.active).map((product) => <option key={product.id} value={product.id}>{product.name} · 原价 {money(product.price)}</option>)}</select></Field><div className="form-grid two-columns"><Field label="实收价格"><input required min={0} type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))}/></Field><Field label="开卡日期"><input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)}/></Field></div><Field label="结账方式"><select value={payment} onChange={(event) => setPayment(event.target.value)}>{[["cash", "现金"], ["pos", "POS 通"], ["company_qr", "公司二维码"], ["alipay", "支付宝"], ["wechat", "微信"], ["ar", "AR account"], ["ent", "ENT"], ["youzan", "有赞"], ["dianping", "大众点评"], ["voucher", "券"], ["stored_card", "储值卡"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><button className="button button-primary button-full" disabled={busy} type="submit">确认购卡并入账</button></form></Modal>}

    {cardTarget && <Modal title={`${cardTarget.product_name} · 卡操作`} onClose={() => setCardTarget(null)}><form className="form-grid" onSubmit={saveCard}><Field label="操作类型"><select value={cardAction} onChange={(event) => setCardAction(event.target.value)}><option value="extend">续卡 / 延期</option><option value="freeze">请假 / 停卡</option><option value="unfreeze">解除停卡</option><option value="adjust">手动调整剩余次数</option><option value="activate">重新启用</option><option value="cancel">销卡</option></select></Field>{cardAction === "extend" && <Field label="延期天数（负数可缩短）"><input type="number" value={cardDays} onChange={(event) => setCardDays(Number(event.target.value))}/></Field>}{cardAction === "freeze" && <Field label="冻结截止日期"><input required type="date" value={frozenUntil} onChange={(event) => setFrozenUntil(event.target.value)}/></Field>}{cardAction === "adjust" && <Field label="剩余次数"><input min={0} type="number" value={remaining} onChange={(event) => setRemaining(Number(event.target.value))}/></Field>}<Field label="操作原因 / 备注（必填）"><textarea required rows={3} value={cardNote} onChange={(event) => setCardNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">确认卡操作</button></form></Modal>}

    {recordOpen && detail && <Modal title="新增评估 / 私教记录" onClose={() => setRecordOpen(false)}><form className="form-grid" onSubmit={addRecord}><Field label="记录类型"><select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option value="assessment">体测 / Assessment</option><option value="pt_diary">私教训练内容 / PT diary</option><option value="note">跟进备注</option></select></Field><Field label="标题"><input required value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)}/></Field><Field label="详细记录"><textarea required rows={6} value={recordContent} onChange={(event) => setRecordContent(event.target.value)} placeholder="训练内容、身体反馈、下次练习建议…"/></Field><button className="button button-primary button-full" disabled={busy} type="submit">保存记录</button></form></Modal>}
  </div>;
}
