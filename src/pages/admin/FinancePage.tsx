import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { MemberPicker } from "@/components/MemberPicker";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money, today } from "@/lib/date";
import { transactionNote } from "@/lib/transactionCopy";
import type { Member, Transaction } from "@/types";

const categoryCopy: Record<string, [string, string]> = { group: ["团课", "Group classes"], private: ["私教", "Personal training"], annual: ["年卡", "Annual membership"], workshop: ["工作坊", "Workshops"], training: ["培训课", "Training"], enterprise: ["企业课", "Corporate"], package: ["组合套餐", "Packages"], assessment: ["评估", "Assessment"], misc: ["杂项", "Miscellaneous"] };
const categoryValues = Object.keys(categoryCopy);
const paymentCopy: Record<string, [string, string]> = { cash: ["现金", "Cash"], pos: ["POS 通", "POS"], company_qr: ["公司二维码", "Company QR code"], alipay: ["支付宝", "Alipay"], wechat: ["微信", "WeChat Pay"], ar: ["AR account", "AR account"], ent: ["ENT", "ENT"], youzan: ["有赞", "Youzan"], dianping: ["大众点评", "Dianping"], voucher: ["券", "Voucher"], stored_card: ["储值卡", "Stored-value card"] };
const methodValues = Object.keys(paymentCopy);

export function FinancePage() {
  const { local, language } = useLanguage();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [entryCategory, setEntryCategory] = useState("group");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const paymentLabel = (value: string) => local(paymentCopy[value]?.[0] ?? value, paymentCopy[value]?.[1]);
  const categoryLabel = (value: string) => local(categoryCopy[value]?.[0] ?? value, categoryCopy[value]?.[1]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const params = new URLSearchParams({ date_from: from, date_to: to }); if (category) params.set("category", category); const result = await apiFetch<{ items: Transaction[]; total_amount: number }>(`/api/admin/transactions?${params}`); setRows(result.items); setTotal(result.total_amount); }
    catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [from, to, category]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void apiFetch<{ items: Member[] }>("/api/admin/members").then((result) => setMembers(result.items)); }, []);

  function openManual(row?: Transaction) {
    setEditingTransaction(row ?? null); setMemberId(String(row?.member_id ?? "")); setEntryCategory(row?.category ?? "group"); setAmount(row ? String(row.amount) : ""); setMethod(row?.payment_method ?? "cash"); setNote(row?.note ?? ""); setManualOpen(true); setError("");
  }
  async function manual(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch(editingTransaction ? `/api/admin/transactions/${editingTransaction.id}` : "/api/admin/transactions/manual", { method: editingTransaction ? "PATCH" : "POST", json: { member_id: memberId ? Number(memberId) : null, category: entryCategory, amount: Number(amount), payment_method: method, note } }); setMessage(local("手动入账已保存", "Manual entry saved")); setManualOpen(false); setEditingTransaction(null); setAmount(""); setNote(""); setMemberId(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("入账失败", "Entry failed")); }
    finally { setBusy(false); }
  }
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await apiFetch<{ card_id: number }>("/api/admin/orders/redeem", { method: "POST", json: { redemption_code: code } }); setMessage(local(`电子码核销成功，会员卡 #${result.card_id} 已开通`, `Code redeemed. Membership card #${result.card_id} is active.`)); setRedeemOpen(false); setCode(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("核销失败", "Redemption failed")); }
    finally { setBusy(false); }
  }
  async function refund(row: Transaction) {
    const reason = window.prompt(local(`退款 ${money(row.amount)}，请填写退款原因：`, `Refund ${money(row.amount)}. Enter a reason:`), local("会员申请退款", "Member requested a refund")); if (!reason) return;
    try { await apiFetch(`/api/admin/transactions/${row.id}/refund`, { method: "POST", json: { amount: row.amount, note: reason } }); setMessage(local("退款已入账，关联整卡已销卡", "Refund posted and the associated card cancelled")); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("退款失败", "Refund failed")); }
  }

  return <div>
    <PageHeader eyebrow="FINANCE LEDGER" title={local("财务入账", "Finance")} description={local("本页记录现金流水；年卡按天、私教按消课、团课卡按购买确认营收，请在报表分析中查看。", "This ledger records cash. See Reports for daily annual-card recognition, PT recognition on consumption, and group-card recognition on purchase.")} actions={<><button className="button button-outline" type="button" onClick={() => setRedeemOpen(true)}>{local("电子码核销", "Redeem code")}</button><button className="button button-primary" type="button" onClick={() => openManual()}><Icon name="plus" size={18}/>{local("手动入账", "Manual entry")}</button></>}/>
    <section className="finance-total"><div><span>{local("筛选范围现金实收", "Cash received in range")}</span><strong>{money(total)}</strong><p>{local("含退款负数流水，不等于确认营收", "Includes refunds; not recognized revenue")} · {rows.length} {local("笔", "entries")}</p></div><div><span>{local("购买入账", "Purchases")}</span><strong>{money(rows.filter((row) => ["purchase", "upgrade"].includes(row.kind) && row.amount > 0).reduce((sum, row) => sum + row.amount, 0))}</strong></div><div><span>{local("退款支出", "Refunds")}</span><strong>{money(Math.abs(rows.filter((row) => row.kind === "refund").reduce((sum, row) => sum + row.amount, 0)))}</strong></div></section>
    <section className="filter-panel"><Field label={local("开始日期", "From")}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label={local("结束日期", "To")}><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><Field label={local("入账类别", "Category")}><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{local("全部类别", "All categories")}</option>{categoryValues.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></Field><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/transactions.csv", "transactions.csv")}><Icon name="download" size={17}/>{local("导出流水", "Export")}</button></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("流水号 / 时间", "Entry / time")}</th><th>{local("会员", "Member")}</th><th>{local("类别", "Category")}</th><th>{local("摘要", "Description")}</th><th>{local("支付方式", "Payment")}</th><th>{local("状态", "Status")}</th><th>{local("金额", "Amount")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>#{row.id}<small>{row.occurred_at}</small></td><td>{row.member_name || local("非会员", "Non-member")}</td><td>{categoryLabel(row.category)}<small>{local(row.kind === "purchase" ? "购买" : row.kind === "refund" ? "退款" : row.kind === "upgrade" ? "升卡" : "手动", row.kind)}</small></td><td>{transactionNote(row, language)}{row.redemption_code && <small>{local("电子码", "Code")} {row.redemption_code}</small>}</td><td>{paymentLabel(row.payment_method)}</td><td><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : "neutral"}>{row.status === "paid" ? local("已入账", "Posted") : row.status === "pending" ? local("待核销", "Pending") : row.status === "cancelled" ? local("已取消", "Cancelled") : local("已退款", "Refunded")}</Badge>{row.cancelled_at && <small>{row.cancelled_at} · {local(row.cancelled_by || "", "Member cancellation")}</small>}</td><td className={row.amount < 0 ? "negative-amount" : "amount-cell"}>{money(row.amount)}</td><td><div className="table-actions">{row.kind === "manual" && <><button className="text-button" type="button" onClick={() => openManual(row)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource="transactions" id={row.id} label={`手工入账 #${row.id}`} onDeleted={load}/></>}{row.status === "paid" && row.amount > 0 && <button className="text-button danger" type="button" onClick={() => void refund(row)}>{local("退款", "Refund")}</button>}</div></td></tr>)}</tbody></table></ResponsiveTable>{rows.length === 0 && <Empty>{local("该时间段暂无流水", "No transactions in this period")}</Empty>}</section>}
    {manualOpen && <Modal title={local(editingTransaction ? "编辑手工入账" : "手动入账", editingTransaction ? "Edit manual entry" : "Manual entry")} onClose={() => setManualOpen(false)}><form className="form-grid" onSubmit={manual}><Field label={local("关联会员（可选）", "Linked member (optional)")} hint={local("输入姓名或手机号，选择后自动填充", "Search by name or mobile and select to autofill")}><MemberPicker members={members} value={memberId} onChange={setMemberId}/></Field><div className="form-grid two-columns"><Field label={local("入账类别", "Category")}><select value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>{categoryValues.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></Field><Field label={local("金额", "Amount")}><input required type="number" step="0.01" inputMode="decimal" placeholder={local("请输入金额", "Enter amount")} value={amount} onFocus={() => { if (amount === "0") setAmount(""); }} onChange={(event) => setAmount(event.target.value)}/></Field></div><Field label={local("结账方式", "Payment method")}><select value={method} onChange={(event) => setMethod(event.target.value)}>{methodValues.map((value) => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select></Field><Field label={local("备注（选填）", "Notes (optional)")}><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy || !amount} type="submit">{local("确认入账", "Confirm entry")}</button></form></Modal>}
    {redeemOpen && <Modal title={local("线上购卡电子码核销", "Redeem online card code")} onClose={() => setRedeemOpen(false)}><form className="form-grid" onSubmit={redeem}><p className="form-help">{local("核销后系统会按原申请产品开通会员卡，并将待核销流水转为已入账。", "Redemption activates the requested card and marks the transaction as posted.")}</p><Field label={local("电子码", "Code")}><input required autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="YY260101123456"/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("确认到店支付并核销", "Confirm payment & redeem")}</button></form></Modal>}
  </div>;
}
