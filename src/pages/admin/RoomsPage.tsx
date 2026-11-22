import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { RoomScheduleBoard, requestBoardFullscreen } from "@/components/RoomScheduleBoard";
import { SessionEditor } from "@/components/SessionEditor";
import { RecycleDeleteButton } from "@/components/RecycleDeleteButton";
import { Badge, Icon, Modal, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, downloadFile } from "@/lib/api";
import { addDays, today } from "@/lib/date";
import { useCan } from "@/lib/permissions";
import { useSwipeNavigation } from "@/lib/useSwipeNavigation";
import type { Meta, Room, Session } from "@/types";

interface RoomReservation { id: number; room_id: number; title: string; reservation_date: string; start_time: string; end_time: string; usage_type: string; notes: string }
interface OverviewRoom extends Room { sessions: Session[]; reservations: RoomReservation[] }
function toMinutes(value: string) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function plusHour(value: string) { return `${String(Math.min(23, Number(value.slice(0, 2)) + 1)).padStart(2, "0")}:${value.slice(3)}`; }
// 每小时占用的行高（像素）：格子越矮，一屏能看到的时段越多。
const HOUR_HEIGHT = 44;

export function RoomsPage() {
  const { local } = useLanguage();
  const canWrite = useCan("bookings.write");
  const [date, setDate] = useState(today());
  const [floor, setFloor] = useState("");
  const [rooms, setRooms] = useState<OverviewRoom[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<RoomReservation | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [newSession, setNewSession] = useState<{ room_id: string; session_date: string; start_time: string } | null>(null);
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const hours = Array.from({ length: 16 }, (_, index) => index + 7);
  const perPage = compact ? 2 : Math.max(1, rooms.length);
  const pageCount = Math.max(1, Math.ceil(rooms.length / perPage));
  const visibleRooms = useMemo(() => rooms.slice(page * perPage, (page + 1) * perPage), [rooms, page, perPage]);
  const floors = useMemo(() => Array.from(new Set(meta?.rooms.map((room) => room.floor) ?? [])).sort(), [meta]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const query = new URLSearchParams({ date }); if (floor) query.set("floor", floor); const result = await apiFetch<{ rooms: OverviewRoom[] }>(`/api/admin/rooms/overview?${query}`); setRooms(result.rooms); }
    catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [date, floor]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void apiFetch<Meta>("/api/admin/meta").then(setMeta).catch((err) => setError(err.message)); }, []);
  useEffect(() => { setPage(0); }, [date, floor, compact]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (page >= pageCount) setPage(pageCount - 1); }, [page, pageCount]);
  function previous() { if (compact && page > 0) setPage(page - 1); else setDate(addDays(date, -1)); }
  function next() { if (compact && page < pageCount - 1) setPage(page + 1); else setDate(addDays(date, 1)); }
  const roomSwipe = useSwipeNavigation(previous, next);

  // 教室太多时表格要横向滚动，顶部额外提供左右按键与教室色块，方便直接定位到有排课的教室。
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, width: 0, client: 0 });
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const update = () => {
      setScroll({ left: scroller.scrollLeft, width: scroller.scrollWidth, client: scroller.clientWidth });
      const strip = stripRef.current;
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const maxStrip = strip ? strip.scrollWidth - strip.clientWidth : 0;
      if (strip && maxScroll > 0 && maxStrip > 0) strip.scrollLeft = Math.round((scroller.scrollLeft / maxScroll) * maxStrip);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { scroller.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [rooms.length, compact, date, floor]);
  const columnWidth = useMemo(() => Math.max(60, scroll.width / Math.max(1, visibleRooms.length)), [scroll.width, visibleRooms.length]);
  const firstVisible = visibleRooms.length ? Math.max(0, Math.min(visibleRooms.length - 1, Math.floor(scroll.left / columnWidth))) : 0;
  const lastVisible = visibleRooms.length ? Math.max(0, Math.min(visibleRooms.length - 1, Math.ceil((scroll.left + scroll.client) / columnWidth) - 1)) : 0;
  const canScrollLeft = scroll.left > 4;
  const canScrollRight = scroll.left < scroll.width - scroll.client - 4;
  const leftHasCourse = rooms.slice(0, firstVisible).some((room) => room.sessions.length > 0);
  const rightHasCourse = rooms.slice(lastVisible + 1).some((room) => room.sessions.length > 0);
  function scrollRooms(direction: number) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollTo({ left: Math.min(Math.max(0, scroller.scrollLeft + direction * Math.max(140, scroller.clientWidth * 0.8)), max), behavior: "smooth" });
  }
  function jumpToRoom(index: number) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollTo({ left: Math.min(Math.max(0, index * columnWidth), max), behavior: "smooth" });
    const chip = stripRef.current?.children[index] as HTMLElement | undefined;
    chip?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  // 区块高度覆盖所在的整段时间区间，文字仍只有时间段与主题两行，并随格子大小自适应。
  function blockStyle(startTime: string, endTime: string) {
    const start = toMinutes(startTime);
    const end = Math.max(start + 30, toMinutes(endTime));
    const top = Math.max(0, (start - 420) / 60 * HOUR_HEIGHT);
    const height = Math.max(26, (end - start) / 60 * HOUR_HEIGHT);
    return { top: `${top}px`, height: `${height}px` };
  }
  function shiftDate(delta: number) { setDate(addDays(date, delta)); }
  // 打开全屏大屏：同时进入浏览器全屏，隐藏地址栏与工具栏，只留排课内容。
  function openBoard() {
    setBoardOpen(true);
    requestBoardFullscreen();
  }
  function openForm(id?: number, time = "15:00", reservation?: RoomReservation) {
    setEditingReservation(reservation ?? null);
    setRoomId(String(reservation?.room_id ?? id ?? rooms[0]?.id ?? ""));
    setTitle(reservation?.title ?? "管理层会议"); setStart(reservation?.start_time ?? time); setEnd(reservation?.end_time ?? plusHour(time));
    setUsage(reservation?.usage_type ?? "internal"); setNotes(reservation?.notes ?? ""); setRepeat(1); setFormOpen(true);
  }
  async function reserve(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { room_id: Number(roomId), title, reservation_date: editingReservation?.reservation_date ?? date, start_time: start, end_time: end, usage_type: usage, repeat_weeks: repeat, notes };
      const result = await apiFetch<{ created?: number; skipped?: string[] }>(editingReservation ? `/api/admin/room-reservations/${editingReservation.id}` : "/api/admin/room-reservations", { method: editingReservation ? "PATCH" : "POST", json: payload });
      setMessage(editingReservation ? local("教室预约已更新", "Room reservation updated") : local(`已创建 ${result.created} 条教室预约${result.skipped?.length ? `，跳过 ${result.skipped.length} 条冲突` : ""}`, `Created ${result.created} room reservations${result.skipped?.length ? `; skipped ${result.skipped.length} conflicts` : ""}`)); setFormOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("预约失败", "Booking failed")); }
    finally { setBusy(false); }
  }
  async function cancelReservation() {
    if (!editingReservation) return;
    setBusy(true);
    try { await apiFetch(`/api/admin/room-reservations/${editingReservation.id}`, { method: "DELETE" }); setMessage(local("教室预约已取消", "Room reservation cancelled")); setConfirmCancel(false); setFormOpen(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : local("取消失败", "Cancellation failed")); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader eyebrow="SPACE AVAILABILITY" title={local("教室总览", "Room availability")} description={local("点击空白时段预约教室，点击课程或占用即可编辑；冲突由系统统一校验。", "Select an empty time to reserve a room, or an existing class or reservation to edit. Conflicts are checked automatically.")} actions={<><button className="button button-outline" type="button" onClick={() => { const query = new URLSearchParams({ date }); if (floor) query.set("floor", floor); void downloadFile(`/api/admin/rooms/overview.pdf?${query}`, `wellness-rooms-${date}.pdf`).catch((err) => setError(err instanceof Error ? err.message : local("PDF 导出失败", "PDF export failed"))); }}><Icon name="download" size={17}/>{local("导出安排 PDF", "Export PDF")}</button><button className="button button-outline room-board-action" type="button" title={local("全屏排课表（公共大屏）", "Full screen schedule (public display)")} onClick={openBoard}><Icon name="expand" size={17}/>{local("全屏排课表", "Full screen")}</button>{canWrite && <button className="button button-primary" type="button" onClick={() => openForm()}><Icon name="plus" size={18}/>{local("预约教室", "Reserve room")}</button>}</>}/>
    <section className="filter-panel"><div className="field room-date-field"><span>{local("查看日期", "Date")}</span><div className="room-date-picker"><button className="icon-button" type="button" aria-label={local("前一天", "Previous day")} onClick={() => shiftDate(-1)}>←</button><input type="date" aria-label={local("查看日期", "Date")} value={date} onChange={(event) => setDate(event.target.value)}/><button className="icon-button" type="button" aria-label={local("后一天", "Next day")} onClick={() => shiftDate(1)}>→</button></div></div><Field label={local("楼层", "Floor")}><select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">{local("全部楼层", "All floors")}</option>{floors.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><button className="button button-outline" type="button" onClick={() => setDate(today())}>{local("今天", "Today")}</button><div className="room-legend"><span><i className="legend-course"/>{local("课程占用", "Classes")}</span><span><i className="legend-internal"/>{local("内部使用", "Internal")}</span><span><i className="legend-company"/>{local("企业活动", "Corporate")}</span></div></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {compact && <div className="room-date-navigation"><button className="icon-button" type="button" aria-label={local("上一页", "Previous")} onClick={previous}>←</button><strong>{local(`教室 ${page + 1} / ${pageCount} 页`, `Rooms ${page + 1} / ${pageCount}`)}</strong><button className="icon-button" type="button" aria-label={local("下一页", "Next")} onClick={next}>→</button></div>}
    {!loading && rooms.length > 0 && <div className="room-scroll-strip"><button className={`room-scroll-arrow ${leftHasCourse ? "has-course" : ""}`} type="button" disabled={!canScrollLeft} aria-label={local("向左滚动教室", "Scroll rooms left")} onClick={() => scrollRooms(-1)}>←</button><div className="room-scroll-track" ref={stripRef}>{rooms.map((room, index) => { const state = room.sessions.length ? "course" : room.reservations.length ? "reserved" : "free"; const label = local(room.name, room.name_en); const active = compact ? index >= page * perPage && index < (page + 1) * perPage : index >= firstVisible && index <= lastVisible; return <button key={room.id} type="button" className={`room-chip ${state} ${active ? "active" : ""}`} title={`${label} · ${room.floor} · ${local(`${room.sessions.length} 节课`, `${room.sessions.length} classes`)}`} onClick={() => { if (compact) setPage(Math.floor(index / perPage)); else jumpToRoom(index); }}>{label}</button>; })}</div><button className={`room-scroll-arrow ${rightHasCourse ? "has-course" : ""}`} type="button" disabled={!canScrollRight} aria-label={local("向右滚动教室", "Scroll rooms right")} onClick={() => scrollRooms(1)}>→</button><span className="room-scroll-hint">{local("色块：绿=有排课 橙=仅占用 灰=空闲", "Green=classes Amber=reserved Grey=free")}</span></div>}
    {loading ? <Spinner/> : <div className="room-timeline-frame" style={{ "--room-hour": `${HOUR_HEIGHT}px` } as React.CSSProperties}><div className="time-axis"><header>{local("时间", "Time")}</header><div className="time-axis-track">{hours.map((hour) => <span key={hour} style={{ top: `${(hour - 7) * HOUR_HEIGHT}px` }}>{String(hour).padStart(2, "0")}:00</span>)}</div></div><div className="room-timeline-scroll" ref={scrollRef} {...roomSwipe}><section className="room-columns" style={{ "--room-count": visibleRooms.length } as React.CSSProperties}>{visibleRooms.map((room) => <div className="room-column" key={room.id}><header title={`${local(room.name, room.name_en)} · ${room.floor} · ${room.capacity} ${local("人", "people")}`}><div><strong>{local(room.name, room.name_en)}</strong><span>{room.floor} · {room.capacity} {local("人", "people")}</span></div>{canWrite && <div className="room-header-actions"><button className="icon-button" type="button" aria-label={local(`在${room.name}排课`, `Schedule in ${room.name_en || room.name}`)} onClick={() => setNewSession({ room_id: String(room.id), session_date: date, start_time: "09:00" })}><Icon name="calendar" size={16}/></button><button className="icon-button" type="button" aria-label={local(`预约${room.name}`, `Reserve ${room.name_en || room.name}`)} onClick={() => openForm(room.id)}><Icon name="plus" size={16}/></button></div>}</header><div className="room-slots">{hours.map((hour) => { const time = `${String(hour).padStart(2, "0")}:00`; return <button className="room-slot-button" aria-label={local(`${room.name} ${time} 预约`, `${room.name_en || room.name} ${time} reserve`)} key={hour} style={{ top: `${(hour - 7) * HOUR_HEIGHT}px` }} disabled={!canWrite} onClick={() => openForm(room.id, time)}/>; })}{room.sessions.map((session) => <button type="button" className="room-block course-block" key={`s-${session.id}`} style={{ ...blockStyle(session.start_time, session.end_time), "--course-color": session.course.color } as React.CSSProperties} title={`${session.start_time}-${session.end_time} ${local(session.course.name, session.course.name_en)} · ${local(session.teacher.name, session.teacher.name_en)} · ${session.booked_count}/${session.capacity}`} disabled={!canWrite} onClick={() => { if (canWrite) setEditingSession(session); }}><span>{session.start_time}–{session.end_time}</span><strong>{local(session.course.name, session.course.name_en)}</strong></button>)}{room.reservations.map((reservation) => <button type="button" className={`room-block internal-block ${reservation.usage_type}`} key={`r-${reservation.id}`} style={blockStyle(reservation.start_time, reservation.end_time)} title={`${reservation.start_time}-${reservation.end_time} ${reservation.title}${reservation.notes ? ` · ${reservation.notes}` : ""}`} disabled={!canWrite} onClick={() => { if (canWrite) openForm(room.id, reservation.start_time, reservation); }}><span>{reservation.start_time}–{reservation.end_time}</span><strong>{reservation.title}</strong></button>)}</div></div>)}</section></div></div>}
    {compact && !loading && rooms.length > 0 && <section className="room-compact-list">{rooms.map((room) => <article className="room-compact-card" key={room.id}>
      <header><strong>{local(room.name, room.name_en)}</strong><span>{room.floor} · {room.capacity} {local("人", "people")} · {local(`${room.sessions.length} 节课`, `${room.sessions.length} classes`)}</span></header>
      <ul>{room.sessions.length === 0 && room.reservations.length === 0 && <li><button className="room-compact-row empty" type="button" disabled>{local("当日无安排", "Nothing scheduled")}</button></li>}
        {room.sessions.map((session) => <li key={`s-${session.id}`}><button className="room-compact-row" type="button" disabled={!canWrite} onClick={() => { if (canWrite) setEditingSession(session); }}><i/><strong>{session.start_time}–{session.end_time} {local(session.course.name, session.course.name_en)}</strong><small>{local(session.teacher.name, session.teacher.name_en)} · {session.booked_count}/{session.capacity}</small></button></li>)}
        {room.reservations.map((reservation) => <li key={`r-${reservation.id}`}><button className={`room-compact-row ${reservation.usage_type}`} type="button" disabled={!canWrite} onClick={() => { if (canWrite) openForm(room.id, reservation.start_time, reservation); }}><i/><strong>{reservation.start_time}–{reservation.end_time} {reservation.title}</strong><small>{reservation.usage_type === "company" ? local("公司活动", "Company") : reservation.usage_type === "enterprise" ? local("企业课", "Corporate") : local("内部使用", "Internal")}</small></button></li>)}
      </ul>
    </article>)}</section>}
    {formOpen && <Modal title={editingReservation ? local("编辑教室预约", "Edit room reservation") : local("预约教室", "Reserve room")} onClose={() => setFormOpen(false)}><form className="form-grid two-columns" onSubmit={reserve}><Field label={local("教室", "Room")}><select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{local(room.name, room.name_en)} · {room.floor}</option>)}</select></Field><Field label={local("用途名称", "Title")}><input required value={title} onChange={(event) => setTitle(event.target.value)}/></Field><Field label={local("开始时间", "Start time")}><input required type="time" step={900} value={start} onChange={(event) => setStart(event.target.value)}/></Field><Field label={local("结束时间", "End time")}><input required type="time" step={900} value={end} onChange={(event) => setEnd(event.target.value)}/></Field><Field label={local("使用类别", "Usage")}><select value={usage} onChange={(event) => setUsage(event.target.value)}><option value="internal">{local("内部使用", "Internal")}</option><option value="company">{local("公司活动", "Company")}</option><option value="enterprise">{local("企业课", "Corporate")}</option></select></Field>{!editingReservation && <Field label={local("每周重复", "Repeat weekly")} hint={local("例如 4 表示连续 4 周同一时间", "For example, 4 repeats for four weeks")}><input min={1} max={52} type="number" value={repeat} onChange={(event) => setRepeat(Number(event.target.value))}/></Field>}<Field label={local("备注", "Notes")} className="span-two"><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}/></Field><div className="span-two form-info"><Badge tone="blue">{local("冲突检测", "Conflict check")}</Badge> {local("与课程或其他教室预约重叠的时间段会自动拦截。", "Overlaps with classes and room reservations are blocked.")}</div><div className="form-footer span-two">{editingReservation && <div className="table-actions"><button className="button button-danger-ghost" type="button" onClick={() => setConfirmCancel(true)}>{local("取消预约", "Cancel reservation")}</button><RecycleDeleteButton resource="room-reservations" id={editingReservation.id} label={editingReservation.title} onDeleted={async () => { setFormOpen(false); await load(); }}/></div>}<span/><button className="button button-primary" disabled={busy} type="submit">{busy ? local("提交中…", "Saving…") : local("保存预约", "Save reservation")}</button></div></form></Modal>}
    {editingSession && meta && <SessionEditor meta={meta} session={editingSession} onClose={() => setEditingSession(null)} onSaved={load}/>}
    {newSession && meta && <SessionEditor meta={meta} initial={newSession} onClose={() => setNewSession(null)} onSaved={load}/>}
    {confirmCancel && <Modal title={local("取消教室预约", "Cancel room reservation")} onClose={() => setConfirmCancel(false)}><div className="logout-confirmation"><p>{local("取消后该时段会立即释放，操作记录将保留。", "The time slot will be released immediately. The audit record is preserved.")}</p><div className="logout-confirmation-actions"><button className="button button-outline" onClick={() => setConfirmCancel(false)} type="button">{local("返回", "Back")}</button><button className="button button-danger-ghost" disabled={busy} onClick={() => void cancelReservation()} type="button">{local("确认取消", "Confirm")}</button></div></div></Modal>}
    {boardOpen && <RoomScheduleBoard rooms={rooms} date={date} hours={hours} local={local} onPrev={() => shiftDate(-1)} onNext={() => shiftDate(1)} onClose={() => setBoardOpen(false)}/>}
  </div>;
}
