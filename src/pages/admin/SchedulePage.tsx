import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Notice, PageHeader } from "@/components/AdminUI";
import { CourseLibraryModal } from "@/components/CourseLibraryModal";
import { SessionEditor, type SessionEditorInitial } from "@/components/SessionEditor";
import { Badge, Icon, Spinner } from "@/components/UI";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { addDays, shortDate, today, weekStart, weekday } from "@/lib/date";
import { useSwipeNavigation } from "@/lib/useSwipeNavigation";
import type { Meta, Session } from "@/types";

export function SchedulePage() {
  const { user } = useAuth();
  const { type: routeType } = useParams();
  const type = ["group", "private", "workshop"].includes(routeType ?? "") ? routeType! : "group";
  const { local, language } = useLanguage();
  const canWrite = ["admin", "frontdesk"].includes(user?.role ?? "");
  const [week, setWeek] = useState(weekStart(today()));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Session | null>(null);
  const [initial, setInitial] = useState<SessionEditorInitial>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const scheduleSwipe = useSwipeNavigation(() => setWeek((current) => addDays(current, -7)), () => setWeek((current) => addDays(current, 7)));
  const typeLabel = type === "group" ? local("团课", "Group class") : type === "private" ? local("私教", "Personal training") : local("工作坊", "Workshop");

  const loadMeta = useCallback(async () => {
    const result = await apiFetch<Meta>("/api/admin/meta"); setMeta(result); return result;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date_from: week, date_to: addDays(week, 6), course_type: type === "private" ? "private,assessment" : type });
      const result = await apiFetch<{ items: Session[] }>(`/api/admin/sessions?${query}`);
      setSessions(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : local("加载失败", "Loading failed")); }
    finally { setLoading(false); }
  }, [week, type]);
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

  return <div>
    <PageHeader eyebrow="WEEKLY PLANNER" title={local(`${typeLabel}排课`, `${typeLabel} schedule`)} description={local("独立管理课种与每周场次；教练、教室和时间冲突会自动拦截。", "Manage class templates and weekly sessions with automatic instructor, room and time conflict checks.")} actions={canWrite && <>{user?.role === "admin" && type !== "private" && <button className="button button-outline" type="button" onClick={() => setLibraryOpen(true)}>{local("课程库", "Class library")}</button>}<button className="button button-outline" disabled={busy} type="button" onClick={() => setCopyOpen(true)}>{local("复制上周课表", "Copy previous week")}</button><button className="button button-primary" type="button" onClick={() => openCreate()}><Icon name="plus" size={18}/>{local("新建排课", "Schedule class")}</button></>}/>
    <section className="schedule-toolbar"><div className="week-switch"><button className="icon-button" type="button" aria-label={local("上一周", "Previous week")} onClick={() => setWeek(addDays(week, -7))}>←</button><strong>{shortDate(week)} — {shortDate(addDays(week, 6))}</strong><button className="icon-button" type="button" aria-label={local("下一周", "Next week")} onClick={() => setWeek(addDays(week, 7))}>→</button><button className="text-button" type="button" onClick={() => setWeek(weekStart(today()))}>{local("本周", "This week")}</button></div><Badge tone="blue">{typeLabel}</Badge></section>
    {error && <Notice error message={error}/>} {message && <Notice message={message}/>}
    {loading ? <Spinner/> : <div className="week-grid-scroll" {...scheduleSwipe}><section className="week-grid">{days.map((day) => { const daySessions = sessions.filter((item) => item.session_date === day); return <div className={`week-day ${day === today() ? "today" : ""}`} key={day}><header><span>{weekday(day, language === "en")}</span><strong>{shortDate(day)}</strong>{day === today() && <Badge tone="green">{local("今天", "Today")}</Badge>}</header><div className="week-day-classes">{daySessions.map((session) => <button type="button" key={session.id} className={`schedule-class ${session.status === "cancelled" ? "cancelled" : ""}`} style={{ "--course-color": session.course.color } as React.CSSProperties} onClick={() => { if (!canWrite) return; setEditing(session); setEditorOpen(true); }}><span>{session.start_time}–{session.end_time}</span><strong>{local(session.course.name, session.course.name_en)}</strong><small>{local(session.teacher.name, session.teacher.name_en)}</small><small>{local(session.room.name, session.room.name_en)} · {session.room.floor}</small><div><Badge tone={session.available ? "green" : "red"}>{session.booked_count}/{session.capacity}</Badge>{session.status === "cancelled" && <Badge>{local("已取消", "Cancelled")}</Badge>}</div></button>)}{daySessions.length === 0 && <p className="no-class">{local("暂无排课", "No classes")}</p>}</div>{canWrite && <button className="add-class-link" type="button" onClick={() => openCreate(day)}><Icon name="plus" size={15}/>{local("添加排课", "Add class")}</button>}</div>; })}</section></div>}
    {editorOpen && meta && <SessionEditor key={editing?.id ?? `new-${initial.session_date}`} meta={meta} session={editing} initial={initial} courseType={type} onClose={() => setEditorOpen(false)} onSaved={load}/>}
    {libraryOpen && meta && <CourseLibraryModal meta={meta} initialType={type} onClose={() => setLibraryOpen(false)} onChanged={loadMeta}/>}
    {copyOpen && <ModalShim title={local("复制上周课表", "Copy previous week")} description={local(`将 ${addDays(week, -7)} 至 ${addDays(week, -1)} 的课程复制到本周？冲突与重复课程会自动跳过。`, `Copy classes from ${addDays(week, -7)} through ${addDays(week, -1)}? Conflicts and duplicates will be skipped.`)} busy={busy} onClose={() => setCopyOpen(false)} onConfirm={() => void copyWeek()}/>}
  </div>;
}

import { Modal } from "@/components/UI";
function ModalShim({ title, description, busy, onClose, onConfirm }: { title: string; description: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { local } = useLanguage();
  return <Modal title={title} onClose={onClose}><div className="logout-confirmation"><p>{description}</p><div className="logout-confirmation-actions"><button className="button button-outline" type="button" onClick={onClose}>{local("取消", "Cancel")}</button><button className="button button-primary" disabled={busy} type="button" onClick={onConfirm}>{local("确认复制", "Copy classes")}</button></div></div></Modal>;
}
