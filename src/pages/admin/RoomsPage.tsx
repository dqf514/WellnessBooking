import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { Badge, Icon, Modal, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, today } from "@/lib/date";
import { useSwipeNavigation } from "@/lib/useSwipeNavigation";
import type { Room, Session } from "@/types";

interface RoomReservation { id: number; title: string; start_time: string; end_time: string; usage_type: string; notes: string }
interface OverviewRoom extends Room { sessions: Session[]; reservations: RoomReservation[] }

function toMinutes(value: string) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }

export function RoomsPage() {
  const { user } = useAuth();
  const { admin: a, local } = useLanguage();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [date, setDate] = useState(today());
  const [rooms, setRooms] = useState<OverviewRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("管理层会议");
  const [start, setStart] = useState("15:00");
  const [end, setEnd] = useState("16:00");
  const [usage, setUsage] = useState("internal");
  const [repeat, setRepeat] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hours = Array.from({ length: 15 }, (_, index) => index + 8);
  const roomSwipe = useSwipeNavigation(() => setDate((current) => addDays(current, -1)), () => setDate((current) => addDays(current, 1)));

  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await apiFetch<{ rooms: OverviewRoom[] }>(`/api/admin/rooms/overview?date=${date}`); setRooms(result.rooms); }
    catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  function blockStyle(startTime: string, endTime: string) {
    const top = Math.max(0, (toMinutes(startTime) - 480) / 60 * 60);
    const height = Math.max(30, (toMinutes(endTime) - toMinutes(startTime)) / 60 * 60 - 3);
    return { top: `${top}px`, height: `${height}px` };
  }
  function openForm(id?: number) { setRoomId(String(id ?? rooms[0]?.id ?? "")); setFormOpen(true); }
  async function reserve(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiFetch<{ created: number; skipped: string[] }>("/api/admin/room-reservations", { method: "POST", json: { room_id: Number(roomId), title, reservation_date: date, start_time: start, end_time: end, usage_type: usage, repeat_weeks: repeat, notes } });
      setMessage(local(`已创建 ${result.created} 条教室预约${result.skipped.length ? `，跳过 ${result.skipped.length} 条冲突` : ""}`, `Created ${result.created} room reservations${result.skipped.length ? `; skipped ${result.skipped.length} conflicts` : ""}`)); setFormOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "预约失败"); }
    finally { setBusy(false); }
  }
  async function cancelReservation(id: number) {
    if (!window.confirm(a("取消这条内部教室预约？课程占用请在排课中心调整。"))) return;
    try { await apiFetch(`/api/admin/room-reservations/${id}`, { method: "DELETE" }); setMessage(a("教室预约已取消")); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "取消失败"); }
  }

  return <div><PageHeader eyebrow="SPACE AVAILABILITY" title={a("教室总览")} description={a("按 15 分钟精度查看课程与内部占用；课程、会议和企业活动联动同一教室日历。")} actions={canWrite && <button className="button button-primary" type="button" onClick={() => openForm()}><Icon name="plus" size={18}/>{a("预约教室")}</button>}/><section className="filter-panel"><Field label={a("查看日期")}><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></Field><button className="button button-outline" type="button" onClick={() => setDate(today())}>{a("今天")}</button><div className="room-legend"><span><i className="legend-course"/>{a("课程占用")}</span><span><i className="legend-internal"/>{a("内部使用")}</span><span><i className="legend-company"/>{a("企业活动")}</span></div></section>{error && <Notice error message={error}/>} {message && <Notice message={message}/>} {loading ? <Spinner/> : <div className="room-timeline-scroll" {...roomSwipe}><section className="room-timeline" style={{ "--room-count": rooms.length } as React.CSSProperties}><div className="time-axis"><header>{a("时间")}</header>{hours.map((hour) => <span key={hour} style={{ top: `${(hour - 8) * 60}px` }}>{String(hour).padStart(2, "0")}:00</span>)}</div><div className="room-columns">{rooms.map((room) => <div className="room-column" key={room.id}><header><div><strong>{local(room.name, room.name_en)}</strong><span>{local(room.name_en, `${room.capacity} ${a("人")}`)}</span></div>{canWrite && <button className="icon-button" type="button" aria-label={local(`预约${room.name}`, `Reserve ${room.name_en || room.name}`)} onClick={() => openForm(room.id)}><Icon name="plus" size={16}/></button>}</header><div className="room-slots">{hours.map((hour) => <i key={hour} style={{ top: `${(hour - 8) * 60}px` }}/>) }{room.sessions.map((session) => <div className="room-block course-block" key={`s-${session.id}`} style={{ ...blockStyle(session.start_time, session.end_time), "--course-color": session.course.color } as React.CSSProperties} title={`${session.start_time}-${session.end_time} ${local(session.course.name, session.course.name_en)}`}><span>{session.start_time}–{session.end_time}</span><strong>{local(session.course.name, session.course.name_en)}</strong><small>{local(session.teacher.name, session.teacher.name_en)} · {session.booked_count}/{session.capacity}</small></div>)}{room.reservations.map((reservation) => <div className={`room-block internal-block ${reservation.usage_type}`} key={`r-${reservation.id}`} style={blockStyle(reservation.start_time, reservation.end_time)}><span>{reservation.start_time}–{reservation.end_time}</span><strong>{a(reservation.title)}</strong><small>{a(reservation.usage_type)}</small>{canWrite && <button type="button" aria-label={local(`取消${reservation.title}`, `Cancel ${reservation.title}`)} onClick={() => void cancelReservation(reservation.id)}><Icon name="close" size={13}/></button>}</div>)}</div></div>)}</div></section></div>}
    {formOpen && <Modal title={a("预约教室")} onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={reserve}><Field label={a("教室")}><select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{local(room.name, room.name_en)}</option>)}</select></Field><Field label={a("用途名称")}><input required value={title} onChange={(event) => setTitle(event.target.value)}/></Field><Field label={a("开始时间")}><input required type="time" step={900} value={start} onChange={(event) => setStart(event.target.value)}/></Field><Field label={a("结束时间")}><input required type="time" step={900} value={end} onChange={(event) => setEnd(event.target.value)}/></Field><Field label={a("使用类别")}><select value={usage} onChange={(event) => setUsage(event.target.value)}><option value="internal">{a("内部使用")}</option><option value="company">{a("公司活动")}</option><option value="enterprise">{a("企业课")}</option></select></Field><Field label={a("每周重复")} hint={a("例如 4 表示连续 4 周同一时间")}><input min={1} max={52} type="number" value={repeat} onChange={(event) => setRepeat(Number(event.target.value))}/></Field><Field label={a("备注")} className="span-two"><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}/></Field><div className="span-two form-info"><Badge tone="blue">{a("冲突检测")}</Badge> {a("与课程或其他教室预约重叠的时间段会自动跳过。")}</div><button className="button button-primary button-full span-two" disabled={busy} type="submit">{busy ? a("提交中…") : a("确认预约")}</button></form></Modal>}
  </div>;
}
