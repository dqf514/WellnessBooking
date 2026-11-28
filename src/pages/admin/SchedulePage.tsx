import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Field, Notice, PageHeader } from "@/components/AdminUI";
import { SessionEditor, type SessionEditorInitial } from "@/components/SessionEditor";
import { Badge, Icon, Modal, Spinner } from "@/components/UI";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, shortDate, today, weekStart, weekday } from "@/lib/date";
import { useCan } from "@/lib/permissions";
import { useSwipeNavigation } from "@/lib/useSwipeNavigation";
import type { Meta, Session } from "@/types";

export function SchedulePage() {
  const { type: routeType } = useParams();
  const type = ["group", "private", "workshop"].includes(routeType ?? "") ? routeType! : "group";
  const { local, language } = useLanguage();
  const canWrite = useCan("bookings.write");
  const canSeeLibrary = useCan("catalog.view");
  const [week, setWeek] = useState(weekStart(today()));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Session | null>(null);
  const [initial, setInitial] = useState<SessionEditorInitial>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDateOpen, setCopyDateOpen] = useState(false);
  const [copySource, setCopySource] = useState(addDays(weekStart(today()), -7));
  const [copyTarget, setCopyTarget] = useState(weekStart(today()));
  const [batchOpen, setBatchOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const scheduleSwipe = useSwipeNavigation(() => setWeek((current) => addDays(current, -7)), () => setWeek((current) => addDays(current, 7)));
  const typeLabel = type === "group" ? local("团课", "Group class") : type === "private" ? local("私教", "Personal training") : local("工作坊", "Workshop");
  const courseTypes = type === "private" ? "private,assessment" : type;

  const loadMeta = useCallback(async () => {
    const result = await apiFetch<Meta>("/api/admin/meta"); setMeta(result); return result;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: week, date_to: addDays(week, 6), course_type: courseTypes });
      const result = await apiFetch<{ items: Session[] }>(`/api/admin/sessions?${query}`);
      setSessions(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [week, courseTypes]);
  useEffect(() => { void loadMeta().catch((err) => setError(err.message)); }, [loadMeta]);
  useEffect(() => { void load(); }, [load]);

  function openCreate(day = week) {
    setEditing(null); setInitial({ session_date: day }); setEditorOpen(true);
  }
  async function copyWeek() {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ created: number; skipped: string[] }>("/api/admin/sessions/copy-week", { method: "POST", json: { week_start: week } });
      setMessage(local(`已复制 ${result.created} 节，跳过 ${result.skipped.length} 节`, `Copied ${result.created} classes; skipped ${result.skipped.length}`)); setCopyOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("复制失败", "Copy failed")); }
    finally { setBusy(false); }
  }
  function openCopyByDate() { setCopySource(addDays(week, -7)); setCopyTarget(week); setCopyDateOpen(true); setError(""); }
  async function copyByDate() {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ created: number; skipped: string[] }>("/api/admin/sessions/copy-dates", { method: "POST", json: { source_date: copySource, target_date: copyTarget, course_type: courseTypes } });
      setMessage(local(`已复制 ${result.created} 节，跳过 ${result.skipped.length} 节`, `Copied ${result.created} classes; skipped ${result.skipped.length}`)); setCopyDateOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("复制失败", "Copy failed")); }
    finally { setBusy(false); }
  }
  function toggleSession(id: number) { setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]); }
  async function batchSessions(action: "cancel" | "recycle") {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ cancelled: number; recycled: number; skipped: string[] }>("/api/admin/sessions/batch", { method: "POST", json: { session_ids: selected, action } });
      setMessage(local(`已取消 ${result.cancelled} 节，移入回收站 ${result.recycled} 节${result.skipped.length ? `，跳过 ${result.skipped.length} 节` : ""}`, `Cancelled ${result.cancelled} classes and moved ${result.recycled} to the recycle bin${result.skipped.length ? `, skipped ${result.skipped.length}` : ""}`));
      setBatchOpen(false); setSelected([]); await load();
    } catch (err) { setError(err instanceof Error ? err.message : local("批量删除失败", "Batch delete failed")); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader eyebrow="WEEKLY PLANNER" title={local(`${typeLabel}排课`, `${typeLabel} schedule`)} description={local("独立管理课种与每周场次；教练、教室和时间冲突会自动拦截。", "Manage class templates and weekly sessions with automatic instructor, room and time conflict checks.")} actions={<>{canSeeLibrary && <Link className="button button-outline" to="/admin/resources/courses">{local("课程库", "Class library")}</Link>}{canWrite && <><button className="button button-outline" disabled={busy} type="button" onClick={() => setCopyOpen(true)}>{local("复制上周课表", "Copy previous week")}</button><button className="button button-outline" disabled={busy} type="button" onClick={openCopyByDate}>{local("按日期复制", "Copy by date")}</button><button className="button button-primary" type="button" onClick={() => openCreate()}><Icon name="plus" size={18}/>{local("新建排课", "Schedule class")}</button></>}</>}/>
    <section className="schedule-toolbar"><div className="week-switch"><button className="icon-button" type="button" aria-label={local("上一周", "Previous week")} onClick={() => setWeek(addDays(week, -7))}>←</button><strong>{shortDate(week)} — {shortDate(addDays(week, 6))}</strong><button className="icon-button" type="button" aria-label={local("下一周", "Next week")} onClick={() => setWeek(addDays(week, 7))}>→</button><button className="text-button" type="button" onClick={() => setWeek(weekStart(today()))}>{local("本周", "This week")}</button></div><Badge tone="blue">{typeLabel}</Badge></section>
    {canWrite && <section className="schedule-bulk"><span>{selected.length ? local(`已选择 ${selected.length} 节课程`, `${selected.length} classes selected`) : local("勾选课程卡片可批量删除", "Tick the class cards to delete them in bulk")}</span><div><button className="text-button" type="button" disabled={!selected.length} onClick={() => setSelected([])}>{local("清空选择", "Clear selection")}</button><button className="button button-outline" disabled={!selected.length} type="button" onClick={() => { setBatchOpen(true); setError(""); }}>{local("批量删除", "Delete selected")}</button></div></section>}
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <div className="week-grid-scroll" {...scheduleSwipe}><section className="week-grid">{days.map((day) => { const daySessions = sessions.filter((item) => item.session_date === day); return <div className={`week-day ${day === today() ? "today" : ""}`} key={day}><header><span>{weekday(day, language === "en")}</span><strong>{shortDate(day)}</strong>{day === today() && <Badge tone="green">{local("今天", "Today")}</Badge>}</header><div className="week-day-classes">{daySessions.map((session) => <div className="schedule-class-wrap" key={session.id}>{canWrite && <input className="schedule-select" type="checkbox" aria-label={local(`选择 ${session.start_time} 的课程`, `Select the ${session.start_time} class`)} checked={selected.includes(session.id)} onChange={() => toggleSession(session.id)}/>}<button type="button" className={`schedule-class ${session.status === "cancelled" ? "cancelled" : ""}`} style={{ "--course-color": session.course.color } as React.CSSProperties} disabled={!canWrite} title={canWrite ? undefined : local("当前账号为只读，无法编辑排课", "Your account is view-only and cannot edit the schedule")} onClick={() => { if (!canWrite) return; setEditing(session); setEditorOpen(true); }}><span>{session.start_time}–{session.end_time}</span><strong>{local(session.course.name, session.course.name_en)}</strong><small>{local(session.teacher.name, session.teacher.name_en)}</small><small>{local(session.room.name, session.room.name_en)} · {session.room.floor}</small><div><Badge tone={session.available ? "green" : "red"}>{session.booked_count}/{session.capacity}</Badge>{session.status === "cancelled" && <Badge>{local("已取消", "Cancelled")}</Badge>}</div></button></div>)}{daySessions.length === 0 && <p className="no-class">{local("暂无排课", "No classes")}</p>}</div>{canWrite && <button className="add-class-link" type="button" onClick={() => openCreate(day)}><Icon name="plus" size={15}/>{local("添加排课", "Add class")}</button>}</div>; })}</section></div>}
    {editorOpen && meta && <SessionEditor key={editing?.id ?? `new-${initial.session_date}`} meta={meta} session={editing} initial={initial} courseType={type} onClose={() => setEditorOpen(false)} onSaved={load}/>}
    {copyOpen && <ModalShim title={local("复制上周课表", "Copy previous week")} description={local(`将 ${addDays(week, -7)} 至 ${addDays(week, -1)} 的课程复制到本周？冲突与重复课程会自动跳过。`, `Copy classes from ${addDays(week, -7)} through ${addDays(week, -1)}? Conflicts and duplicates will be skipped.`)} busy={busy} onClose={() => setCopyOpen(false)} onConfirm={() => void copyWeek()}/>}
    {copyDateOpen && <Modal title={local("按日期复制课表", "Copy schedule by date")} onClose={() => setCopyDateOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void copyByDate(); }}><p className="form-help">{local(`把来源日期当天的${typeLabel}课程原样复制到目标日期，常用于“复制上上周”“复制一个月前某几天”。重复课程与教练、教室冲突会自动跳过。`, `Copy the ${typeLabel} classes of a source date to a target date. Duplicates and instructor or room conflicts are skipped.`)}</p><Field label={local("来源日期", "Source date")}><input required type="date" value={copySource} onChange={(event) => setCopySource(event.target.value)}/></Field><Field label={local("目标日期", "Target date")}><input required type="date" value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}/></Field><button className="button button-primary button-full" disabled={busy} type="submit">{busy ? local("复制中…", "Copying…") : local("确认复制", "Copy classes")}</button><button className="button button-outline button-full" type="button" onClick={() => setCopyDateOpen(false)}>{local("取消", "Cancel")}</button></form></Modal>}
    {batchOpen && <Modal title={local("批量删除排课", "Delete classes in bulk")} onClose={() => setBatchOpen(false)}><div className="logout-confirmation"><p>{local(`已选择 ${selected.length} 节课程。取消课程会同时取消已预约的会员并发送短信提醒；移入回收站仅适用于还没有预约记录的课程。`, `${selected.length} classes selected. Cancelling also cancels the members' bookings and notifies them; the recycle bin only accepts classes without bookings.`)}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={() => setBatchOpen(false)}>{local("取消", "Cancel")}</button><button className="button button-outline" disabled={busy} type="button" onClick={() => void batchSessions("recycle")}>{local("移入回收站", "Move to recycle bin")}</button><button className="button button-danger-ghost" disabled={busy} type="button" onClick={() => void batchSessions("cancel")}>{local("取消课程", "Cancel classes")}</button></div></div></Modal>}
  </div>;
}

function ModalShim({ title, description, busy, onClose, onConfirm }: { title: string; description: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { local } = useLanguage();
  return <Modal title={title} onClose={onClose}><div className="logout-confirmation"><p>{description}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={onClose}>{local("取消", "Cancel")}</button><button className="button button-primary" disabled={busy} type="button" onClick={onConfirm}>{local("确认复制", "Copy classes")}</button></div></div></Modal>;
}
