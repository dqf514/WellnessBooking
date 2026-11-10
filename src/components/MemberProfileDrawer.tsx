import { useState, type FormEvent } from "react";
import { Field, Notice } from "@/components/AdminUI";
import { MemberDocuments } from "@/components/MemberDocuments";
import { MemberPicker } from "@/components/MemberPicker";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Empty, Icon, Modal, ResponsiveTable } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, formatDateTime, money, today } from "@/lib/date";
import { transactionNote } from "@/lib/transactionCopy";
import type { Member, MemberCard, MemberDetail, Meta } from "@/types";

const paymentMethods: Array<[string, string, string]> = [["cash", "现金", "Cash"], ["pos", "POS 通", "POS"], ["company_qr", "公司二维码", "Company QR code"], ["alipay", "支付宝", "Alipay"], ["wechat", "微信", "WeChat Pay"], ["ar", "AR account", "AR account"], ["ent", "ENT", "ENT"], ["youzan", "有赞", "Youzan"], ["dianping", "大众点评", "Dianping"], ["voucher", "券", "Voucher"], ["stored_card", "储值卡", "Stored-value card"]];

export function MemberProfileDrawer({ detail, members, meta, canWrite, onClose, onSelect, onEdit, onChanged }: { detail: MemberDetail; members: Member[]; meta: Meta | null; canWrite: boolean; onClose: () => void; onSelect: (id: number) => void; onEdit: () => void; onChanged: () => Promise<void> }) {
  const { local, language } = useLanguage();
  const [tab, setTab] = useState<"bookings" | "private_bookings" | "records" | "transactions">("bookings");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState(0);
  const [payment, setPayment] = useState("wechat");
  const [startsOn, setStartsOn] = useState(today());
  const [cardTarget, setCardTarget] = useState<MemberCard | null>(null);
  const [cardAction, setCardAction] = useState("extend");
  const [cardDays, setCardDays] = useState(30);
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
  const [voucherType, setVoucherType] = useState("group");
  const [voucherQuantity, setVoucherQuantity] = useState(1);
  const [voucherExpiry, setVoucherExpiry] = useState(addDays(today(), 30));
  const [voucherNote, setVoucherNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const bookingStatus: Record<string, string> = { booked: local("待上课", "Upcoming"), checked_in: local("已消课", "Completed"), completed: local("已消课", "Completed"), cancelled: local("已取消", "Cancelled"), no_show: local("爽约", "No show") };
  const categoryLabel = (value: string) => local(value === "group" ? "团课" : value === "private" ? "私教" : value === "workshop" ? "工作坊" : value === "assessment" ? "评估" : value === "training" ? "培训" : "全部课程", value);

  function showError(err: unknown, fallback: string) { setError(err instanceof Error ? err.message : fallback); }
  function openPurchase() {
    if (!meta) return;
    const product = meta.products.find((item) => item.active);
    setProductId(String(product?.id ?? "")); setPrice(product?.price ?? 0); setPurchaseOpen(true);
  }
  async function purchase(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(`/api/admin/members/${detail.id}/cards`, { method: "POST", json: { product_id: Number(productId), price, payment_method: payment, starts_on: startsOn } }); setMessage(local("购卡与入账已完成", "Card purchased and payment posted")); setPurchaseOpen(false); await onChanged(); }
    catch (err) { showError(err, local("购卡失败", "Purchase failed")); }
    finally { setBusy(false); }
  }
  function editCard(card: MemberCard) {
    setCardTarget(card); setCardAction("extend"); setCardDays(30); setFrozenUntil(card.frozen_until); setCardNote(""); setRemaining(card.remaining_sessions ?? 0); setTargetMemberId("");
    const product = meta?.products.find((item) => item.active && item.id !== card.product_id && (item.category === card.category || item.category === "annual"));
    setUpgradeProductId(String(product?.id ?? "")); setUpgradePrice(Math.max(0, (product?.price ?? 0) - card.purchase_price));
  }
  async function saveCard(event: FormEvent) {
    event.preventDefault(); if (!cardTarget) return; setBusy(true); setError("");
    try {
      if (["upgrade", "transfer", "share"].includes(cardAction)) {
        const path = cardAction === "upgrade" ? "upgrade" : cardAction === "transfer" ? "transfer" : "share";
        const json = cardAction === "upgrade" ? { product_id: Number(upgradeProductId), price: upgradePrice, payment_method: payment, note: cardNote } : { target_member_id: Number(targetMemberId), note: cardNote };
        await apiFetch(`/api/admin/cards/${cardTarget.id}/${path}`, { method: "POST", json });
      } else {
        const payload: Record<string, unknown> = { action: cardAction, note: cardNote };
        if (cardAction === "extend") payload.days = cardDays;
        if (cardAction === "freeze") payload.frozen_until = frozenUntil;
        if (cardAction === "adjust") payload.remaining_sessions = remaining;
        await apiFetch(`/api/admin/cards/${cardTarget.id}`, { method: "PATCH", json: payload });
      }
      setMessage(local("会员卡权益已更新", "Card benefits updated")); setCardTarget(null); await onChanged();
    } catch (err) { showError(err, local("卡操作失败", "Card action failed")); }
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
  function bookingTable(rows: MemberDetail["bookings"]) {
    return <><ResponsiveTable><table className="data-table"><thead><tr><th>{local("开课时间", "Class time")}</th><th>{local("课程", "Class")}</th><th>{local("教练", "Instructor")}</th><th>{local("预约用卡", "Card used")}</th><th>{local("状态", "Status")}</th><th>{local("预约时间", "Booked at")}</th></tr></thead><tbody>{rows.map((booking) => <tr key={booking.id}><td>{booking.session?.session_date} {booking.session?.start_time}</td><td>{local(booking.session?.course.name ?? "", booking.session?.course.name_en)}</td><td>{local(booking.session?.teacher.name ?? "", booking.session?.teacher.name_en)}</td><td>{booking.card_name || "—"}</td><td>{bookingStatus[booking.status]}</td><td>{formatDateTime(booking.booked_at)}</td></tr>)}</tbody></table></ResponsiveTable>{!rows.length && <Empty>{local("暂无上课记录", "No class history")}</Empty>}</>;
  }

  return <>
    <Modal drawer className="member-drawer" title={local("会员档案", "Member profile")} onClose={onClose}>
      <div className="member-profile-layout">
        <aside className="member-switcher" aria-label={local("切换会员", "Switch member")}><label><span>{local("会员清单", "Members")}</span><select value={detail.id} onChange={(event) => onSelect(Number(event.target.value))}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><div>{members.map((member) => <button type="button" className={member.id === detail.id ? "active" : ""} key={member.id} onClick={() => onSelect(member.id)}><span className="user-avatar">{member.name.slice(0, 1)}</span><strong>{member.name}</strong></button>)}</div></aside>
        <div className="member-profile">
          {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
          <div className="profile-actions">{canWrite && <><button type="button" onClick={onEdit}><Icon name="settings"/><span>{local("编辑资料", "Edit")}</span></button><button type="button" onClick={openPurchase}><Icon name="card"/><span>{local("购卡 / 购课", "Buy card")}</span></button><button type="button" onClick={() => setReminderOpen(true)}><Icon name="bell"/><span>{local("提醒", "Reminder")}</span></button><button type="button" onClick={() => setVoucherOpen(true)}><Icon name="plus"/><span>{local("赠体验券", "Offer voucher")}</span></button><RecycleDeleteButton resource="members" id={detail.id} label={detail.name} onDeleted={onClose}/></>}</div>
          {!!detail.reminder_alerts?.length && <section className="member-reminders"><header><Icon name="bell" size={18}/><strong>{local("会员提醒", "Member reminders")}</strong></header>{detail.reminder_alerts.map((alert) => <p key={alert}>{alert}</p>)}{detail.reminders?.filter((reminder) => detail.reminder_alerts?.includes(reminder.content)).map((reminder) => <div className="table-actions" key={reminder.id}><button className="text-button" type="button" onClick={() => void dismissReminder(reminder.id)}>{local("完成提醒", "Dismiss")}：{reminder.content}</button>{canWrite && <RecycleDeleteButton resource="reminders" id={reminder.id} label={reminder.content} onDeleted={onChanged}/>}</div>)}</section>}
          <section className="profile-summary"><span className="profile-avatar">{detail.name.slice(0, 1)}</span><div><h2>{detail.name} <small>{detail.name_en}</small></h2><p>{detail.phone} · {detail.gender ? local(detail.gender, detail.gender === "女" ? "Female" : "Male") : local("性别未填", "No gender")} · {detail.birth_date || local("生日未填", "No birth date")}</p><div className="profile-meta"><span>{local("获客来源", "Source")}<strong>{detail.source || "—"}</strong></span><span>{local("会籍归属", "Advisor")}<strong>{detail.advisor_name || "—"}</strong></span><span>{local("微信号", "WeChat")}<strong>{detail.wechat || "—"}</strong></span><span>{local("紧急联系", "Emergency")}<strong>{detail.emergency_phone || "—"}</strong></span></div>{detail.notes && <p className="profile-note"><Icon name="bell" size={16}/>{detail.notes}</p>}</div></section>
          <section className="profile-cards"><header><h3>{local("会员卡", "Membership cards")} <Badge>{(detail.cards?.length ?? 0) + (detail.shared_cards?.length ?? 0)}</Badge></h3><span>{local("升卡、转卡、共享与停卡集中管理", "Upgrade, transfer, share and freeze")}</span></header>{[...(detail.cards ?? []), ...(detail.shared_cards ?? [])].map((card) => <article key={`${card.member_id}-${card.id}`}><div><strong>{local(card.product_name, card.product_name_en)}{card.member_id !== detail.id && <Badge tone="blue">{local("共享卡", "Shared")}</Badge>}</strong><small>{card.card_no} · {card.purchased_at} {local("购卡", "purchased")}</small>{!!card.shared_with?.length && <small>{local("共享给", "Shared with")} {card.shared_with.map((share) => <span className="shared-member" key={share.id}>{share.name}{canWrite && <button type="button" aria-label={local(`取消共享给${share.name}`, `Remove sharing with ${share.name}`)} disabled={busy} onClick={() => void unshare(card, share.id)}>×</button>}</span>)}</small>}</div><div><span>{card.total_sessions ? local(`${card.total_sessions} 次，剩余 ${card.remaining_sessions ?? 0} 次`, `${card.total_sessions} sessions, ${card.remaining_sessions ?? 0} remaining`) : local("周期不限次", "Unlimited")}</span>{card.benefits.length > 0 && <small>{card.benefits.map((benefit) => `${categoryLabel(benefit.course_type)} ${benefit.remaining ?? 0}`).join(" · ")}</small>}</div><div><span>{card.starts_on} ~ {card.expires_on}</span><small>{card.frozen_until ? local(`冻结至 ${card.frozen_until}`, `Frozen until ${card.frozen_until}`) : card.note || "—"}</small></div><Badge tone={card.status === "active" ? "green" : "neutral"}>{card.status === "active" ? local("正常", "Active") : card.status === "expired" ? local("已过期", "Expired") : card.status === "upgraded" ? local("已升卡", "Upgraded") : local("已销卡", "Cancelled")}</Badge>{canWrite && card.member_id === detail.id && <div className="table-actions"><button className="button button-small button-outline" type="button" onClick={() => editCard(card)}>{local("卡操作", "Manage")}</button><RecycleDeleteButton resource="cards" id={card.id} label={`${card.card_no} · ${card.product_name}`} onDeleted={onChanged}/></div>}</article>)}{!(detail.cards?.length || detail.shared_cards?.length) && <Empty>{local("尚未购卡", "No cards")}</Empty>}</section>
          {!!detail.vouchers?.length && <section className="voucher-list"><header><h3>{local("体验券", "Experience vouchers")}</h3><span>{local("签到时自动优先匹配有效卡，无卡时核销体验券", "Cards are matched first; vouchers are used when no card is available")}</span></header>{detail.vouchers.map((voucher) => <article key={voucher.id}><Badge tone={voucher.status === "active" ? "green" : "neutral"}>{categoryLabel(voucher.course_type)}</Badge><strong>{local(`剩余 ${voucher.remaining_sessions} / ${voucher.total_sessions} 次`, `${voucher.remaining_sessions} / ${voucher.total_sessions} remaining`)}</strong><span>{local("有效期至", "Until")} {voucher.expires_on}</span><small>{voucher.note}</small>{canWrite && <div className="table-actions">{voucher.status === "active" && <button className="text-button danger" type="button" onClick={() => void revokeVoucher(voucher.id)}>{local("停用", "Cancel")}</button>}<RecycleDeleteButton resource="vouchers" id={voucher.id} label={`${categoryLabel(voucher.course_type)}体验券 #${voucher.id}`} onDeleted={onChanged}/></div>}</article>)}</section>}
          <div className="me-tabs"><button className={tab === "bookings" ? "active" : ""} type="button" onClick={() => setTab("bookings")}>{local("团课预约记录", "Group bookings")}</button><button className={tab === "private_bookings" ? "active" : ""} type="button" onClick={() => setTab("private_bookings")}>{local("私教预约记录", "PT bookings")}</button><button className={tab === "records" ? "active" : ""} type="button" onClick={() => setTab("records")}>{local("私教 / 跟进记录", "PT & notes")}</button><button className={tab === "transactions" ? "active" : ""} type="button" onClick={() => setTab("transactions")}>{local("消费记录", "Transactions")}</button></div>
          {tab === "bookings" && bookingTable(detail.bookings.filter((booking) => booking.session?.course.course_type === "group"))}
          {tab === "private_bookings" && bookingTable(detail.bookings.filter((booking) => ["private", "assessment", "workshop"].includes(booking.session?.course.course_type ?? "")))}
          {tab === "records" && <><div className="section-action-header"><h3>{local("私教训练与跟进", "PT & follow-up")}</h3>{canWrite && <button className="button button-small button-outline" type="button" onClick={() => openRecordEditor()}><Icon name="plus" size={15}/>{local("新增记录", "Add record")}</button>}</div><div className="record-list">{detail.records.filter((record) => record.record_type !== "assessment").map((record) => <article key={record.id}><span>{record.record_date} · {record.record_type === "pt_diary" ? "PT diary" : "Note"}</span><h3>{record.title}</h3><p>{record.content}</p><small>{record.teacher_name}</small>{canWrite && <div className="table-actions"><button className="text-button" type="button" onClick={() => openRecordEditor(record)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource="records" id={record.id} label={record.title} onDeleted={onChanged}/></div>}</article>)}{!detail.records.filter((record) => record.record_type !== "assessment").length && <Empty>{local("暂无私教或跟进记录", "No PT or follow-up records")}</Empty>}</div></>}
          {tab === "transactions" && <ResponsiveTable><table className="data-table"><thead><tr><th>{local("日期", "Date")}</th><th>{local("类别", "Category")}</th><th>{local("摘要", "Description")}</th><th>{local("支付方式", "Payment")}</th><th>{local("金额", "Amount")}</th></tr></thead><tbody>{detail.transactions.map((row) => <tr key={row.id}><td>{row.occurred_at}</td><td>{row.category}</td><td>{transactionNote(row, language)}</td><td>{local(paymentMethods.find(([value]) => value === row.payment_method)?.[1] ?? row.payment_method, paymentMethods.find(([value]) => value === row.payment_method)?.[2])}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></ResponsiveTable>}
          <MemberDocuments detail={detail} category="assessment" busy={busy} canWrite={canWrite} onChanged={onChanged} onUpload={(file, category) => void uploadDocument(file, category)}/>
          <MemberDocuments detail={detail} category="contract" busy={busy} canWrite={canWrite} onChanged={onChanged} onUpload={(file, category) => void uploadDocument(file, category)}/>
        </div>
      </div>
    </Modal>

    {purchaseOpen && <Modal title={local(`为 ${detail.name} 购卡`, `Buy a card for ${detail.name_en || detail.name}`)} onClose={() => setPurchaseOpen(false)}><form className="form-grid" onSubmit={purchase}><Field label={local("卡课产品", "Product")}><select value={productId} onChange={(event) => { setProductId(event.target.value); setPrice(meta?.products.find((item) => item.id === Number(event.target.value))?.price ?? 0); }}>{meta?.products.filter((item) => item.active).map((product) => <option key={product.id} value={product.id}>{local(product.name, product.name_en)} · {money(product.price)}</option>)}</select></Field><div className="form-grid two-columns"><Field label={local("实收价格", "Actual price")}><input required min={0} step="0.01" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))}/></Field><Field label={local("开卡日期", "Start date")}><input required type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)}/></Field></div><Field label={local("结账方式", "Payment")}><select value={payment} onChange={(event) => setPayment(event.target.value)}>{paymentMethods.map(([value, zh, en]) => <option key={value} value={value}>{local(zh, en)}</option>)}</select></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("确认购卡并入账", "Confirm purchase")}</button></form></Modal>}
    {cardTarget && <Modal title={`${local(cardTarget.product_name, cardTarget.product_name_en)} · ${local("卡操作", "Manage card")}`} onClose={() => setCardTarget(null)}><form className="form-grid" onSubmit={saveCard}><Field label={local("操作类型", "Action")}><select value={cardAction} onChange={(event) => setCardAction(event.target.value)}><option value="extend">{local("续卡 / 延期", "Extend")}</option><option value="freeze">{local("请假 / 停卡", "Freeze")}</option><option value="unfreeze">{local("解除停卡 / 重新启用", "Unfreeze / reactivate")}</option><option value="adjust">{local("手动调整剩余次数", "Adjust remaining")}</option><option value="upgrade">{local("升卡（补差价）", "Upgrade")}</option><option value="transfer">{local("转卡给其他会员", "Transfer")}</option><option value="share">{local("共享给家人", "Share")}</option><option value="cancel">{local("销卡", "Cancel card")}</option></select></Field>{cardAction === "extend" && <Field label={local("延期天数（负数可缩短）", "Days to extend")}><input type="number" value={cardDays} onChange={(event) => setCardDays(Number(event.target.value))}/></Field>}{cardAction === "freeze" && <Field label={local("冻结截止日期", "Frozen until")}><input required type="date" value={frozenUntil} onChange={(event) => setFrozenUntil(event.target.value)}/></Field>}{cardAction === "adjust" && <Field label={local("剩余次数", "Remaining")}><input min={0} type="number" value={remaining} onChange={(event) => setRemaining(Number(event.target.value))}/></Field>}{cardAction === "upgrade" && <><Field label={local("升级至产品", "Upgrade to")}><select required value={upgradeProductId} onChange={(event) => { setUpgradeProductId(event.target.value); const product = meta?.products.find((item) => item.id === Number(event.target.value)); setUpgradePrice(Math.max(0, (product?.price ?? 0) - cardTarget.purchase_price)); }}>{meta?.products.filter((item) => item.active && item.id !== cardTarget.product_id && (item.category === cardTarget.category || item.category === "annual")).map((product) => <option value={product.id} key={product.id}>{local(product.name, product.name_en)} · {money(product.price)}</option>)}</select></Field><div className="form-grid two-columns"><Field label={local("补差金额", "Difference")}><input required min={0} step="0.01" type="number" value={upgradePrice} onChange={(event) => setUpgradePrice(Number(event.target.value))}/></Field><Field label={local("结账方式", "Payment")}><select value={payment} onChange={(event) => setPayment(event.target.value)}>{paymentMethods.map(([value, zh, en]) => <option key={value} value={value}>{local(zh, en)}</option>)}</select></Field></div></>}{["transfer", "share"].includes(cardAction) && <Field label={local(cardAction === "transfer" ? "接收会员" : "共享会员", "Target member")} hint={local(cardAction === "transfer" ? "整卡及剩余权益转给对方；未消课预约需先处理" : "对方可在签到时共用此卡剩余权益", cardAction === "transfer" ? "Transfer the card and remaining benefits" : "The member can consume this card at check-in")}><MemberPicker members={members} value={targetMemberId} onChange={setTargetMemberId} required excludeId={detail.id}/></Field>}<Field label={local("操作原因 / 备注（必填）", "Reason / notes (required)")}><textarea required rows={3} value={cardNote} onChange={(event) => setCardNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy || (["transfer", "share"].includes(cardAction) && !targetMemberId) || (cardAction === "upgrade" && !upgradeProductId)} type="submit">{local("确认卡操作", "Confirm")}</button></form></Modal>}
    {recordOpen && <Modal title={local(editingRecordId ? "编辑私教 / 跟进记录" : "新增私教 / 跟进记录", editingRecordId ? "Edit PT / follow-up record" : "Add PT / follow-up record")} onClose={() => setRecordOpen(false)}><form className="form-grid" onSubmit={addRecord}><Field label={local("记录类型", "Record type")}><select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option value="pt_diary">{local("私教训练内容 / PT diary", "PT diary")}</option><option value="note">{local("跟进备注", "Follow-up note")}</option></select></Field><p className="form-help">{local("体测 Assessment 请在档案下方直接上传完整评估表。", "Upload assessment forms in the Assessment section below.")}</p><Field label={local("标题", "Title")}><input required value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)}/></Field><Field label={local("详细记录", "Details")}><textarea required rows={6} value={recordContent} onChange={(event) => setRecordContent(event.target.value)} placeholder={local("训练内容、身体反馈、下次练习建议…", "Training, feedback and recommendations…")}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("保存记录", "Save record")}</button></form></Modal>}
    {reminderOpen && <Modal title={local("新增会员提醒", "Add member reminder")} onClose={() => setReminderOpen(false)}><form className="form-grid" onSubmit={addReminder}><p className="form-help">{local("到期提醒会在进入会员档案和到店签到时弹出；生日前 7 天会自动提示。", "Due reminders appear on profile visits and check-in. Birthdays are highlighted seven days ahead.")}</p><Field label={local("提醒内容", "Reminder")}><textarea required autoFocus rows={4} value={reminderContent} onChange={(event) => setReminderContent(event.target.value)} placeholder={local("例如：会员生日准备了小礼物，签到时交给会员", "e.g. Prepare a birthday gift for the member")}/></Field><Field label={local("提醒日期", "Remind on")}><input required type="date" value={remindOn} onChange={(event) => setRemindOn(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("保存提醒", "Save reminder")}</button></form></Modal>}
    {voucherOpen && <Modal title={local("赠送体验券", "Offer experience voucher")} onClose={() => setVoucherOpen(false)}><form className="form-grid" onSubmit={addVoucher}><Field label={local("适用课程", "Class type")}><select value={voucherType} onChange={(event) => setVoucherType(event.target.value)}>{["group", "private", "assessment", "workshop", "all"].map((value) => <option value={value} key={value}>{categoryLabel(value)}</option>)}</select></Field><div className="form-grid two-columns"><Field label={local("体验次数", "Sessions")}><input min={1} max={100} type="number" value={voucherQuantity} onChange={(event) => setVoucherQuantity(Number(event.target.value))}/></Field><Field label={local("有效期至", "Valid until")}><input required type="date" min={today()} value={voucherExpiry} onChange={(event) => setVoucherExpiry(event.target.value)}/></Field></div><Field label={local("销售备注", "Offer notes")}><textarea rows={3} value={voucherNote} onChange={(event) => setVoucherNote(event.target.value)} placeholder={local("体验来源、销售跟进说明…", "Offer source and sales notes…")}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("确认赠券", "Issue voucher")}</button></form></Modal>}
  </>;
}
