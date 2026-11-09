import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money, today } from "@/lib/date";
import { transactionNote } from "@/lib/transactionCopy";
import type { Member, Transaction } from "@/types";

const categoryValues = ["group", "private", "annual", "workshop", "training", "enterprise", "package", "assessment", "misc"];
const methodValues = ["cash", "pos", "company_qr", "alipay", "wechat", "ar", "ent", "youzan", "dianping", "voucher", "stored_card"];
const paymentCopy: Record<string, [string, string]> = { cash: ["现金", "Cash"], pos: ["POS 通", "POS"], company_qr: ["公司二维码", "Company QR code"], alipay: ["支付宝", "Alipay"], wechat: ["微信", "WeChat Pay"], ar: ["AR account", "AR account"], ent: ["ENT", "ENT"], youzan: ["有赞", "Youzan"], dianping: ["大众点评", "Dianping"], voucher: ["券", "Voucher"], stored_card: ["储值卡", "Stored-value card"] };

export function FinancePage() {
  const { admin: a, local, language } = useLanguage();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [entryCategory, setEntryCategory] = useState("group");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const paymentLabel = (value: string) => local(paymentCopy[value]?.[0] ?? value, paymentCopy[value]?.[1]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const params = new URLSearchParams({ date_from: from, date_to: to }); if (category) params.set("category", category); const result = await apiFetch<{ items: Transaction[]; total_amount: number }>(`/api/admin/transactions?${params}`); setRows(result.items); setTotal(result.total_amount); }
    catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setLoading(false); }
  }, [from, to, category]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void apiFetch<{ items: Member[] }>("/api/admin/members").then((result) => setMembers(result.items)); }, []);

  async function manual(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiFetch("/api/admin/transactions/manual", { method: "POST", json: { member_id: memberId ? Number(memberId) : null, category: entryCategory, amount, payment_method: method, note } }); setMessage(a("手动入账已保存")); setManualOpen(false); setAmount(0); setNote(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "入账失败"); }
    finally { setBusy(false); }
  }
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await apiFetch<{ card_id: number }>("/api/admin/orders/redeem", { method: "POST", json: { redemption_code: code } }); setMessage(local(`电子码核销成功，会员卡 #${result.card_id} 已开通并入账`, `Code redeemed. Membership card #${result.card_id} is active and the payment is posted.`)); setRedeemOpen(false); setCode(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "核销失败"); }
    finally { setBusy(false); }
  }
  async function refund(row: Transaction) {
    const reason = window.prompt(local(`退款 ${money(row.amount)}，请填写退款原因：`, `Refund ${money(row.amount)}. Enter a reason:`), a("会员申请退款")); if (!reason) return;
    try { await apiFetch(`/api/admin/transactions/${row.id}/refund`, { method: "POST", json: { amount: row.amount, note: reason } }); setMessage(a("退款已入账，关联整卡已销卡")); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "退款失败"); }
  }

  return <div><PageHeader eyebrow="FINANCE LEDGER" title={a("财务入账")} description={a("购卡、手动入账、电子码核销与退款，所有流水保留支付方式和操作记录。")} actions={<><button className="button button-outline" type="button" onClick={() => setRedeemOpen(true)}>{a("电子码核销")}</button><button className="button button-primary" type="button" onClick={() => setManualOpen(true)}><Icon name="plus" size={18}/>{a("手动入账")}</button></>}/><section className="finance-total"><div><span>{a("筛选范围净收入")}</span><strong>{money(total)}</strong><p>{a("含退款负数流水")} · {rows.length} {a("笔")}</p></div><div><span>{a("购买入账")}</span><strong>{money(rows.filter((row) => row.kind === "purchase" && row.amount > 0).reduce((sum, row) => sum + row.amount, 0))}</strong></div><div><span>{a("退款支出")}</span><strong>{money(Math.abs(rows.filter((row) => row.kind === "refund").reduce((sum, row) => sum + row.amount, 0)))}</strong></div></section><section className="filter-panel"><Field label={a("开始日期")}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label={a("结束日期")}><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><Field label={a("入账类别")}><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{a("全部类别")}</option>{categoryValues.map((value) => <option key={value} value={value}>{a(value)}</option>)}</select></Field><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/transactions.csv", "transactions.csv")}><Icon name="download" size={17}/>{a("导出流水")}</button></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{a("流水号 / 时间")}</th><th>{a("会员")}</th><th>{a("类别")}</th><th>{a("摘要")}</th><th>{a("支付方式")}</th><th>{a("状态")}</th><th>{a("金额")}</th><th>{a("操作")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>#{row.id}<small>{row.occurred_at}</small></td><td>{row.member_name || a("非会员")}</td><td>{a(row.category)}<small>{a(row.kind)}</small></td><td>{transactionNote(row, language)}{row.redemption_code && <small>{a("电子码")} {row.redemption_code}</small>}</td><td>{paymentLabel(row.payment_method)}</td><td><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : "neutral"}>{row.status === "paid" ? a("已入账") : row.status === "pending" ? a("待核销") : a("已退款")}</Badge></td><td className={row.amount < 0 ? "negative-amount" : "amount-cell"}>{money(row.amount)}</td><td>{row.status === "paid" && row.amount > 0 && <button className="text-button danger" type="button" onClick={() => void refund(row)}>{a("退款")}</button>}</td></tr>)}</tbody></table></ResponsiveTable>{rows.length === 0 && <Empty>{a("该时间段暂无流水")}</Empty>}</section>}
    {manualOpen && <Modal title={a("手动入账")} onClose={() => setManualOpen(false)}><form className="form-grid" onSubmit={manual}><Field label={a("关联会员（可选）")}><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">{a("非会员 / 不关联")}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>)}</select></Field><div className="form-grid two-columns"><Field label={a("入账类别")}><select value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>{categoryValues.map((value) => <option key={value} value={value}>{a(value)}</option>)}</select></Field><Field label={a("金额")}><input required type="number" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/></Field></div><Field label={a("结账方式")}><select value={method} onChange={(event) => setMethod(event.target.value)}>{methodValues.map((value) => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select></Field><Field label={a("备注")}><textarea required rows={3} value={note} onChange={(event) => setNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{a("确认入账")}</button></form></Modal>}
    {redeemOpen && <Modal title={a("线上购卡电子码核销")} onClose={() => setRedeemOpen(false)}><form className="form-grid" onSubmit={redeem}><p className="form-help">{a("核销后系统会按原申请产品开通会员卡，并将待核销流水转为已入账。")}</p><Field label={a("电子码")}><input required autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="YY260101123456"/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{a("确认到店支付并核销")}</button></form></Modal>}
  </div>;
}
