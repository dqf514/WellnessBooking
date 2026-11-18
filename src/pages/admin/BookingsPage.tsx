import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { StaffCheckInPanel } from "@/components/CheckInPanels";
import { DynamicQrCode } from "@/components/QrCode";
import { MemberPicker } from "@/components/MemberPicker";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Empty, Icon, Modal, ResponsiveTable, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { endTimeFor, formatDateTime, money, timeToMinutes, today } from "@/lib/date";
import { paymentLabel, paymentMethods } from "@/lib/financeCopy";
import { useCan } from "@/lib/permissions";
import type { Booking, Member, Meta, Session } from "@/types";

const statusTones: Record<string, "neutral" | "green" | "red" | "amber" | "blue"> = { booked: "amber", checked_in: "green", completed: "green", cancelled: "neutral", no_show: "red" };

function endFor(start: string, duration: number) {
  return endTimeFor(start, duration);
}

export function BookingsPage() {
  const { type: routeType } = useParams();
  const type = ["group", "private", "workshop"].includes(routeType ?? "") ? routeType! : "group";
  const { local } = useLanguage();
  const statusLabels: Record<string, string> = { booked: local("待签到", "Upcoming"), checked_in: local("已签到并消课", "Checked in"), completed: local("已签到并消课", "Checked in"), cancelled: local("已取消", "Cancelled"), no_show: local("爽约", "No show") };
  const canWrite = useCan("bookings.write");
  const [date, setDate] = useState(today());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<Session | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sessionCodeOpen, setSessionCodeOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [notes, setNotes] = useState("");
  const [privateForm, setPrivateForm] = useState({ course_id: "", teacher_id: "", room_id: "", member_id: "", session_date: today(), start_time: "09:00", end_time: "10:00", notes: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reminderAlerts, setReminderAlerts] = useState<string[]>([]);
  const [noShows, setNoShows] = useState<Booking[]>([]);
  const [tab, setTab] = useState<"sessions" | "noshow">("sessions");
  const [revenueBooking, setRevenueBooking] = useState<Booking | null>(null);
  const [revenueAmount, setRevenueAmount] = useState("");
  const [revenueMethod, setRevenueMethod] = useState("fitness_member");
  const [revenueNote, setRevenueNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ booking: Booking; actionName: string } | null>(null);
  const latestRequest = useRef(0);
  const typeLabel = type === "group" ? local("团课", "Group class") : type === "private" ? local("私教/评估", "PT / Assessment") : local("工作坊", "Workshop");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const requestId = ++latestRequest.current;
    try {
      const query = new URLSearchParams({ date_from: date, date_to: date, detailed: "true", course_type: type === "private" ? "private,assessment" : type });
      const [sessionResult, memberResult, noShowResult] = await Promise.all([
        apiFetch<{ items: Session[] }>(`/api/admin/sessions?${query}`),
        apiFetch<{ items: Member[] }>("/api/admin/members?active_only=true"),
        apiFetch<{ items: Booking[] }>("/api/admin/no-shows"),
      ]);
      if (requestId !== latestRequest.current) return;
      setSessions(sessionResult.items); setMembers(memberResult.items); setNoShows(noShowResult.items);
      setSelected((current) => current ? sessionResult.items.find((item) => item.id === current.id) ?? null : null);
    } catch (err) { if (requestId === latestRequest.current) setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [date, type]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void apiFetch<Meta>("/api/admin/meta").then(setMeta).catch((err) => setError(err.message)); }, []);
  useEffect(() => { setSelected(null); setTab("sessions"); }, [type]);

  function openRevenue(booking: Booking) {
    setRevenueBooking(booking);
    setRevenueAmount(booking.consumption_amount ? String(booking.consumption_amount) : "");
    setRevenueMethod("fitness_member");
    setRevenueNote(selected ? `${local(selected.course.name, selected.course.name_en)} · ${selected.session_date} ${local("消课营收", "consumption revenue")}` : "");
    setError("");
  }
  async function postRevenue(event: FormEvent) {
    event.preventDefault(); if (!revenueBooking) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/bookings/${revenueBooking.id}/revenue`, { method: "POST", json: { amount: Number(revenueAmount), payment_method: revenueMethod, note: revenueNote } });
      setMessage(local(`${revenueBooking.member.name} 的消课营收 ${money(Number(revenueAmount))} 已入账`, `Consumption revenue of ${money(Number(revenueAmount))} posted for ${revenueBooking.member.name}.`));
      setRevenueBooking(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("营收入账失败", "Revenue entry failed")); }
    finally { setBusy(false); }
  }
  async function action(booking: Booking, actionName: string) {
    setBusy(true); setError(""); setMessage("");
    const actionText = actionName === "check_in" ? local("签到消课成功", "checked in and consumed") : actionName === "undo_check_in" ? local("已取消签到并返还权益，相关营收已冲销", "check-in undone; entitlement and revenue reversed") : actionName === "no_show" ? local("已标记爽约", "marked as no-show") : local("预约已取消", "booking cancelled");
    try {
      const result = await apiFetch<Booking & { member_reminders?: string[] }>(`/api/admin/bookings/${booking.id}/${actionName}`, { method: "POST" });
      setMessage(`${booking.member.name}: ${actionText}`);
      if (result.member_reminders?.length) setReminderAlerts(result.member_reminders);
      if (actionName === "check_in" && type === "private") openRevenue(result);
      setSelected(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("操作失败", "Action failed")); }
    finally { setBusy(false); }
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault(); if (!selected || !memberId) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/sessions/${selected.id}/bookings`, { method: "POST", json: { member_id: Number(memberId), notes } });
      setMessage(local("预约已创建，短信发送结果可在日志中查看", "Booking created. Check the logs for SMS delivery results.")); setBookingOpen(false); setMemberId(""); setNotes(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("预约失败", "Booking failed")); }
    finally { setBusy(false); }
  }

  function openPrivate() {
    if (!meta) return;
    const course = meta.courses.find((item) => item.course_type === "private" && item.active) ?? meta.courses.find((item) => item.course_type === "assessment" && item.active);
    setPrivateForm({ course_id: String(course?.id ?? ""), teacher_id: String(meta.teachers.find((item) => item.active)?.id ?? ""), room_id: String(meta.rooms.find((item) => item.active)?.id ?? ""), member_id: "", session_date: date, start_time: "09:00", end_time: course ? endFor("09:00", course.duration_minutes) : "10:00", notes: "" });
    setPrivateOpen(true);
  }
  function updatePrivate(key: keyof typeof privateForm, value: string) {
    setPrivateForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "course_id" || key === "start_time") {
        const course = meta?.courses.find((item) => item.id === Number(next.course_id));
        if (course) next.end_time = endFor(next.start_time, course.duration_minutes);
      }
      return next;
    });
  }
  async function createPrivate(event: FormEvent) {
    event.preventDefault(); if (!privateForm.member_id) { setError(local("请选择会员", "Select a member")); return; }
    if (!privateForm.end_time || timeToMinutes(privateForm.end_time) <= timeToMinutes(privateForm.start_time)) { setError(local("结束时间必须晚于开始时间；课程不能跨天，请调整开始时间。", "End time must be later than start time. Classes cannot run past midnight.")); return; }
    setBusy(true); setError("");
    try {
      await apiFetch("/api/admin/private-bookings", { method: "POST", json: Object.fromEntries(Object.entries(privateForm).map(([key, value]) => [[key], ["course_id", "teacher_id", "room_id", "member_id"].includes(key) ? Number(value) : value])) });
      setMessage(local("私教排课与会员预约已一次完成", "Personal training scheduled and booked in one step")); setPrivateOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("预约失败", "Booking failed")); }
    finally { setBusy(false); }
  }
  async function clearPenalty(memberIdValue: number) {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/members/${memberIdValue}/clear-no-show`, { method: "POST" });
      setMessage(local("已解除该会员的爽约限制", "The member's booking block has been removed")); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("解除限制失败", "Failed to remove the block")); }
    finally { setBusy(false); }
  }

  const confirmCopy: Record<string, { title: string; description: string; confirmLabel: string }> = {
    cancel: { title: local("取消这条预约？", "Cancel this booking?"), description: local("取消后会员会收到通知短信，占用的名额会释放，对应卡权益会返还。此操作不会自动撤销，需要时可重新预约。", "The member will be notified by SMS, the seat is released and the card entitlement is returned."), confirmLabel: local("确认取消", "Cancel booking") },
    no_show: { title: local("标记为爽约？", "Mark as no-show?"), description: local("标记爽约会限制该会员后续预约，直到手动解除限制。此操作会影响会员权益，请确认确实未到店。", "Marking a no-show blocks the member from booking again until the block is removed manually."), confirmLabel: local("确认爽约", "Mark no-show") },
    undo_check_in: { title: local("取消签到？", "Undo check-in?"), description: local("取消签到会返还本次核销的卡权益、冲销已入账的营收，并重新释放名额。", "Undoing the check-in returns the consumed entitlement, reverses any revenue already posted and frees the seat again."), confirmLabel: local("确认取消签到", "Undo check-in") },
  };

  return <div>
    <PageHeader eyebrow="FRONT DESK" title={local(`${typeLabel}预约与签到`, `${typeLabel} bookings`)} description={local("扫码或手动签到均同步扣减卡权益；取消签到会返还对应权益。", "QR and manual check-in both deduct card benefits; undoing check-in restores them.")} actions={canWrite ? <><button className="button button-primary" type="button" onClick={() => setScannerOpen(true)}><Icon name="scan" size={18}/>{local("扫码签到", "Scan check-in")}</button>{type === "private" && <button className="button button-outline" type="button" onClick={openPrivate}><Icon name="plus" size={18}/>{local("预约私教", "Book personal training")}</button>}</> : undefined}/>
    <div className="sub-tabs"><button className={tab === "sessions" ? "active" : ""} type="button" onClick={() => setTab("sessions")}>{local("课程预约", "Class bookings")}</button><button className={tab === "noshow" ? "active" : ""} type="button" onClick={() => setTab("noshow")}>{local("爽约记录", "No-shows")} <Badge tone="red">{noShows.length}</Badge></button></div>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {tab === "noshow" ? <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("会员", "Member")}</th><th>{local("课程", "Class")}</th><th>{local("上课时间", "Class time")}</th><th>{local("限制预约至", "Blocked until")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{noShows.map((booking) => <tr key={booking.id}><td>{booking.member.name}<small>{booking.member.phone}</small></td><td>{local(booking.session?.course.name ?? "", booking.session?.course.name_en)}</td><td>{booking.session?.session_date} {booking.session?.start_time}</td><td>{booking.member.no_show_blocked_until || "—"}</td><td>{canWrite && <button className="text-button" disabled={!booking.member.no_show_blocked_until} onClick={() => void clearPenalty(booking.member_id)} type="button">{local("解除限制", "Remove block")}</button>}</td></tr>)}</tbody></table></ResponsiveTable>{noShows.length === 0 && <Empty>{local("暂无爽约记录", "No no-shows")}</Empty>}</section> : <>
      <section className="filter-panel"><Field label={local("上课日期", "Class date")}><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></Field><button className="button button-outline" type="button" onClick={() => setDate(today())}>{local("回到今天", "Today")}</button><span className="filter-summary">{local(`共 ${sessions.length} 节 · ${sessions.reduce((sum, item) => sum + item.booked_count, 0)} 人次预约`, `${sessions.length} classes · ${sessions.reduce((sum, item) => sum + item.booked_count, 0)} bookings`)}</span></section>
      {loading ? <Spinner/> : <section className="panel table-panel"><ResponsiveTable><table className="data-table"><thead><tr><th>{local("课程名称", "Class")}</th><th>{local("开课时间", "Time")}</th><th>{local("课程教练", "Instructor")}</th><th>{local("教室", "Room")}</th><th>{local("可约人数", "Available")}</th><th>{local("已预约", "Booked")}</th><th>{local("状态", "Status")}</th><th>{local("操作", "Actions")}</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} className={session.status === "cancelled" ? "row-muted" : ""}><td><div className="course-cell"><span style={{ background: session.course.color }}/><strong>{local(session.course.name, session.course.name_en)}</strong></div><small>{typeLabel}</small></td><td><strong>{session.start_time}–{session.end_time}</strong><small>{session.session_date}</small></td><td>{local(session.teacher.name, session.teacher.name_en)}</td><td>{local(session.room.name, session.room.name_en)}<small>{session.room.floor}</small></td><td><button className="capacity-link" type="button" aria-label={local(`${session.available} 个名额，查看预约名单`, `${session.available} places available, open roster`)} onClick={() => setSelected(session)}>{session.available}</button></td><td>{session.booked_count}</td><td><Badge tone={session.status === "scheduled" ? "green" : "neutral"}>{session.status === "scheduled" ? local("正常", "Scheduled") : local("已取消", "Cancelled")}</Badge></td><td><button className="text-button" type="button" onClick={() => setSelected(session)}>{local("预约名单", "Roster")} <Icon name="chevron" size={14}/></button></td></tr>)}</tbody></table></ResponsiveTable>{sessions.length === 0 && <Empty>{type === "private" ? local("该日期暂无私教，点击右上角“预约私教”一步完成排课和预约。", "No PT sessions. Use Book personal training to schedule and book in one step.") : local("该日期暂无课程", "No classes on this date")}</Empty>}</section>}
    </>}
    {selected && <Modal wide title={`${local(selected.course.name, selected.course.name_en)} · ${local("预约名单", "Roster")}`} onClose={() => setSelected(null)}><div className="roster-summary"><div><span>{local("上课时间", "Class time")}</span><strong>{selected.session_date} {selected.start_time}–{selected.end_time}</strong></div><div><span>{local("教练 / 教室", "Instructor / room")}</span><strong>{local(selected.teacher.name, selected.teacher.name_en)} / {local(selected.room.name, selected.room.name_en)}</strong></div><div><span>{local("名额", "Capacity")}</span><strong>{selected.booked_count} / {selected.capacity}</strong></div>{canWrite && selected.status === "scheduled" && <><button className="button button-outline" type="button" onClick={() => setSessionCodeOpen(true)}><Icon name="qr" size={17}/>{local("课程签到码", "Class QR code")}</button><button className="button button-primary" type="button" onClick={() => setBookingOpen(true)}><Icon name="plus" size={17}/>{local("添加预约", "Add booking")}</button></>}</div><ResponsiveTable><table className="data-table roster-table"><thead><tr><th>{local("会员", "Member")}</th><th>{local("会员卡 / 券", "Card / voucher")}</th><th>{local("预约时间", "Booked at")}</th><th>{local("取消信息", "Cancellation")}</th><th>{local("状态", "Status")}</th><th>{local("签到 / 操作", "Check-in / actions")}</th></tr></thead><tbody>{selected.bookings?.map((booking) => <tr key={booking.id} className={booking.status === "cancelled" ? "row-muted" : ""}><td><div className="member-cell"><span className="user-avatar">{booking.member.name.slice(0, 1)}</span><div><strong>{booking.member.name}</strong><small>{booking.member.phone}</small></div></div></td><td>{local(booking.card_name, booking.member.cards?.find((card) => card.id === booking.member_card_id)?.product_name_en) || local("签到时匹配", "Matched at check-in")}</td><td>{formatDateTime(booking.booked_at)}<small>{booking.source === "public" ? local("会员自主", "Self-service") : local("后台录入", "Staff entry")}</small></td><td>{booking.cancelled_at ? <>{formatDateTime(booking.cancelled_at)}<small>{booking.cancelled_by}</small></> : "—"}</td><td><Badge tone={statusTones[booking.status]}>{statusLabels[booking.status]}</Badge></td><td><div className="table-actions">{canWrite && booking.status === "booked" && <><button className="button button-small" type="button" disabled={busy} onClick={() => void action(booking, "check_in")}>{local("签到消课", "Check in & consume")}</button><button className="text-button danger" type="button" disabled={busy} onClick={() => setConfirmAction({ booking, actionName: "cancel" })}>{local("取消", "Cancel")}</button><button className="text-button danger" type="button" disabled={busy} onClick={() => setConfirmAction({ booking, actionName: "no_show" })}>{local("爽约", "No-show")}</button></>}{canWrite && ["checked_in", "completed"].includes(booking.status) && <>{type === "private" && <button className="button button-small button-outline" type="button" disabled={busy} onClick={() => openRevenue(booking)}>{local("营收入账", "Post revenue")}</button>}<button className="text-button" type="button" disabled={busy} onClick={() => setConfirmAction({ booking, actionName: "undo_check_in" })}>{local("取消签到", "Undo check-in")}</button></>}{canWrite && booking.status === "cancelled" && <RecycleDeleteButton resource="bookings" id={booking.id} label={`${booking.member.name} · ${selected.course.name}`} onDeleted={load}/>}</div></td></tr>)}</tbody></table></ResponsiveTable>{selected.bookings?.length === 0 && <Empty>{local("还没有会员预约，点击“添加预约”开始。", "No bookings yet. Add a booking to get started.")}</Empty>}</Modal>}
    {bookingOpen && selected && <Modal title={local(`为 ${selected.course.name} 添加预约`, `Add booking for ${selected.course.name_en || selected.course.name}`)} onClose={() => setBookingOpen(false)}><form className="form-grid" onSubmit={createBooking}><Field label={local("选择会员", "Member")}><MemberPicker members={members} value={memberId} onChange={setMemberId} required/></Field><Field label={local("预约备注", "Booking notes")} hint={local("签到时自动匹配有效会员卡、共享卡或体验券。", "A valid card, shared card or voucher is matched at check-in.")}><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy || !memberId} type="submit">{busy ? local("预约中…", "Booking…") : local("确认预约", "Confirm booking")}</button></form></Modal>}
    {privateOpen && meta && <Modal wide title={local("一步预约私教", "Book personal training")} onClose={() => setPrivateOpen(false)}><form className="form-grid two-columns" onSubmit={createPrivate}><p className="form-help span-two">{local("选择服务、日期、时间、老师、教室和会员，保存后自动完成排课与预约。", "Select the service, date, time, instructor, room and member. Scheduling and booking are completed together.")}</p><Field label={local("私教服务", "Service")}><select required value={privateForm.course_id} onChange={(event) => updatePrivate("course_id", event.target.value)}>{meta.courses.filter((item) => item.active && ["private", "assessment"].includes(item.course_type)).map((course) => <option key={course.id} value={course.id}>{local(course.name, course.name_en)}</option>)}</select></Field><Field label={local("会员", "Member")}><MemberPicker members={members} value={privateForm.member_id} onChange={(value) => updatePrivate("member_id", value)} required/></Field><Field label={local("日期", "Date")}><input required type="date" value={privateForm.session_date} onChange={(event) => updatePrivate("session_date", event.target.value)}/></Field><Field label={local("教练", "Instructor")}><select required value={privateForm.teacher_id} onChange={(event) => updatePrivate("teacher_id", event.target.value)}>{meta.teachers.filter((item) => item.active).map((teacher) => <option key={teacher.id} value={teacher.id}>{local(teacher.name, teacher.name_en)}</option>)}</select></Field><Field label={local("开始时间", "Start time")}><input required type="time" step={900} value={privateForm.start_time} onChange={(event) => updatePrivate("start_time", event.target.value)}/></Field><Field label={local("结束时间", "End time")}><input required type="time" step={900} value={privateForm.end_time} onChange={(event) => updatePrivate("end_time", event.target.value)}/></Field><Field label={local("教室", "Room")}><select required value={privateForm.room_id} onChange={(event) => updatePrivate("room_id", event.target.value)}>{meta.rooms.filter((item) => item.active).map((room) => <option key={room.id} value={room.id}>{local(room.name, room.name_en)} · {room.floor}</option>)}</select></Field><Field label={local("备注", "Notes")}><input value={privateForm.notes} onChange={(event) => updatePrivate("notes", event.target.value)}/></Field><button className="button button-primary button-full span-two" disabled={busy || !privateForm.member_id} type="submit">{busy ? local("预约中…", "Booking…") : local("确认排课并预约", "Schedule & book")}</button></form></Modal>}
    {scannerOpen && <Modal title={local("扫码签到消课", "QR check-in")} onClose={() => setScannerOpen(false)}><StaffCheckInPanel onChecked={load}/></Modal>}
    {sessionCodeOpen && selected && <Modal title={local(`${selected.course.name} · 课程签到码`, `${selected.course.name_en || selected.course.name} · Class check-in code`)} onClose={() => setSessionCodeOpen(false)}><DynamicQrCode endpoint={`/api/admin/sessions/${selected.id}/check-in-code`} tokenKind="staff" title={local("会员扫此码自助签到", "Members scan to check in")} description={local(`${selected.session_date} ${selected.start_time}–${selected.end_time} · 开课前 30 分钟至课程结束有效。`, `${selected.session_date} ${selected.start_time}–${selected.end_time} · Available from 30 minutes before class until it ends.`)}/></Modal>}
    {revenueBooking && <Modal title={local("私教 / 评估消课营收入账", "Post consumption revenue")} onClose={() => setRevenueBooking(null)}><form className="form-grid" onSubmit={postRevenue}>{error && <Notice error message={error}/>}<div className="revenue-booking-summary"><span className="user-avatar">{revenueBooking.member.name.slice(0, 1)}</span><div><strong>{revenueBooking.member.name}</strong><small>{local("本次仅入营收，不重复计入现金流水", "Revenue only; cash ledger is not affected")}</small></div></div><Field label={local("营收金额", "Revenue amount")} hint={local("默认按购卡金额÷总次数计算，可根据财务口径调整", "Defaults to card price divided by sessions; editable")}><input required min={0.01} step={0.01} type="number" value={revenueAmount} onChange={(event) => setRevenueAmount(event.target.value)}/></Field><Field label={local("结账方式", "Payment method")}><select value={revenueMethod} onChange={(event) => setRevenueMethod(event.target.value)}>{paymentMethods.map((value) => <option key={value} value={value}>{paymentLabel(value, local)}</option>)}</select></Field><Field label={local("备注", "Notes")}><textarea rows={3} value={revenueNote} onChange={(event) => setRevenueNote(event.target.value)}/></Field><p className="form-help">{local("重复入账会被系统拦截；取消签到时将自动冲销本次营收。", "Duplicate entries are blocked. Undoing check-in reverses this revenue automatically.")}</p><button className="button button-primary button-full" disabled={busy || !revenueAmount || Number(revenueAmount) <= 0} type="submit">{local("确认入营收", "Confirm revenue")}</button><button className="button button-outline button-full" type="button" onClick={() => setRevenueBooking(null)}>{local("暂不入账", "Not now")}</button></form></Modal>}
    {reminderAlerts.length > 0 && <Modal title={local("会员到店提醒", "Member arrival reminders")} onClose={() => setReminderAlerts([])}><div className="member-reminder-alert"><Icon name="bell" size={25}/>{reminderAlerts.map((alert) => <p key={alert}>{alert}</p>)}</div><button className="button button-primary button-full" type="button" onClick={() => setReminderAlerts([])}>{local("已知晓", "Acknowledge")}</button></Modal>}
    {confirmAction && <Modal title={confirmCopy[confirmAction.actionName].title} onClose={() => setConfirmAction(null)}><div className="logout-confirmation"><p>{confirmCopy[confirmAction.actionName].description}</p><p className="form-help">{confirmAction.booking.member.name} · {local(confirmAction.booking.session?.course.name ?? "", confirmAction.booking.session?.course.name_en)} {confirmAction.booking.session?.session_date} {confirmAction.booking.session?.start_time}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={() => setConfirmAction(null)}>{local("返回", "Back")}</button><button className="button button-danger-ghost" type="button" disabled={busy} onClick={() => { const target = confirmAction; setConfirmAction(null); void action(target.booking, target.actionName); }}>{confirmCopy[confirmAction.actionName].confirmLabel}</button></div></div></Modal>}
  </div>;
}
