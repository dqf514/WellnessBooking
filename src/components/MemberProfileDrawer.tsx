import { useMemo, useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { EntryOptionsFields } from "@/components/EntryOptionsFields";
import { MemberDocuments } from "@/components/MemberDocuments";
import { MemberPicker } from "@/components/MemberPicker";
import { PhotoCropper } from "@/components/PhotoCropper";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Empty, Icon, Modal, ResponsiveTable } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, formatDateTime, money, today } from "@/lib/date";
import { categoryLabel as financeCategoryLabel, canonicalCategory, courseTypeLabel, paymentLabel, paymentMethods } from "@/lib/financeCopy";
import { genderLabel } from "@/lib/memberCopy";
import { type Capability } from "@/lib/permissions";
import { transactionNote } from "@/lib/transactionCopy";
import type { MemberCard, MemberDetail, MemberOption, Meta, Product } from "@/types";

export function MemberProfileDrawer({ detail, members, meta, can, onClose, onSelect, onEdit, onChanged }: { detail: MemberDetail; members: MemberOption[]; meta: Meta | null; can: (capability: Capability) => boolean; onClose: () => void; onSelect: (id: number) => void; onEdit: () => void; onChanged: () => Promise<void> }) {
  const { local, language } = useLanguage();
  // 会员档案里的操作按能力细分：改资料、收款、卡权益与跟进记录各自独立授权。
  const canMemberWrite = can("members.write");
  const canRevenue = can("revenue.write");
  const canCards = can("cards.write");
  const canRecords = can("records.write");
  const [tab, setTab] = useState<"bookings" | "private_bookings" | "records" | "transactions" | "assessments" | "contracts">("bookings");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [renewal, setRenewal] = useState(false);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState(0);
  const [payment, setPayment] = useState("wechat");
  const [startsOn, setStartsOn] = useState(today());
  const [purchaseNote, setPurchaseNote] = useState("");
  const [recordCash, setRecordCash] = useState(true);
  const [revenueMode, setRevenueMode] = useState("immediate");
  const [revenueStartOn, setRevenueStartOn] = useState(today());
  const [revenueDays, setRevenueDays] = useState(30);
  const [revenuePolicy, setRevenuePolicy] = useState<{ system: string; effective: string } | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [cardStartPending, setCardStartPending] = useState(false);
  const [cardTarget, setCardTarget] = useState<MemberCard | null>(null);
  const [cardAction, setCardAction] = useState("edit");
  const [cardStart, setCardStart] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [frozenFrom, setFrozenFrom] = useState("");
  const [frozenUntil, setFrozenUntil] = useState("");
  const [cardNote, setCardNote] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [targetMemberId, setTargetMemberId] = useState("");
  const [upgradeProductId, setUpgradeProductId] = useState("");
  const [upgradePrice, setUpgradePrice] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [recordType, setRecordType] = useState("pt_diary");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordContent, setRecordContent] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderContent, setReminderContent] = useState("");
  const [remindOn, setRemindOn] = useState(today());
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [voucherType, setVoucherType] = useState("group");
  const [voucherQuantity, setVoucherQuantity] = useState(1);
  const [voucherExpiry, setVoucherExpiry] = useState(addDays(today(), 30));
  const [voucherNote, setVoucherNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cardCancelConfirmed, setCardCancelConfirmed] = useState(false);
  const [switchQuery, setSwitchQuery] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void> } | null>(null);
  // 会员上千后侧边清单不再全量渲染：可按姓名或手机号检索，最多列出 40 人。
  const switchList = useMemo(() => {
    const keyword = switchQuery.trim().toLowerCase();
    const pool = keyword ? members.filter((member) => `${member.name} ${member.name_en ?? ""} ${member.phone}`.toLowerCase().includes(keyword)) : members;
    return pool.slice(0, 40);
  }, [members, switchQuery]);
  function askConfirm(title: string, description: string, confirmLabel: string, onConfirm: () => Promise<void>) { setConfirmState({ title, description, confirmLabel, onConfirm }); }
  const bookingStatus: Record<string, string> = { booked: local("待上课", "Upcoming"), checked_in: local("已消课", "Completed"), completed: local("已消课", "Completed"), cancelled: local("已取消", "Cancelled"), no_show: local("爽约", "No show") };
  const categoryLabel = (value: string) => value === "all" ? local("全部课程", "All classes") : financeCategoryLabel(value, local);
  const revenueModeLabel = (value: string) => value === "amortized" ? local("营收每日均摊", "Daily amortization") : value === "none" ? local("不入营收", "No revenue") : local("入营收（购卡时全额确认）", "Recognize revenue in full");

  const selectedProduct = meta?.products.find((item) => item.id === Number(productId));
  const privatePurchase = selectedProduct ? canonicalCategory(selectedProduct.category) === "private" : false;
  function showError(err: unknown, fallback: string) { setError(err instanceof Error ? err.message : fallback); }
  // 营收口径统一由系统设置决定，前端只读取当前生效的口径用于展示。
  async function loadRevenuePolicy(id?: number) {
    try { const policy = await apiFetch<{ system: string; effective: string }>(`/api/admin/revenue-policy${id ? `?product_id=${id}` : ""}`); setRevenuePolicy(policy); setRevenueMode(policy.effective); }
    catch { setRevenuePolicy(null); }
  }
  function selectProduct(product?: Product) {
    setProductId(String(product?.id ?? ""));
    setPrice(product?.price ?? 0);
    setRecordCash(true);
    setRevenueDays(product?.validity_days ?? 30);
    setRevenueStartOn(startsOn);
    void loadRevenuePolicy(product?.id);
  }
  function openPurchase(isRenewal = false) {
    if (!meta) return;
    setRenewal(isRenewal);
    setStartPending(false);
    selectProduct(meta.products.find((item) => item.active));
    setPurchaseNote(isRenewal ? local("续卡", "Renewal") : ""); setError(""); setPurchaseOpen(true);
  }
  async function purchase(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/cards`, { method: "POST", json: { product_id: Number(productId), price, payment_method: payment, starts_on: startsOn, start_pending: startPending, note: purchaseNote, record_cash: recordCash, revenue_mode: revenueMode, revenue_start_on: revenueStartOn, revenue_days: revenueDays, is_renewal: renewal } }); setMessage(renewal ? local("续卡已开卡并入账", "Renewal card issued and recorded") : local("购卡及所选入账方式已保存", "Card purchase and selected entry treatment saved")); setPurchaseOpen(false); await onChanged(); }
    catch (err) { showError(err, local("购卡失败", "Purchase failed")); }
    finally { setBusy(false); }
  }
  function editCard(card: MemberCard) {
    setCardTarget(card); setCardAction("edit"); setCardStart(card.starts_on); setCardExpiry(card.expires_on); setCardStartPending(card.start_pending); setFrozenFrom(card.frozen_from || ""); setFrozenUntil(card.frozen_until); setCardNote(""); setRemaining(card.remaining_sessions ?? 0); setTargetMemberId(""); setCardCancelConfirmed(false);
    const product = meta?.products.find((item) => item.active && item.id !== card.product_id && canonicalCategory(item.category) === canonicalCategory(card.category));
    setUpgradeProductId(String(product?.id ?? "")); setUpgradePrice(Math.max(0, (product?.price ?? 0) - card.purchase_price));
    // 升卡的入账口径按目标产品取系统默认，前台可逐单调整。
    if (product) { setRevenueStartOn(card.starts_on || today()); setRevenueDays(product.validity_days || 30); void loadRevenuePolicy(product.id); }
  }
  // 升卡目标按类别分组，全部在售产品都可以选。
  const upgradeGroups = (() => { const groups: Record<string, Product[]> = {}; for (const item of meta?.products ?? []) { if (!item.active || item.id === cardTarget?.product_id) continue; const key = canonicalCategory(item.category); groups[key] = [...(groups[key] ?? []), item]; } return groups; })();
  // 升卡目标产品的类别决定入账选项是否只允许入流水。
  const upgradeProduct = meta?.products.find((item) => item.id === Number(upgradeProductId));
  const upgradePrivatePurchase = upgradeProduct ? canonicalCategory(upgradeProduct.category) === "private" : false;
  async function saveCard(event: FormEvent) {
    event.preventDefault(); if (!cardTarget) return; setBusy(true); setError("");
    try {
      if (["upgrade", "transfer", "share"].includes(cardAction)) {
        const path = cardAction === "upgrade" ? "upgrade" : cardAction === "transfer" ? "transfer" : "share";
        const json = cardAction === "upgrade" ? { product_id: Number(upgradeProductId), price: upgradePrice, payment_method: payment, note: cardNote, record_cash: recordCash, revenue_mode: revenueMode, revenue_start_on: revenueStartOn, revenue_days: revenueDays } : { target_member_id: Number(targetMemberId), note: cardNote };
        await apiFetch(`/api/admin/cards/${cardTarget.id}/${path}`, { method: "POST", json });
      } else {
        // 带上版本号做乐观锁：卡权益若在别处已被改动，这里会提示刷新而不是静默覆盖。
        const payload: Record<string, unknown> = { action: cardAction, version: cardTarget.version };
        if (cardAction === "edit") { payload.start_pending = cardStartPending; if (!cardStartPending) { payload.starts_on = cardStart; payload.expires_on = cardExpiry; } if (cardNote) payload.note = cardNote; }
        else payload.note = cardNote;
        if (cardAction === "freeze") { payload.frozen_from = frozenFrom; payload.frozen_until = frozenUntil; }
        if (cardAction === "adjust") payload.remaining_sessions = remaining;
        await apiFetch(`/api/admin/cards/${cardTarget.id}`, { method: "PATCH", json: payload });
      }
      setMessage(local("会员卡权益已更新", "Card benefits updated")); setCardTarget(null); await onChanged();
    } catch (err) {
      showError(err, local("卡操作失败", "Card action failed"));
      // 版本冲突说明卡权益已在别处被改动，关掉编辑框并刷新数据，避免反复提交旧版本。
      if ((err as { status?: number })?.status === 409) { setCardTarget(null); await onChanged(); }
    }
    finally { setBusy(false); }
  }
  async function unshare(card: MemberCard, memberId: number) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/cards/${card.id}/shares/${memberId}`, { method: "DELETE" }); setMessage(local("已移除共享", "Sharing removed")); await onChanged(); }
    catch (err) { showError(err, local("移除共享失败", "Failed to remove sharing")); }
    finally { setBusy(false); }
  }
  function openRecordEditor(record?: MemberDetail["records"][number]) {
    setEditingRecordId(record?.id ?? null);
    setRecordType(record?.record_type === "assessment" ? "note" : record?.record_type ?? "pt_diary");
    setRecordTitle(record?.title ?? ""); setRecordContent(record?.content ?? ""); setRecordOpen(true); setError("");
  }
  async function addRecord(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(editingRecordId ? `/api/admin/records/${editingRecordId}` : `/api/admin/members/${detail.id}/records`, { method: editingRecordId ? "PATCH" : "POST", json: { record_type: recordType, title: recordTitle, content: recordContent, record_date: today() } }); setRecordTitle(""); setRecordContent(""); setRecordOpen(false); setEditingRecordId(null); setTab("records"); setMessage(local("私教 / 跟进记录已保存", "Record saved")); await onChanged(); }
    catch (err) { showError(err, local("保存失败", "Save failed")); }
    finally { setBusy(false); }
  }
  async function addReminder(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/reminders`, { method: "POST", json: { content: reminderContent, remind_on: remindOn } }); setReminderContent(""); setReminderOpen(false); setMessage(local("提醒已保存，将在到店签到和打开档案时显示", "Reminder saved for check-in and profile visits")); await onChanged(); }
    catch (err) { showError(err, local("提醒保存失败", "Failed to save reminder")); }
    finally { setBusy(false); }
  }
  async function dismissReminder(id: number) {
    try { await apiFetch(`/api/admin/reminders/${id}`, { method: "PATCH", json: { active: false } }); await onChanged(); }
    catch (err) { showError(err, local("操作失败", "Action failed")); }
  }
  async function addVoucher(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/vouchers`, { method: "POST", json: { course_type: voucherType, quantity: voucherQuantity, expires_on: voucherExpiry, note: voucherNote } }); setVoucherNote(""); setVoucherOpen(false); setMessage(local("体验券已发放，可在签到时直接核销", "Voucher issued and ready for check-in")); await onChanged(); }
    catch (err) { showError(err, local("发券失败", "Failed to issue voucher")); }
    finally { setBusy(false); }
  }
  async function revokeVoucher(id: number) {
    try { await apiFetch(`/api/admin/vouchers/${id}`, { method: "PATCH", json: { status: "cancelled" } }); setMessage(local("体验券已停用", "Voucher cancelled")); await onChanged(); }
    catch (err) { showError(err, local("操作失败", "Action failed")); }
  }
  async function uploadDocument(file: File | null, category: "contract" | "assessment") {
    if (!file) return;
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file); body.append("category", category);
    try { await apiFetch(`/api/admin/members/${detail.id}/documents`, { method: "POST", body }); setMessage(category === "assessment" ? local("评估表已上传", "Assessment uploaded") : local("合同资料已上传", "Contract uploaded")); await onChanged(); }
    catch (err) { showError(err, local("上传失败", "Upload failed")); }
    finally { setBusy(false); }
  }
  async function uploadPhoto(file: File | null) {
    if (!file) return;
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file);
    try { await apiFetch(`/api/admin/members/${detail.id}/photo`, { method: "POST", body }); setMessage(local("会员照片已更新", "Member photo updated")); await onChanged(); }
    catch (err) { showError(err, local("照片上传失败，请稍后重试", "Photo upload failed. Please try again later.")); }
    finally { setBusy(false); }
  }
  async function removePhoto() {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/photo`, { method: "DELETE" }); setMessage(local("会员照片已删除", "Member photo removed")); await onChanged(); }
    catch (err) { showError(err, local("照片删除失败，请稍后重试", "Failed to remove the photo. Please try again later.")); }
    finally { setBusy(false); }
  }
  function bookingTable(rows: MemberDetail["bookings"]) {
    return <><ResponsiveTable><table className="data-table"><thead><tr><th>{local("开课时间", "Class time")}</th><th>{local("课程", "Class")}</th><th>{local("教练", "Instructor")}</th><th>{local("预约用卡", "Card used")}</th><th>{local("状态", "Status")}</th><th>{local("预约时间", "Booked at")}</th></tr></thead><tbody>{rows.map((booking) => <tr key={booking.id}><td>{booking.session?.session_date} {booking.session?.start_time}</td><td>{local(booking.session?.course.name ?? "", booking.session?.course.name_en)}</td><td>{local(booking.session?.teacher.name ?? "", booking.session?.teacher.name_en)}</td><td>{booking.card_name || "—"}</td><td>{bookingStatus[booking.status]}</td><td>{formatDateTime(booking.booked_at)}</td></tr>)}</tbody></table></ResponsiveTable>{!rows.length && <Empty>{local("暂无上课记录", "No class history")}</Empty>}</>;
  }

  return <>
    <Modal drawer className="member-drawer" title={local("会员档案", "Member profile")} onClose={onClose}>
      <div className="member-profile-layout">
        <aside className="member-switcher" aria-label={local("切换会员", "Switch member")}><input className="member-switcher-search" value={switchQuery} onChange={(event) => setSwitchQuery(event.target.value)} placeholder={local("按姓名或手机号查找会员", "Find a member by name or mobile")}/><label><span>{local("会员清单", "Members")}</span><select value={detail.id} onChange={(event) => onSelect(Number(event.target.value))}>{switchList.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><div>{switchList.map((member) => <button type="button" className={member.id === detail.id ? "active" : ""} key={member.id} onClick={() => onSelect(member.id)}>{member.photo_url ? <img className="member-photo" src={member.photo_url} alt={member.name}/> : <span className="user-avatar">{member.name.slice(0, 1)}</span>}<strong>{member.name}</strong></button>)}</div></aside>
        <div className="member-profile">
          {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
          <div className="profile-actions">{canMemberWrite && <button type="button" onClick={onEdit}><Icon name="settings"/><span>{local("编辑资料", "Edit")}</span></button>}{canMemberWrite && <label className="profile-upload"><Icon name="user" size={16}/><span>{local("上传照片", "Upload photo")}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; if (file) setCropFile(file); }}/></label>}{canMemberWrite && detail.photo_url && <button type="button" onClick={() => void removePhoto()}><Icon name="close"/><span>{local("删除照片", "Remove photo")}</span></button>}{canRevenue && <button type="button" onClick={() => openPurchase()}><Icon name="card"/><span>{local("购卡 / 购课", "Buy card")}</span></button>}{canMemberWrite && <button type="button" onClick={() => setReminderOpen(true)}><Icon name="bell"/><span>{local("提醒", "Reminder")}</span></button>}{canCards && <button type="button" onClick={() => setVoucherOpen(true)}><Icon name="plus"/><span>{local("赠体验券", "Offer voucher")}</span></button>}{canMemberWrite && <RecycleDeleteButton resource="members" id={detail.id} label={detail.name} onDeleted={onClose}/>}</div>
          {!!detail.reminder_alerts?.length && <section className="member-reminders"><header><Icon name="bell" size={18}/><strong>{local("会员提醒", "Member reminders")}</strong></header>{detail.reminder_alerts.map((alert) => <p key={alert}>{alert}</p>)}{detail.reminders?.filter((reminder) => detail.reminder_alerts?.includes(reminder.content)).map((reminder) => <div className="table-actions" key={reminder.id}><button className="text-button" type="button" disabled={!canMemberWrite} onClick={() => void dismissReminder(reminder.id)}>{local("完成提醒", "Dismiss")}：{reminder.content}</button>{canMemberWrite && <RecycleDeleteButton resource="reminders" id={reminder.id} label={reminder.content} onDeleted={onChanged}/>}</div>)}</section>}
          <section className="profile-summary"><div className="profile-head">{detail.photo_url ? <img className="profile-avatar profile-avatar-photo" src={detail.photo_url} alt={detail.name}/> : <span className="profile-avatar">{detail.name.slice(0, 1)}</span>}<h2>{detail.name}<small>{detail.name_en}</small></h2></div><div className="profile-facts"><span><small>{local("手机号", "Mobile")}</small><strong>{detail.phone || "—"}</strong></span><span><small>{local("性别", "Gender")}</small><strong>{detail.gender ? genderLabel(detail.gender, local) : "—"}</strong></span><span><small>{local("出生日期", "Birth date")}</small><strong>{detail.birth_date || "—"}</strong></span><span><small>{local("获客来源", "Source")}</small><strong>{detail.source || "—"}</strong></span><span><small>{local("会籍归属", "Advisor")}</small><strong>{detail.advisor_name || "—"}</strong></span><span><small>{local("微信号", "WeChat")}</small><strong>{detail.wechat || "—"}</strong></span><span><small>{local("紧急联系", "Emergency")}</small><strong>{detail.emergency_phone || "—"}</strong></span></div>{detail.notes && <p className="profile-note"><Icon name="book" size={15}/><span>{detail.notes}</span></p>}</section>
          <section className="profile-cards"><header><h3>{local("会员卡", "Membership cards")} <Badge>{(detail.cards?.length ?? 0) + (detail.shared_cards?.length ?? 0)}</Badge></h3><span>{local("升卡、转卡、共享与停卡集中管理", "Upgrade, transfer, share and freeze")}</span></header>{[...(detail.cards ?? []), ...(detail.shared_cards ?? [])].map((card) => <article key={`${card.member_id}-${card.id}`}><div><strong>{local(card.product_name, card.product_name_en)}{card.member_id !== detail.id && <Badge tone="blue">{local("共享卡", "Shared")}</Badge>}{card.is_renewal && <Badge tone="amber">{local("续卡", "Renewal")}</Badge>}{card.start_pending && <Badge tone="amber">{local("开卡日期待定", "Start pending")}</Badge>}</strong><small>{card.card_no} · {card.purchased_at} {local("购卡", "purchased")}</small>{!!card.shared_with?.length && <small>{local("共享给", "Shared with")} {card.shared_with.map((share) => <span className="shared-member" key={share.id}>{share.name}{canCards && <button type="button" aria-label={local(`取消共享给${share.name}`, `Remove sharing with ${share.name}`)} disabled={busy} onClick={() => askConfirm(local("取消共享？", "Remove sharing?"), local(`将收回 ${share.name} 使用本卡剩余权益的权限。`, `${share.name} will lose access to the remaining benefits on this card.`), local("确认取消共享", "Remove sharing"), async () => { await unshare(card, share.id); })}>×</button>}</span>)}</small>}</div><div><span>{card.total_sessions ? local(`${card.total_sessions} 次，剩余 ${card.remaining_sessions ?? 0} 次`, `${card.total_sessions} sessions, ${card.remaining_sessions ?? 0} remaining`) : local("周期不限次", "Unlimited")}</span>{card.benefits.length > 0 && <small>{card.benefits.map((benefit) => `${courseTypeLabel(benefit.course_type, local)} ${benefit.remaining ?? 0}`).join(" · ")}</small>}</div><div className="profile-card-validity"><span>{card.start_pending ? local("开卡日期待定（首次签到自动开卡）", "Starts on the first check-in") : `${card.starts_on} ~ ${card.expires_on}`}</span>{(card.frozen_until || card.note) && <small>{card.frozen_until ? local(`冻结 ${card.frozen_from ? `${card.frozen_from} ~ ` : ""}${card.frozen_until}`, `Frozen ${card.frozen_from ? `${card.frozen_from} ~ ` : ""}${card.frozen_until}`) : card.note}</small>}</div><Badge tone={card.status === "active" ? "green" : "neutral"}>{card.status === "active" ? local("正常", "Active") : card.status === "expired" ? local("已过期", "Expired") : card.status === "upgraded" ? local("已升卡", "Upgraded") : local("已销卡", "Cancelled")}</Badge>{canCards && card.member_id === detail.id && <div className="table-actions"><button className="button button-small button-outline" type="button" onClick={() => editCard(card)}>{local("卡操作", "Manage")}</button><RecycleDeleteButton resource="cards" id={card.id} label={`${card.card_no} · ${card.product_name}`} onDeleted={onChanged}/></div>}</article>)}{!(detail.cards?.length || detail.shared_cards?.length) && <Empty>{local("尚未购卡", "No cards")}</Empty>}</section>
          {!!detail.vouchers?.length && <section className="voucher-list"><header><h3>{local("体验券", "Experience vouchers")}</h3><span>{local("签到时自动优先匹配有效卡，无卡时核销体验券", "Cards are matched first; vouchers are used when no card is available")}</span></header>{detail.vouchers.map((voucher) => <article key={voucher.id}><Badge tone={voucher.status === "active" ? "green" : "neutral"}>{categoryLabel(voucher.course_type)}</Badge><strong>{local(`剩余 ${voucher.remaining_sessions} / ${voucher.total_sessions} 次`, `${voucher.remaining_sessions} / ${voucher.total_sessions} remaining`)}</strong><span>{local("有效期至", "Until")} {voucher.expires_on}</span><small>{voucher.note}</small>{canCards && <div className="table-actions">{voucher.status === "active" && <button className="text-button danger" type="button" onClick={() => askConfirm(local("停用这张体验券？", "Cancel this voucher?"), local("停用后体验券立即失效且无法恢复，如需继续赠送需重新发放。", "The voucher becomes unusable immediately and cannot be restored; issue a new one if the member still needs it."), local("确认停用", "Cancel voucher"), async () => { await revokeVoucher(voucher.id); })}>{local("停用", "Cancel")}</button>}<RecycleDeleteButton resource="vouchers" id={voucher.id} label={`${categoryLabel(voucher.course_type)}体验券 #${voucher.id}`} onDeleted={onChanged}/></div>}</article>)}</section>}
          <div className="me-tabs profile-record-tabs"><button className={tab === "bookings" ? "active" : ""} type="button" onClick={() => setTab("bookings")}>{local("团课预约记录", "Group bookings")}</button><button className={tab === "private_bookings" ? "active" : ""} type="button" onClick={() => setTab("private_bookings")}>{local("私教预约记录", "PT bookings")}</button><button className={tab === "records" ? "active" : ""} type="button" onClick={() => setTab("records")}>{local("私教 / 跟进记录", "PT & notes")}</button><button className={tab === "transactions" ? "active" : ""} type="button" onClick={() => setTab("transactions")}>{local("消费记录", "Transactions")}</button><button className={tab === "assessments" ? "active" : ""} type="button" onClick={() => setTab("assessments")}>{local("体测 / Assessment", "Assessment")}</button><button className={tab === "contracts" ? "active" : ""} type="button" onClick={() => setTab("contracts")}>{local("合同与资料", "Contracts")}</button></div>
          {tab === "bookings" && bookingTable(detail.bookings.filter((booking) => booking.session?.course.course_type === "group"))}
          {tab === "private_bookings" && bookingTable(detail.bookings.filter((booking) => ["private", "assessment", "workshop"].includes(booking.session?.course.course_type ?? "")))}
          {tab === "records" && <><div className="section-action-header"><h3>{local("私教训练与跟进", "PT & follow-up")}</h3>{canRecords && <button className="button button-small button-outline" type="button" onClick={() => openRecordEditor()}><Icon name="plus" size={15}/>{local("新增记录", "Add record")}</button>}</div><div className="record-list">{detail.records.filter((record) => record.record_type !== "assessment").map((record) => <article key={record.id}><span>{record.record_date} · {record.record_type === "pt_diary" ? "PT diary" : "Note"}</span><h3>{record.title}</h3><p>{record.content}</p><small>{record.teacher_name}</small>{canRecords && <div className="table-actions"><button className="text-button" type="button" onClick={() => openRecordEditor(record)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource="records" id={record.id} label={record.title} onDeleted={onChanged}/></div>}</article>)}{!detail.records.filter((record) => record.record_type !== "assessment").length && <Empty>{local("暂无私教或跟进记录", "No PT or follow-up records")}</Empty>}</div></>}
          {tab === "transactions" && <ResponsiveTable><table className="data-table"><thead><tr><th>{local("日期", "Date")}</th><th>{local("类别", "Category")}</th><th>{local("摘要", "Description")}</th><th>{local("支付方式", "Payment")}</th><th>{local("金额", "Amount")}</th></tr></thead><tbody>{detail.transactions.map((row) => <tr key={row.id}><td>{row.occurred_at}</td><td>{financeCategoryLabel(row.category, local)}</td><td>{transactionNote(row, language)}</td><td>{paymentLabel(row.payment_method, local)}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></ResponsiveTable>}
          {tab === "assessments" && <MemberDocuments detail={detail} category="assessment" busy={busy} canWrite={canMemberWrite} onChanged={onChanged} onUpload={(file, category) => void uploadDocument(file, category)}/>}
          {tab === "contracts" && <MemberDocuments detail={detail} category="contract" busy={busy} canWrite={canMemberWrite} onChanged={onChanged} onUpload={(file, category) => void uploadDocument(file, category)}/>}
        </div>
      </div>
    </Modal>

    {cropFile && <PhotoCropper file={cropFile} onConfirm={(file) => { setCropFile(null); void uploadPhoto(file); }} onCancel={() => setCropFile(null)}/>}
    {purchaseOpen && <Modal wide title={renewal ? local(`为 ${detail.name} 续卡`, `Renew a card for ${detail.name_en || detail.name}`) : local(`为 ${detail.name} 购卡`, `Buy a card for ${detail.name_en || detail.name}`)} onClose={() => setPurchaseOpen(false)}><form className="form-grid two-columns" onSubmit={purchase}>{error && <div className="span-two"><Notice error message={error}/></div>}{renewal && <div className="span-two"><Notice message={local("续卡即重新购卡：会新开一张卡并按所选方式入账，原卡剩余权益不作废。", "Renewal means buying a new card: a fresh card is issued and recorded, while the remaining benefits of the old card stay valid.")}/></div>}<div className="span-two"><Field label={local("卡课产品", "Product")}><select value={productId} onChange={(event) => selectProduct(meta?.products.find((item) => item.id === Number(event.target.value)))}>{meta?.products.filter((item) => item.active).map((product) => <option key={product.id} value={product.id}>{local(product.name, product.name_en)} · {money(product.price)}</option>)}</select></Field></div><div className="form-grid two-columns"><Field label={local("实收价格", "Actual price")}><input required min={0} step="0.01" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))}/></Field><Field label={local("开卡方式", "Start option")}><select value={startPending ? "pending" : "date"} onChange={(event) => setStartPending(event.target.value === "pending")}><option value="date">{local("指定开卡日期", "Set a start date")}</option><option value="pending">{local("开卡日期待定", "Start date pending")}</option></select></Field></div>{startPending ? <div className="span-two"><Notice message={local("开卡日期待定：卡开出来即可正常预约，会员首次签到当天自动开卡，有效期从签到当天起算。", "With a pending start date the card can be booked right away; it opens automatically on the member's first check-in and the validity period starts that day.")}/></div> : <div className="span-two"><Field label={local("开卡日期", "Start date")}><input required type="date" value={startsOn} onChange={(event) => { setStartsOn(event.target.value); setRevenueStartOn(event.target.value); }}/></Field></div>}<div className="span-two"><Field label={local("结账方式", "Payment")}><select value={payment} onChange={(event) => setPayment(event.target.value)}>{paymentMethods.map((value) => <option key={value} value={value}>{paymentLabel(value, local)}</option>)}</select></Field></div><EntryOptionsFields recordCash={recordCash} revenueMode={revenueMode} revenueStartOn={revenueStartOn} revenueDays={revenueDays} onRecordCashChange={setRecordCash} onRevenueModeChange={setRevenueMode} onRevenueStartOnChange={setRevenueStartOn} onRevenueDaysChange={setRevenueDays} privatePurchase={privatePurchase}/><p className="form-help span-two">{local(`系统默认口径：${revenueModeLabel(revenuePolicy?.effective ?? revenueMode)}，在「系统设置 → 财务口径」中修改；这里可以按本单情况临时调整。私教/评估卡只能在实际消课后确认营收。`, `System default: ${revenueModeLabel(revenuePolicy?.effective ?? revenueMode)}. Change it under System settings → Finance, or adjust it for this purchase here. PT / assessment cards recognize revenue only after consumption.`)}</p><div className="span-two"><Field label={local("备注（选填）", "Notes (optional)")}><textarea rows={3} value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder={local("折扣、合同或收款说明", "Discount, contract or payment notes")}/></Field></div><button className="button button-primary button-full span-two" disabled={busy || !productId || (!recordCash && revenueMode === "none")} type="submit">{local("确认购卡并入账", "Confirm purchase")}</button></form></Modal>}
    {cardTarget && <Modal title={`${local(cardTarget.product_name, cardTarget.product_name_en)} · ${local("卡操作", "Manage card")}`} onClose={() => setCardTarget(null)}><form className="form-grid" onSubmit={saveCard}><Field label={local("操作类型", "Action")}><select value={cardAction} onChange={(event) => { const value = event.target.value; if (value === "renew") { setCardTarget(null); openPurchase(true); return; } setCardAction(value); }}><option value="edit">{local("编辑卡（开卡日期 / 到期日 / 备注）", "Edit card (start date / expiry / notes)")}</option><option value="renew">{local("续卡（重新购卡）", "Renew (buy a new card)")}</option><option value="freeze">{local("请假 / 停卡", "Freeze")}</option><option value="unfreeze">{local("解除停卡 / 重新启用", "Unfreeze / reactivate")}</option><option value="adjust">{local("手动调整剩余次数", "Adjust remaining")}</option><option value="upgrade">{local("升卡（补差价）", "Upgrade")}</option><option value="transfer">{local("转卡给其他会员", "Transfer")}</option><option value="share">{local("共享给家人", "Share")}</option><option value="cancel">{local("销卡", "Cancel card")}</option></select></Field>{cardAction === "edit" && <><label className="checkbox-label span-two"><input type="checkbox" checked={cardStartPending} onChange={(event) => setCardStartPending(event.target.checked)}/>{local("保持开卡日期待定（会员首次签到时自动开卡）", "Keep the start date pending (opens on the first check-in)")}</label>{!cardStartPending && <><Field label={local("开卡日期", "Start date")}><input required type="date" value={cardStart} onChange={(event) => setCardStart(event.target.value)}/></Field><Field label={local("到期日期", "Expiry date")} hint={local("需要顺延到期日，直接改这个日期即可", "To extend the card, just change this date")}><input required type="date" value={cardExpiry} onChange={(event) => setCardExpiry(event.target.value)}/></Field></>}</>}{cardAction === "freeze" && <><Field label={local("冻结开始日期", "Freeze from")}><input type="date" value={frozenFrom} onChange={(event) => setFrozenFrom(event.target.value)}/></Field><Field label={local("冻结截止日期", "Frozen until")}><input required type="date" value={frozenUntil} onChange={(event) => setFrozenUntil(event.target.value)}/></Field><p className="form-help">{local("冻结区间内不消耗权益，有效期不顺延；需要顺延请改用“编辑卡”调整到期日。", "No benefits are consumed inside the freeze window, and the expiry date is not shifted. Use “Edit card” to change the expiry date.")}</p></>}{cardAction === "adjust" && <Field label={local("剩余次数", "Remaining")}><input min={0} type="number" value={remaining} onChange={(event) => setRemaining(Number(event.target.value))}/></Field>}{cardAction === "upgrade" && <><Field label={local("升级至产品", "Upgrade to")}><select required value={upgradeProductId} onChange={(event) => { setUpgradeProductId(event.target.value); const product = meta?.products.find((item) => item.id === Number(event.target.value)); setUpgradePrice(Math.max(0, (product?.price ?? 0) - cardTarget.purchase_price)); if (product) { setRevenueDays(product.validity_days || 30); void loadRevenuePolicy(product.id); } }}>{Object.entries(upgradeGroups).map(([group, items]) => <optgroup key={group} label={categoryLabel(group)}>{items.map((product) => <option value={product.id} key={product.id}>{local(product.name, product.name_en)} · {money(product.price)}</option>)}</optgroup>)}</select></Field><div className="form-grid two-columns"><Field label={local("补差金额", "Difference")}><input required min={0} step="0.01" type="number" value={upgradePrice} onChange={(event) => setUpgradePrice(Number(event.target.value))}/></Field><Field label={local("结账方式", "Payment")}><select value={payment} onChange={(event) => setPayment(event.target.value)}>{paymentMethods.map((value) => <option key={value} value={value}>{paymentLabel(value, local)}</option>)}</select></Field></div><EntryOptionsFields recordCash={recordCash} revenueMode={revenueMode} revenueStartOn={revenueStartOn} revenueDays={revenueDays} onRecordCashChange={setRecordCash} onRevenueModeChange={setRevenueMode} onRevenueStartOnChange={setRevenueStartOn} onRevenueDaysChange={setRevenueDays} privatePurchase={upgradePrivatePurchase}/><p className="form-help span-two">{local(`升卡补差的入账方式与购卡一致，系统默认：${revenueModeLabel(revenuePolicy?.effective ?? revenueMode)}。`, `The upgrade difference is recorded like a purchase. System default: ${revenueModeLabel(revenuePolicy?.effective ?? revenueMode)}.`)}</p></>}{["transfer", "share"].includes(cardAction) && <Field label={local(cardAction === "transfer" ? "接收会员" : "共享会员", "Target member")} hint={local(cardAction === "transfer" ? "整卡及剩余权益转给对方；未消课预约需先处理" : "对方可在签到时共用此卡剩余权益", cardAction === "transfer" ? "Transfer the card and remaining benefits" : "The member can consume this card at check-in")}><MemberPicker members={members} value={targetMemberId} onChange={setTargetMemberId} required excludeId={detail.id}/></Field>}{cardAction === "cancel" && <div className="span-two"><Notice error message={local("销卡会立即作废本卡全部剩余权益，操作不可撤销。", "Cancelling this card forfeits all remaining benefits immediately and cannot be undone.")}/><label className="checkbox-label"><input type="checkbox" checked={cardCancelConfirmed} onChange={(event) => setCardCancelConfirmed(event.target.checked)}/>{local("我确认销卡", "I confirm cancelling this card")}</label></div>}{cardAction === "transfer" && <div className="span-two"><Notice error message={local("转卡后整卡及剩余权益将转移给对方会员，无法撤销。", "After the transfer the card and its remaining benefits belong to the other member and cannot be undone.")}/></div>}<Field label={cardAction === "edit" ? local("备注（选填，填写后覆盖卡片备注）", "Notes (optional; replaces the card note)") : local("操作原因 / 备注（必填）", "Reason / notes (required)")}><textarea rows={3} required={cardAction !== "edit"} value={cardNote} onChange={(event) => setCardNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy || (["transfer", "share"].includes(cardAction) && !targetMemberId) || (cardAction === "upgrade" && (!upgradeProductId || (!recordCash && revenueMode === "none"))) || (cardAction === "cancel" && !cardCancelConfirmed)} type="submit">{local("确认卡操作", "Confirm")}</button></form></Modal>}
    {recordOpen && <Modal title={local(editingRecordId ? "编辑私教 / 跟进记录" : "新增私教 / 跟进记录", editingRecordId ? "Edit PT / follow-up record" : "Add PT / follow-up record")} onClose={() => setRecordOpen(false)}><form className="form-grid" onSubmit={addRecord}><Field label={local("记录类型", "Record type")}><select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option value="pt_diary">{local("私教训练内容 / PT diary", "PT diary")}</option><option value="note">{local("跟进备注", "Follow-up note")}</option></select></Field><p className="form-help">{local("完整体测表请切换到“体测 / Assessment”标签页上传和查看。", "Open the Assessment tab to upload and view assessment forms.")}</p><Field label={local("标题", "Title")}><input required value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)}/></Field><Field label={local("详细记录", "Details")}><textarea required rows={6} value={recordContent} onChange={(event) => setRecordContent(event.target.value)} placeholder={local("训练内容、身体反馈、下次练习建议…", "Training, feedback and recommendations…")}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("保存记录", "Save record")}</button></form></Modal>}
    {reminderOpen && <Modal title={local("新增会员提醒", "Add member reminder")} onClose={() => setReminderOpen(false)}><form className="form-grid" onSubmit={addReminder}><p className="form-help">{local("到期提醒会在进入会员档案和到店签到时弹出；生日前 7 天会自动提示。", "Due reminders appear on profile visits and check-in. Birthdays are highlighted seven days ahead.")}</p><Field label={local("提醒内容", "Reminder")}><textarea required data-autofocus rows={4} value={reminderContent} onChange={(event) => setReminderContent(event.target.value)} placeholder={local("例如：会员生日准备了小礼物，签到时交给会员", "e.g. Prepare a birthday gift for the member")}/></Field><Field label={local("提醒日期", "Remind on")}><input required type="date" value={remindOn} onChange={(event) => setRemindOn(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("保存提醒", "Save reminder")}</button></form></Modal>}
    {voucherOpen && <Modal title={local("赠送体验券", "Offer experience voucher")} onClose={() => setVoucherOpen(false)}><form className="form-grid" onSubmit={addVoucher}><Field label={local("适用课程", "Class type")}><select value={voucherType} onChange={(event) => setVoucherType(event.target.value)}>{["group", "private", "assessment", "workshop", "all"].map((value) => <option value={value} key={value}>{categoryLabel(value)}</option>)}</select></Field><div className="form-grid two-columns"><Field label={local("体验次数", "Sessions")}><input min={1} max={100} type="number" value={voucherQuantity} onChange={(event) => setVoucherQuantity(Number(event.target.value))}/></Field><Field label={local("有效期至", "Valid until")}><input required type="date" min={today()} value={voucherExpiry} onChange={(event) => setVoucherExpiry(event.target.value)}/></Field></div><Field label={local("销售备注", "Offer notes")}><textarea rows={3} value={voucherNote} onChange={(event) => setVoucherNote(event.target.value)} placeholder={local("体验来源、销售跟进说明…", "Offer source and sales notes…")}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("确认赠券", "Issue voucher")}</button></form></Modal>}
    {confirmState && <Modal title={confirmState.title} onClose={() => setConfirmState(null)}><p className="form-help">{confirmState.description}</p><div className="table-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => { const action = confirmState; setConfirmState(null); void action.onConfirm(); }}>{confirmState.confirmLabel}</button><button className="button button-outline" type="button" onClick={() => setConfirmState(null)}>{local("取消", "Cancel")}</button></div></Modal>}
  </>;
}
