import { useCallback, useEffect, useState } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Empty, Icon, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { money, today } from "@/lib/date";
import { categoryLabel, paymentLabel, paymentMethods } from "@/lib/financeCopy";

interface ReportData {
  summary: { revenue: number; cash_received: number; sessions: number; cancelled_sessions: number; attendees: number; booking_count: number; cancelled_bookings: number };
  amortized_revenue: number;
  private_recognized_revenue: number;
  revenue_by_category: Array<{ label: string; value: number }>;
  cash_by_category: Array<{ label: string; value: number }>;
  course_stats: Array<{ label: string; label_en?: string; sessions: number; cancelled: number; attendees: number; bookings: number }>;
  teacher_stats: Array<{ label: string; label_en?: string; sessions: number; minutes: number; attendees: number; cancelled: number; hours: number }>;
  weekday: Array<{ label: number; value: number }>;
  hour: Array<{ label: string; value: number }>;
  room_usage: Array<{ room_id: number; room_name: string; room_name_en?: string; used_hours: number; internal_hours: number; utilization: number }>;
}
interface ReportColumn { key: string; label: string; kind: "dimension" | "metric"; format?: string }
interface ReportTable { dataset: string; dataset_name: string; columns: ReportColumn[]; rows: Array<Record<string, number | string>>; totals: Record<string, number>; row_count: number }
interface DatasetDef { key: string; name: string; name_en?: string; description: string; dimensions: Array<{ key: string; label: string }>; metrics: Array<{ key: string; label: string; agg: string; format: string }> }
interface Preset { key: string; name: string; name_en?: string; dataset: string; dimensions: string[]; metrics: string[]; description: string }
interface ReportOptions { datasets: DatasetDef[]; presets: Preset[] }
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const weekdaysEn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatCell(value: number | string, format?: string) {
  if (typeof value === "string") return value;
  if (format === "money") return money(value);
  if (format === "percent") return `${value}%`;
  return String(Math.round(value * 100) / 100);
}

export function ReportsPage() {
  const { admin: a, local, language } = useLanguage();
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState("overview");
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [dataset, setDataset] = useState("transactions");
  const [dimensions, setDimensions] = useState<string[]>(["month", "category"]);
  const [metrics, setMetrics] = useState<string[]>(["cash_amount", "recognized", "orders"]);
  const [payment, setPayment] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch<ReportData>(`/api/admin/reports?date_from=${from}&date_to=${to}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "报表加载失败"); }
    finally { setLoading(false); }
  }, [from, to]);
  const loadOptions = useCallback(async () => {
    try { setOptions(await apiFetch<ReportOptions>("/api/admin/reports/options")); }
    catch (err) { setError(err instanceof Error ? err.message : local("报表类型加载失败", "Failed to load report types")); }
  }, [local]);
  const loadTable = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ dataset, dimensions: dimensions.join(","), metrics: metrics.join(","), date_from: from, date_to: to });
      if (payment) params.set("payment", payment);
      const result = await apiFetch<ReportTable>(`/api/admin/reports/table?${params.toString()}`);
      setTable(result);
      // 服务端会兜底补齐无效维度与指标，这里把实际生效的列同步回勾选状态，保证界面与表格一致。
      const nextDimensions = result.columns.filter((column) => column.kind === "dimension").map((column) => column.key);
      const nextMetrics = result.columns.filter((column) => column.kind === "metric").map((column) => column.key);
      if (nextDimensions.join(",") !== dimensions.join(",")) setDimensions(nextDimensions);
      if (nextMetrics.join(",") !== metrics.join(",")) setMetrics(nextMetrics);
    } catch (err) { setError(err instanceof Error ? err.message : local("报表加载失败", "Report load failed")); }
    finally { setLoading(false); }
  }, [dataset, dimensions, metrics, from, to, payment, local]);
  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(() => { if (tab === "overview") void load(); else void loadTable(); }, [tab, load, loadTable]);
  const maxHour = Math.max(1, ...(data?.hour.map((item) => item.value) ?? [1]));
  const maxWeekday = Math.max(1, ...(data?.weekday.map((item) => item.value) ?? [1]));
  const categories = data ? Array.from(new Set([...data.cash_by_category.map((item) => item.label), ...data.revenue_by_category.map((item) => item.label)])) : [];
  const activePreset = options?.presets.find((item) => item.key === tab);
  const activeDataset = options?.datasets.find((item) => item.key === dataset);
  function selectTab(key: string) {
    setTab(key);
    const preset = options?.presets.find((item) => item.key === key);
    if (preset) { setDataset(preset.dataset); setDimensions(preset.dimensions); setMetrics(preset.metrics); }
  }
  function selectDataset(key: string) {
    setDataset(key);
    const target = options?.datasets.find((item) => item.key === key);
    setDimensions(target ? target.dimensions.slice(0, 2).map((item) => item.key) : []);
    setMetrics(target ? target.metrics.slice(0, 4).map((item) => item.key) : []);
  }
  function toggle(list: string[], key: string, setter: (value: string[]) => void) { setter(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]); }
  async function exportOverview() {
    setError("");
    try { await downloadFile(`/api/admin/reports.xlsx?date_from=${from}&date_to=${to}`, `wellness-overview-${from}-${to}.xlsx`); }
    catch (err) { setError(err instanceof Error ? err.message : local("导出失败", "Export failed")); }
  }
  async function exportTable() {
    setError("");
    const params = new URLSearchParams({ dataset, dimensions: dimensions.join(","), metrics: metrics.join(","), date_from: from, date_to: to });
    if (payment) params.set("payment", payment);
    try { await downloadFile(`/api/admin/reports/table.xlsx?${params.toString()}`, `wellness-report-${dataset}-${from}-${to}.xlsx`); }
    catch (err) { setError(err instanceof Error ? err.message : local("导出失败", "Export failed")); }
  }

  return <div>
    <PageHeader eyebrow="BUSINESS INTELLIGENCE" title={a("报表中心")} description={a("按销售、财务、教学管理、会员经营与总经理视角查看经营数据，维度与指标可自由组合，所有报表都能导出 Excel。")} actions={tab === "overview" ? <button className="button button-primary" type="button" disabled={!data} onClick={() => void exportOverview()}><Icon name="download" size={17}/>{local("导出总览 Excel", "Export overview Excel")}</button> : <button className="button button-primary" type="button" disabled={!table} onClick={() => void exportTable()}><Icon name="download" size={17}/>{local("导出 Excel", "Export Excel")}</button>}/>
    <div className="sub-tabs">{[{ key: "overview", label: local("经营总览", "Overview") }, ...(options?.presets ?? []).map((item) => ({ key: item.key, label: local(item.name, item.name_en) })), { key: "custom", label: local("自定义报表", "Custom report") }].map((item) => <button key={item.key} className={tab === item.key ? "active" : ""} type="button" onClick={() => selectTab(item.key)}>{item.label}</button>)}</div>
    {error && <Notice error message={error}/>}
    {tab === "overview" ? <section className="filter-panel"><Field label={a("开始日期")}><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label={a("结束日期")}><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><button className="button button-outline" type="button" onClick={() => void load()}>{a("查询报表")}</button></section> : <section className="report-builder">
      <div><span>{a("数据源")}</span><select value={dataset} onChange={(event) => selectDataset(event.target.value)}>{(options?.datasets ?? []).map((item) => <option key={item.key} value={item.key}>{local(item.name, item.name_en)}</option>)}</select></div>
      <div><span>{a("分组维度")}</span>{(activeDataset?.dimensions ?? []).map((item) => <button key={item.key} className={dimensions.includes(item.key) ? "picker-chip active" : "picker-chip"} type="button" onClick={() => toggle(dimensions, item.key, setDimensions)}>{item.label}</button>)}</div>
      <div><span>{a("统计指标")}</span>{(activeDataset?.metrics ?? []).map((item) => <button key={item.key} className={metrics.includes(item.key) ? "picker-chip active" : "picker-chip"} type="button" onClick={() => toggle(metrics, item.key, setMetrics)}>{item.label}</button>)}</div>
      {dataset === "transactions" && <div><span>{a("结账方式")}</span><select value={payment} onChange={(event) => setPayment(event.target.value)}><option value="">{local("全部结账方式", "All payment methods")}</option>{paymentMethods.map((value) => <option key={value} value={value}>{paymentLabel(value, local)}</option>)}</select></div>}
      <div><span>{a("统计区间")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/><button className="button button-outline" type="button" onClick={() => void loadTable()}>{a("查询报表")}</button></div>
      <p>{activePreset?.description ?? activeDataset?.description ?? ""}</p>
    </section>}
    {tab === "overview" ? (loading || !data ? <Spinner/> : <>
      <section className="report-summary"><article><span>{a("确认营收", "Recognized revenue")}</span><strong>{money(data.summary.revenue)}</strong><small>{a("每日均摊", "Daily amortization")}: {money(data.amortized_revenue)} · {a("私教/评估", "PT / Assessment")}: {money(data.private_recognized_revenue)}</small></article><article><span>{a("现金实收", "Cash received")}</span><strong>{money(data.summary.cash_received)}</strong><small>{a("仅统计入流水记录，含退款", "Cash-ledger entries only, including refunds")}</small></article><article><span>{a("开课 / 取消")}</span><strong>{data.summary.sessions}<small> / {data.summary.cancelled_sessions} {a("节", "classes")}</small></strong><small>{a("预约人次")} {data.summary.booking_count} · {a("取消")} {data.summary.cancelled_bookings}</small></article><article><span>{a("实际上课人次")}</span><strong>{data.summary.attendees}</strong><small>{a("签到即完成消课", "Check-in completes consumption")}</small></article></section>
      <section className="panel table-panel report-table"><header className="panel-header"><div><span className="eyebrow">FINANCE</span><h2>{local("流水与营收分类汇总", "Cash and revenue by category")}</h2></div></header><ResponsiveTable><table className="data-table"><thead><tr><th>{local("类别", "Category")}</th><th>{local("现金实收（流水）", "Cash received")}</th><th>{local("确认营收", "Recognized revenue")}</th></tr></thead><tbody>{categories.map((category) => <tr key={category}><td><strong>{categoryLabel(category, local)}</strong></td><td>{money(data.cash_by_category.find((item) => item.label === category)?.value ?? 0)}</td><td>{money(data.revenue_by_category.find((item) => item.label === category)?.value ?? 0)}</td></tr>)}</tbody></table></ResponsiveTable>{!categories.length && <Empty>{local("所选时段暂无财务数据", "No financial data in this period")}</Empty>}</section>
      <div className="report-grid"><section className="panel"><header className="panel-header"><div><span className="eyebrow">ATTENDANCE</span><h2>{a("一周与时段分布")}</h2></div></header><div className="chart-block"><h3>{a("星期参与人次")}</h3><div className="bar-chart">{data.weekday.map((item) => <div key={item.label}><span className="bar-value">{item.value}</span><i style={{ height: `${Math.max(3, item.value / maxWeekday * 100)}%` }}/><small>{language === "en" ? weekdaysEn[item.label] : weekdays[item.label]}</small></div>)}</div></div><div className="chart-block"><h3>{a("开课时段参与人次")}</h3><div className="horizontal-bars">{data.hour.filter((item) => item.value > 0).map((item) => <div key={item.label}><span>{item.label}:00</span><i><b style={{ width: `${item.value / maxHour * 100}%` }}/></i><strong>{item.value}</strong></div>)}</div>{data.hour.every((item) => item.value === 0) && <Empty>{a("所选时段暂无签到数据")}</Empty>}</div></section><section className="panel"><header className="panel-header"><div><span className="eyebrow">REVENUE</span><h2>{a("确认营收构成", "Revenue breakdown")}</h2></div></header><div className="revenue-breakdown">{data.revenue_by_category.map((item) => <div key={item.label}><span>{categoryLabel(item.label, local)}</span><strong>{money(item.value)}</strong><small>{data.summary.revenue ? `${Math.round(item.value / data.summary.revenue * 100)}%` : "0%"}</small></div>)}{data.revenue_by_category.length === 0 && <Empty>{a("所选时段暂无收入")}</Empty>}</div><header className="panel-header room-report-title"><div><span className="eyebrow">SPACE</span><h2>{a("教室使用率")}</h2></div></header><div className="room-usage-list">{data.room_usage.map((room) => <div key={room.room_id}><div><strong>{local(room.room_name, room.room_name_en)}</strong><span>{room.used_hours} {a("小时")} · {a("内部")} {room.internal_hours} {a("小时")}</span><b>{room.utilization}%</b></div><i><span style={{ width: `${Math.min(100, room.utilization)}%` }}/></i><small>{a("按每日 07:00–20:00 可用时长估算")}</small></div>)}</div></section></div>
      <section className="panel table-panel report-table"><header className="panel-header"><div><span className="eyebrow">COURSES</span><h2>{a("课程与教练统计")}</h2></div></header><ResponsiveTable><table className="data-table"><thead><tr><th>{a("课程")}</th><th>{a("排课数")}</th><th>{a("取消数")}</th><th>{a("取消率")}</th><th>{a("预约人次")}</th><th>{a("上课人次")}</th><th>{a("参与率")}</th></tr></thead><tbody>{data.course_stats.map((course) => <tr key={course.label}><td><strong>{local(course.label, course.label_en)}</strong></td><td>{course.sessions}</td><td>{course.cancelled}</td><td>{course.sessions ? Math.round(course.cancelled / course.sessions * 100) : 0}%</td><td>{course.bookings}</td><td>{course.attendees}</td><td>{course.bookings ? Math.round(course.attendees / course.bookings * 100) : 0}%</td></tr>)}</tbody></table></ResponsiveTable><ResponsiveTable><table className="data-table"><thead><tr><th>{a("教练")}</th><th>{a("排课数")}</th><th>{a("课时")}</th><th>{a("上课人次")}</th><th>{a("取消数")}</th><th>{a("开课率")}</th></tr></thead><tbody>{data.teacher_stats.map((teacher) => <tr key={teacher.label}><td><strong>{local(teacher.label, teacher.label_en)}</strong></td><td>{teacher.sessions}</td><td>{teacher.hours} {a("小时")}</td><td>{teacher.attendees}</td><td>{teacher.cancelled}</td><td>{teacher.sessions ? Math.round((teacher.sessions - teacher.cancelled) / teacher.sessions * 100) : 0}%</td></tr>)}</tbody></table></ResponsiveTable></section>
    </>) : (loading || !table ? <Spinner/> : <section className="panel table-panel report-table"><header className="panel-header"><div><span className="eyebrow">{table.dataset_name.toUpperCase()}</span><h2>{activePreset ? local(activePreset.name, activePreset.name_en) : table.dataset_name}</h2></div><small>{local(`共 ${table.row_count} 条记录`, `${table.row_count} records`)}</small></header><ResponsiveTable><table className="data-table"><thead><tr>{table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <tr key={index}>{table.columns.map((column) => <td key={column.key}>{column.kind === "metric" ? <strong className="amount-cell">{formatCell(row[column.key] ?? 0, column.format)}</strong> : String(row[column.key] ?? "")}</td>)}</tr>)}</tbody><tfoot><tr>{table.columns.map((column, index) => <td key={column.key}>{column.kind === "dimension" ? (index === 0 ? <strong>{a("合计")}</strong> : "—") : <strong className="amount-cell">{formatCell(table.totals[column.key] ?? 0, column.format)}</strong>}</td>)}</tr></tfoot></table></ResponsiveTable>{!table.rows.length && <Empty>{local("所选条件暂无数据，请调整维度或统计区间", "No data for the current selection")}</Empty>}</section>)}
  </div>;
}
