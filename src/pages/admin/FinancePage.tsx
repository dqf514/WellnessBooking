import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, Spinner } from "@/components/UI";
import { apiFetch, downloadFile } from "@/lib/api";
import { money, today } from "@/lib/date";
import type { Member, Transaction } from "@/types";

const categories: Array<[string, string]> = [["group", "团课"], ["private", "私教"], ["annual", "年卡分摊"], ["workshop", "工作坊"], ["training", "培训课"], ["enterprise", "企业课"], ["package", "套餐"], ["assessment", "评估"], ["misc", "杂项"]];
const methods: Array<[string, string]> = [["cash", "现金"], ["pos", "POS 通"], ["company_qr", "公司二维码"], ["alipay", "支付宝"], ["wechat", "微信"], ["ar", "AR account"], ["ent", "ENT"], ["youzan", "有赞"], ["dianping", "大众点评"], ["voucher", "券"], ["stored_card", "储值卡"]];

export function FinancePage() {
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
    try { await apiFetch("/api/admin/transactions/manual", { method: "POST", json: { member_id: memberId ? Number(memberId) : null, category: entryCategory, amount, payment_method: method, note } }); setMessage("手动入账已保存"); setManualOpen(false); setAmount(0); setNote(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "入账失败"); }
    finally { setBusy(false); }
  }
  async function redeem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await apiFetch<{ card_id: number }>("/api/admin/orders/redeem", { method: "POST", json: { redemption_code: code } }); setMessage(`电子码核销成功，会员卡 #${result.card_id} 已开通并入账`); setRedeemOpen(false); setCode(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "核销失败"); }
    finally { setBusy(false); }
  }
  async function refund(row: Transaction) {
    const reason = window.prompt(`退款 ${money(row.amount)}，请填写退款原因：`, "会员申请退款"); if (!reason) return;
    try { await apiFetch(`/api/admin/transactions/${row.id}/refund`, { method: "POST", json: { amount: row.amount, note: reason } }); setMessage("退款已入账，关联整卡已销卡"); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "退款失败"); }
  }

  return <div><PageHeader eyebrow="FINANCE LEDGER" title="财务入账" description="购卡、手动入账、电子码核销与退款，所有流水保留支付方式和操作记录。" actions={<><button className="button button-outline" type="button" onClick={() => setRedeemOpen(true)}>电子码核销</button><button className="button button-primary" type="button" onClick={() => setManualOpen(true)}><Icon name="plus" size={18}/>手动入账</button></>}/><section className="finance-total"><div><span>筛选范围净收入</span><strong>{money(total)}</strong><p>含退款负数流水 · {rows.length} 笔</p></div><div><span>购买入账</span><strong>{money(rows.filter((row) => row.kind === "purchase" && row.amount > 0).reduce((sum, row) => sum + row.amount, 0))}</strong></div><div><span>退款支出</span><strong>{money(Math.abs(rows.filter((row) => row.kind === "refund").reduce((sum, row) => sum + row.amount, 0)))}</strong></div></section><section className="filter-panel"><Field label="开始日期"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label="结束日期"><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><Field label="入账类别"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部类别</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><button className="button button-outline" type="button" onClick={() => void downloadFile("/api/admin/maintenance/export/transactions.csv", "transactions.csv")}><Icon name="download" size={17}/>导出流水</button></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {loading ? <Spinner/> : <section className="panel table-panel"><div className="responsive-table"><table className="data-table"><thead><tr><th>流水号 / 时间</th><th>会员</th><th>类别</th><th>摘要</th><th>支付方式</th><th>状态</th><th>金额</th><th>操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>#{row.id}<small>{row.occurred_at}</small></td><td>{row.member_name || "非会员"}</td><td>{categories.find(([value]) => value === row.category)?.[1] ?? row.category}<small>{row.kind}</small></td><td>{row.note}{row.redemption_code && <small>电子码 {row.redemption_code}</small>}</td><td>{methods.find(([value]) => value === row.payment_method)?.[1] ?? row.payment_method}</td><td><Badge tone={row.status === "paid" ? "green" : row.status === "pending" ? "amber" : "neutral"}>{row.status === "paid" ? "已入账" : row.status === "pending" ? "待核销" : "已退款"}</Badge></td><td className={row.amount < 0 ? "negative-amount" : "amount-cell"}>{money(row.amount)}</td><td>{row.status === "paid" && row.amount > 0 && <button className="text-button danger" type="button" onClick={() => void refund(row)}>退款</button>}</td></tr>)}</tbody></table></div>{rows.length === 0 && <Empty>该时间段暂无流水</Empty>}</section>}
    {manualOpen && <Modal title="手动入账" onClose={() => setManualOpen(false)}><form className="form-grid" onSubmit={manual}><Field label="关联会员（可选）"><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">非会员 / 不关联</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>)}</select></Field><div className="form-grid two-columns"><Field label="入账类别"><select value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="金额"><input required type="number" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))}/></Field></div><Field label="结账方式"><select value={method} onChange={(event) => setMethod(event.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="备注"><textarea required rows={3} value={note} onChange={(event) => setNote(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">确认入账</button></form></Modal>}
    {redeemOpen && <Modal title="线上购卡电子码核销" onClose={() => setRedeemOpen(false)}><form className="form-grid" onSubmit={redeem}><p className="form-help">核销后系统会按原申请产品开通会员卡，并将待核销流水转为已入账。</p><Field label="电子码"><input required autoFocus value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="YY260101123456"/></Field><button className="button button-primary button-full" disabled={busy} type="submit">确认到店支付并核销</button></form></Modal>}
  </div>;
}
