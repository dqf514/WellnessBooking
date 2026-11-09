import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Empty, Icon, Modal, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { formatDateTime, today } from "@/lib/date";
import type { Booking, Member, Session } from "@/types";

const statusLabels: Record<string, string> = { booked: "待签到", checked_in: "已签到", completed: "已消课", cancelled: "已取消", no_show: "爽约" };
const statusTones: Record<string, "neutral" | "green" | "red" | "amber" | "blue"> = { booked: "amber", checked_in: "green", completed: "blue", cancelled: "neutral", no_show: "red" };

export function BookingsPage() {
  const { user } = useAuth();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [date, setDate] = useState(today());
  const [type, setType] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [noShows, setNoShows] = useState<Booking[]>([]);
  const [tab, setTab] = useState<"sessions" | "noshow">("sessions");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ date_from: date, date_to: date, detailed: "true" });
      if (type) query.set("course_type", type);
      const [sessionResult, memberResult, noShowResult] = await Promise.all([
        apiFetch<{ items: Session[] }>(`/api/admin/sessions?${query}`),
        apiFetch<{ items: Member[] }>("/api/admin/members?active_only=true"),
        apiFetch<{ items: Booking[] }>("/api/admin/no-shows"),
      ]);
      setSessions(sessionResult.items); setMembers(memberResult.items); setNoShows(noShowResult.items);
      if (selected) setSelected(sessionResult.items.find((item) => item.id === selected.id) ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setLoading(false); }
  }, [date, type, selected]);
  useEffect(() => { void load(); }, [date, type]);

  async function action(booking: Booking, actionName: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/${actionName}`, { method: "POST" });
      setMessage(`${booking.member.name}：${actionName === "check_in" ? "签到并扣次成功" : actionName === "undo_check_in" ? "已取消签到并返还次数" : actionName === "complete" ? "已完成消课" : actionName === "no_show" ? "已标记爽约" : "预约已取消"}`);
      setSelected(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/admin/sessions/${selected.id}/bookings`, { method: "POST", json: { member_id: Number(memberId), notes } });
      setMessage("预约已创建，短信发送结果可在日志中查看"); setBookingOpen(false); setMemberId(""); setNotes(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "预约失败"); }
    finally { setBusy(false); }
  }

  async function clearPenalty(memberIdValue: number) {
    await apiFetch(`/api/admin/members/${memberIdValue}/clear-no-show`, { method: "POST" });
    setMessage("已解除该会员的爽约限制"); await load();
  }

  return <div><PageHeader eyebrow="FRONT DESK" title="预约与签到" description="默认显示当天课程；查看预约名单、签到扣次、完成私教消课与处理爽约。" actions={canWrite && selected ? <button className="button button-primary" type="button" onClick={() => setBookingOpen(true)}><Icon name="plus" size={18}/>预约会员</button> : undefined}/><div className="sub-tabs"><button className={tab === "sessions" ? "active" : ""} type="button" onClick={() => setTab("sessions")}>课程预约</button><button className={tab === "noshow" ? "active" : ""} type="button" onClick={() => setTab("noshow")}>爽约记录 <Badge tone="red">{noShows.length}</Badge></button></div>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {tab === "noshow" ? <section className="panel table-panel"><table className="data-table"><thead><tr><th>会员</th><th>课程</th><th>上课时间</th><th>限制预约至</th><th>操作</th></tr></thead><tbody>{noShows.map((booking) => <tr key={booking.id}><td>{booking.member.name}<small>{booking.member.phone}</small></td><td>{booking.session?.course.name}</td><td>{booking.session?.session_date} {booking.session?.start_time}</td><td>{booking.member.no_show_blocked_until || "—"}</td><td>{canWrite && <button className="text-button" disabled={!booking.member.no_show_blocked_until} onClick={() => void clearPenalty(booking.member_id)} type="button">解除限制</button>}</td></tr>)}</tbody></table>{noShows.length === 0 && <Empty>暂无爽约记录</Empty>}</section> : <><section className="filter-panel"><Field label="上课日期"><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></Field><Field label="课程类别"><select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类别</option><option value="group">团课</option><option value="private">私教</option><option value="assessment">评估</option><option value="workshop">工作坊</option><option value="training">培训</option></select></Field><button className="button button-outline" type="button" onClick={() => setDate(today())}>回到今天</button><span className="filter-summary">共 {sessions.length} 节 · {sessions.reduce((sum, item) => sum + item.booked_count, 0)} 人次预约</span></section>{loading ? <Spinner/> : <section className="panel table-panel"><div className="responsive-table"><table className="data-table"><thead><tr><th>课程名称</th><th>开课时间</th><th>课程教练</th><th>教室</th><th>可约人数</th><th>已预约</th><th>状态</th><th>操作</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} className={session.status === "cancelled" ? "row-muted" : ""}><td><div className="course-cell"><span style={{ background: session.course.color }}/><strong>{session.course.name}</strong></div><small>{session.course.course_type.toUpperCase()}</small></td><td><strong>{session.start_time}–{session.end_time}</strong><small>{session.session_date}</small></td><td>{session.teacher.name}</td><td>{session.room.name}</td><td><button className="capacity-link" type="button" onClick={() => setSelected(session)}>{session.available}</button></td><td>{session.booked_count}</td><td><Badge tone={session.status === "scheduled" ? "green" : "neutral"}>{session.status === "scheduled" ? "正常" : "已取消"}</Badge></td><td><button className="text-button" type="button" onClick={() => setSelected(session)}>预约名单 <Icon name="chevron" size={14}/></button></td></tr>)}</tbody></table></div>{sessions.length === 0 && <Empty>该日期暂无课程</Empty>}</section>}</>}
    {selected && <Modal wide title={`${selected.course.name} · 预约名单`} onClose={() => setSelected(null)}><div className="roster-summary"><div><span>上课时间</span><strong>{selected.session_date} {selected.start_time}–{selected.end_time}</strong></div><div><span>教练 / 教室</span><strong>{selected.teacher.name} / {selected.room.name}</strong></div><div><span>名额</span><strong>{selected.booked_count} / {selected.capacity}</strong></div>{canWrite && selected.status === "scheduled" && <button className="button button-primary" type="button" onClick={() => setBookingOpen(true)}><Icon name="plus" size={17}/>添加预约</button>}</div><div className="responsive-table"><table className="data-table roster-table"><thead><tr><th>会员</th><th>会员卡</th><th>预约时间</th><th>取消信息</th><th>状态</th><th>签到 / 操作</th></tr></thead><tbody>{selected.bookings?.map((booking) => <tr key={booking.id} className={booking.status === "cancelled" ? "row-muted" : ""}><td><div className="member-cell"><span className="user-avatar">{booking.member.name.slice(0, 1)}</span><div><strong>{booking.member.name}</strong><small>{booking.member.phone}</small></div></div></td><td>{booking.card_name || booking.member.cards?.find((card) => card.status === "active")?.product_name || "签到时匹配"}</td><td>{formatDateTime(booking.booked_at)}<small>{booking.source === "public" ? "会员自主" : "后台录入"}</small></td><td>{booking.cancelled_at ? <>{formatDateTime(booking.cancelled_at)}<small>{booking.cancelled_by}</small></> : "—"}</td><td><Badge tone={statusTones[booking.status]}>{statusLabels[booking.status]}</Badge></td><td><div className="table-actions">{canWrite && booking.status === "booked" && <><button className="button button-small" type="button" disabled={busy} onClick={() => void action(booking, "check_in")}>签到</button><button className="text-button" type="button" disabled={busy} onClick={() => void action(booking, "complete")}>完成消课</button><button className="text-button danger" type="button" disabled={busy} onClick={() => void action(booking, "cancel")}>取消</button><button className="text-button danger" type="button" disabled={busy} onClick={() => void action(booking, "no_show")}>爽约</button></>}{canWrite && booking.status === "checked_in" && <><button className="button button-small" type="button" disabled={busy} onClick={() => void action(booking, "complete")}>完成消课</button><button className="text-button" type="button" disabled={busy} onClick={() => void action(booking, "undo_check_in")}>取消签到</button></>}</div></td></tr>)}</tbody></table></div>{selected.bookings?.length === 0 && <Empty>还没有会员预约，点击“添加预约”开始。</Empty>}</Modal>}
    {bookingOpen && selected && <Modal title={`为 ${selected.course.name} 添加预约`} onClose={() => setBookingOpen(false)}><form className="form-grid" onSubmit={createBooking}><Field label="选择会员"><select required value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">按姓名或手机号选择</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>)}</select></Field><Field label="预约备注" hint="签到扣次时会自动选择当天有效且适用于该课程的会员卡。"><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{busy ? "预约中…" : "确认预约"}</button></form></Modal>}
  </div>;
}
