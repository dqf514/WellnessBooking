import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { EntryOptionsFields } from "@/components/EntryOptionsFields";
import { MemberPicker } from "@/components/MemberPicker";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { SortableTh, useTableSort } from "@/components/SortableTable";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money, today } from "@/lib/date";
import { categoryLabel, defaultRevenueMode, entryTypeLabel, financeCategories, paymentLabel, paymentMethods } from "@/lib/financeCopy";
import { useCan } from "@/lib/permissions";
import { transactionNote } from "@/lib/transactionCopy";
import type { MemberOption, Transaction } from "@/types";

const kindCopy: Record<string, [string, string]> = { purchase: ["购买", "Purchase"], refund: ["退款", "Refund"], upgrade: ["升卡", "Upgrade"], manual: ["手动", "Manual"], consumption: ["消课营收", "Consumption revenue"], consumption_reversal: ["营收冲销", "Revenue reversal"] };

export function FinancePage() {
  const { local, language } = useLanguage();
  const canWrite = useCan("finance.write");
  const canRedeem = useCan("revenue.write");
  // 只有具备 finance.view 的角色才能看完整流水；前台仅保留电子码核销。
  const canViewLedger = useCan("finance.view");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [refundTotal, setRefundTotal] = useState(0);
  const [methods, setMethods] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [entryCategory, setEntryCategory] = useState("group");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [recordCash, setRecordCash] = useState(true);
  const [revenueMode, setRevenueMode] = useState("immediate");
  const [revenueStartOn, setRevenueStartOn] = useState(today());
  const [revenueDays, setRevenueDays] = useState(365);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const [refundTarget, setRefundTarget] = useState<Transaction | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const requestId = ++latestRequest.current;
    try {
      const params = new URLSearchParams({ date_from: from, date_to: to });
      if (category) params.set("category", category);
      if (methods.length) params.set("payment_method", methods.join(","));
      const result = await apiFetch<{ items: Transaction[]; total_amount: number; revenue_amount: number; refund_amount: number }>(`/api/admin/transactions?${params}`);
      if (requestId !== latestRequest.current) return;
      setRows(result.items); setTotal(result.total_amount); setRevenueTotal(result.revenue_amount ?? 0); setRefundTotal(result.refund_amount ?? 0);
    } catch (err) { if (requestId === latestRequest.current) setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [from, to, category, methods]);
  useEffect(() => { if (canViewLedger) void load(); }, [load, canViewLedger]);
  useEffect(() => { if (!canWrite) return; void apiFetch<{ items: MemberOption[] }>("/api/admin/members/options?limit=20000").then((result) => setMembers(result.items)).catch((err) => setError(err instanceof Error ? err.message : local("加载会员失败", "Failed to load members"))); }, [canWrite]);

  function openManual(row?: Transaction) {
    setEditingTransaction(row ?? null);
    setMemberId(String(row?.member_id ?? ""));
    setEntryCategory(row?.category ?? "group");
    setAmount(row ? String(row.amount) : "");
    setMethod(row?.payment_method ?? "cash");
    setNote(row?.note ?? "");
    setRecordCash(row?.cash_basis ?? true);
    setRevenueMode(row?.revenue_mode ?? "immediate");
    setRevenueStartOn(row?.revenue_start_on || today());
    setRevenueDays(row?.revenue_days || 365);
    setManualOpen(true); setError("");
  }
  function changeEntryCategory(value: string) {
    setEntryCategory(value);
    if (editingTransaction) return;
    if (value === "private") { setRecordCash(false); setRevenueMode("immediate"); }
    else { setRecordCash(true); setRevenueMode(defaultRevenueMode(value)); }
  }
  async function manual(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await apiFetch(editingTransaction ? `/api/admin/transactions/${editingTransaction.id}` : "/api/admin/transactions/manual", { method: editingTransaction ? "PATCH" : "POST", json: { member_id: memberId ? Number(memberId) : null, category: entryCategory, amount: Number(amount), payment_method: method, note, record_cash: recordCash, revenue_mode: revenueMode, revenue_start_on: revenueStartOn, revenue_days: revenueDays } });
      setMessage(local("手动入账已保存", "Manual entry saved")); setManualOpen(false); setEditingTransaction(null); setAmount(""); setNote(""); setMemberId(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("入账失败", "Entry failed")); }
    finally { setBusy(false); }
  }
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiFetch<{ card_id: number }>("/api/admin/orders/redeem", { method: "POST", json: { redemption_code: code } });
      setMessage(local(`电子码核销成功，会员卡 #${result.card_id} 已开通`, `Code redeemed. Membership card #${result.card_id} is active.`)); setRedeemOpen(false); setCode(""); if (canViewLedger) await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("核销失败", "Redemption failed")); }
    finally { setBusy(false); }
  }
  async function refund(row: Transaction) {
    if (!refundTarget) return;
    const reason = refundReason.trim();
    if (!reason) { setError(local("请填写退款原因", "Enter a refund reason")); return; }
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/transactions/${row.id}/refund`, { method: "POST", json: { amount: row.amount, note: reason } }); setMessage(local("退款已入账，关联整卡已销卡", "Refund posted and the associated card cancelled")); setRefundTarget(null); setRefundReason(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("退款失败", "Refund failed")); }
    finally { setBusy(false); }
  }
  async function exportPdf(path: string, filename: string) {
    setError("");
    try { await downloadFile(path, filename); }
    catch (err) { setError(err instanceof Error ? err.message : local("PDF 导出失败", "PDF export failed")); }
  }
  async function exportCsv(path: string, filename: string) {
    setError("");
    try { await downloadFile(path, filename); }
    catch (err) { setError(err instanceof Error ? err.message : local("导出失败", "Export failed")); }
  }
  // 流水支持按会员、摘要或流水号检索，并可点击表头排序。
  const visibleRows = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.id} ${row.member_name ?? ""} ${row.note ?? ""} ${row.product_name ?? ""} ${row.redemption_code ?? ""} ${transactionNote(row, language)}`.toLocaleLowerCase().includes(term));
  }, [rows, keyword, language]);
  const ledgerSortValues = useMemo(() => ({
    default: (row: Transaction) => rows.findIndex((item) => item.id === row.id),
    id: (row: Transaction) => row.id,
    member: (row: Transaction) => row.member_name ?? "",
    category: (row: Transaction) => row.category,
    amount: (row: Transaction) => row.amount,
    status: (row: Transaction) => row.status,
    time: (row: Transaction) => row.occurred_at,
  }), [rows]);
  const ledgerSort = useTableSort(visibleRows, "default", ledgerSortValues);

  return <div>
    <PageHeader eyebrow="FINANCE LEDGER" title={canViewLedger ? local("财务入账", "Finance") : local("收款与核销", "Redemption")} description={canViewLedger ? local("流水与营收分开记录；支持即时营收、每日均摊和私教消课营收，并可导出品牌账单。", "Cash and revenue are recorded independently with immediate, amortized and consumption-based recognition.") : local("您的角色可核销会员线上提交的购卡电子码；完整流水与账单请查看“财务与报表”。", "Your role can redeem online card codes. The full ledger and invoices are available under Finance & reports.")} actions={<>{canRedeem && <button className="button button-outline" type="button" onClick={() => setRedeemOpen(true)}>{local("电子码核销", "Redeem code")}</button>}{canWrite && <button className="button button-primary" type="button" onClick={() => openManual()}><Icon name="plus" size={18}/>{local("手动入账", "Manual entry")}</button>}</>}/>
    {canViewLedger ? <>
    <section className="finance-total"><div><span>{local("流水总额（已扣退款）", "Ledger total (net of refunds)")}</span><strong>{money(total)}</strong><p>{local("仅统计入流水的记录，退款已扣除", "Cash-ledger entries only, refunds deducted")} · {rows.length} {local("笔", "entries")}</p></div><div><span>{local("营收总额（已扣退款）", "Revenue total (net of refunds)")}</span><strong>{money(revenueTotal)}</strong><p>{local("按系统设置的营收口径确认，退款已扣除", "Recognized per the revenue policy, refunds deducted")}</p></div><div><span>{local("退款总额", "Refund total")}</span><strong>{money(refundTotal)}</strong></div></section>
    <section className="filter-panel"><Field label={local("开始日期", "From")}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label={local("结束日期", "To")}><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><Field label={local("入账类别", "Category")}><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{local("全部类别", "All categories")}</option>{financeCategories.map((value) => <option key={value} value={value}>{categoryLabel(value, local)}</option>)}</select></Field><Field label={local("搜索", "Search")}><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={local("会员、摘要或流水号", "Member, description or entry no.")}/></Field><div className="field filter-chips-field"><span>{local("结账方式（可多选）", "Payment method (multi-select)")}</span><div className="filter-chips">{paymentMethods.map((value) => <button key={value} className={methods.includes(value) ? "picker-chip active" : "picker-chip"} type="button" onClick={() => setMethods(methods.includes(value) ? methods.filter((item) => item !== value) : [...methods, value])}>{paymentLabel(value, local)}</button>)}</div></div><button className="button button-primary" type="button" onClick={() => { const params = new URLSearchParams({ date_from: from, date_to: to }); if (category) params.set("category", category); if (methods.length) params.set("payment_method", methods.join(",")); void exportPdf(`/api/admin/transactions.pdf?${params}`, `wellness-transactions-${from}-${to}.pdf`); }}><Icon name="download" size={17}/>{local("导出 PDF", "Export PDF")}</button><button className="button button-outline" type="button" onClick={() => void exportCsv("/api/admin/maintenance/export/transactions.csv", "transactions.csv")}><Icon name="download" size={17}/>{local("导出 CSV", "Export CSV")}</button></section>
    </> : <Notice message={local("当前角色不显示收支流水，仅提供电子码核销。", "Your role does not see the cash ledger; only code redemption is available.")}/>}
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {canViewLedger && (loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><SortableTh column="id" label={local("流水号 / 时间", "Entry / time")} sort={ledgerSort}/><SortableTh column="member" label={local("会员", "Member")} sort={ledgerSort}/><SortableTh column="category" label={local("类别", "Category")} sort={ledgerSort}/><th>{local("摘要", "Description")}</th><th>{local("入账类型", "Treatment")}</th><th>{local("支付方式", "Payment")}</th><SortableTh column="status" label={local("状态", "Status")} sort={ledgerSort}/><SortableTh column="amount" label={local("金额", "Amount")} sort={ledgerSort}/><th>{local("操作", "Actions")}</th></tr></thead><tbody>{ledgerSort.sorted.map((row) => <tr key={row.id}><td>#{row.id}<small>{row.occurred_at}</small></td><td>{row.member_name || local("非会员", "Non-member")}</td><td>{categoryLabel(row.category, local)}<small>{local(kindCopy[row.kind]?.[0] ?? row.kind, kindCopy[row.kind]?.[1])}</small></td><td>{transactionNote(row, language)}{row.redemption_code && <small>{local("电子码", "Code")} {row.redemption_code}</small>}{row.created_by && <small>{local("入账人", "Posted by")} · {row.created_by}</small>}</td><td><Badge tone={row.cash_basis && row.revenue_mode !== "none" ? "green" : row.cash_basis ? "blue" : "amber"}>{entryTypeLabel(row, local)}</Badge>{row.revenue_mode === "amortized" && <small>{row.revenue_start_on} · {row.revenue_days} {local("天", "days")}</small>}</td><td>{paymentLabel(row.payment_method, local)}</td><td><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : "neutral"}>{row.status === "paid" ? local("已入账", "Posted") : row.status === "pending" ? local("待核销", "Pending") : row.status === "cancelled" ? local("已取消", "Cancelled") : local("已退款", "Refunded")}</Badge>{row.cancelled_at && <small>{row.cancelled_at} · {local(row.cancelled_by || "", "Member cancellation")}</small>}</td><td className={row.amount < 0 ? "negative-amount" : "amount-cell"}>{money(row.amount)}</td><td><div className="table-actions">{["paid", "refunded"].includes(row.status) && <button className="text-button" type="button" onClick={() => void exportPdf(`/api/admin/transactions/${row.id}/receipt.pdf`, `wellness-receipt-${row.id}.pdf`)}><Icon name="download" size={15}/>{local("账单小票", "Receipt")}</button>}{row.kind === "manual" && row.status === "paid" && canWrite && <><button className="text-button" type="button" onClick={() => openManual(row)}>{local("编辑", "Edit")}</button><RecycleDeleteButton resource="transactions" id={row.id} label={`手工入账 #${row.id}`} onDeleted={load}/></>}{row.status === "paid" && row.amount > 0 && canWrite && ["purchase", "upgrade", "manual"].includes(row.kind) && <button className="text-button danger" type="button" onClick={() => { setRefundTarget(row); setRefundReason(""); setError(""); }}>{local("退款", "Refund")}</button>}</div></td></tr>)}</tbody></table></ResponsiveTable>{visibleRows.length === 0 && <Empty>{rows.length === 0 ? local("该时间段暂无流水", "No transactions in this period") : local("没有匹配的流水", "No matching transactions")}</Empty>}</section>)}
    {manualOpen && <Modal wide title={local(editingTransaction ? "编辑手工入账" : "手动入账", editingTransaction ? "Edit manual entry" : "Manual entry")} onClose={() => setManualOpen(false)}><form className="form-grid two-columns" onSubmit={manual}>{error && <div className="span-two"><Notice error message={error}/></div>}<div className="span-two"><Field label={local("关联会员（可选）", "Linked member (optional)")} hint={local("输入姓名或手机号，选择后自动填充", "Search by name or mobile and select to autofill")}><MemberPicker members={members} value={memberId} onChange={setMemberId}/></Field></div><Field label={local("入账类别", "Category")}><select value={entryCategory} onChange={(event) => changeEntryCategory(event.target.value)}>{financeCategories.map((value) => <option key={value} value={value}>{categoryLabel(value, local)}</option>)}</select></Field><Field label={local("金额", "Amount")}><input required type="number" step="0.01" inputMode="decimal" placeholder={local("请输入金额", "Enter amount")} value={amount} onFocus={() => { if (amount === "0") setAmount(""); }} onChange={(event) => setAmount(event.target.value)}/></Field><div className="span-two"><Field label={local("结账方式", "Payment method")}><select value={method} onChange={(event) => setMethod(event.target.value)}>{paymentMethods.map((value) => <option key={value} value={value}>{paymentLabel(value, local)}</option>)}</select></Field></div><EntryOptionsFields recordCash={recordCash} revenueMode={revenueMode} revenueStartOn={revenueStartOn} revenueDays={revenueDays} onRecordCashChange={setRecordCash} onRevenueModeChange={setRevenueMode} onRevenueStartOnChange={setRevenueStartOn} onRevenueDaysChange={setRevenueDays}/><div className="span-two"><Field label={local("备注（选填）", "Notes (optional)")}><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)}/></Field></div><button className="button button-primary button-full span-two" disabled={busy || !amount || (!recordCash && revenueMode === "none")} type="submit">{local("确认入账", "Confirm entry")}</button></form></Modal>}
    {refundTarget && <Modal title={local("确认退款", "Confirm refund")} onClose={() => setRefundTarget(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void refund(refundTarget); }}><p className="form-help">{local(`将退款 ${money(refundTarget.amount)}，关联的整卡会一并销卡。`, `A refund of ${money(refundTarget.amount)} will be posted and the associated card cancelled.`)}</p><Field label={local("退款原因（必填）", "Refund reason (required)")}><textarea required data-autofocus rows={3} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder={local("例如：会员申请退款", "e.g. Member requested a refund")}/></Field><button className="button button-primary button-full" disabled={busy || !refundReason.trim()} type="submit">{busy ? local("处理中…", "Working…") : local("确认退款", "Confirm refund")}</button><button className="button button-outline button-full" type="button" onClick={() => setRefundTarget(null)}>{local("取消", "Cancel")}</button></form></Modal>}
    {redeemOpen && <Modal title={local("线上购卡电子码核销", "Redeem online card code")} onClose={() => setRedeemOpen(false)}><form className="form-grid" onSubmit={redeem}><p className="form-help">{local("核销后系统会按原申请产品开通会员卡，并将待核销流水转为已入账。", "Redemption activates the requested card and marks the transaction as posted.")}</p><Field label={local("电子码", "Code")}><input required data-autofocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="YY260101123456"/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{local("确认到店支付并核销", "Confirm payment & redeem")}</button></form></Modal>}
  </div>;
}
